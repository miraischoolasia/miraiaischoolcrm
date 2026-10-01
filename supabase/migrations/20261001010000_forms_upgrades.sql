-- Forms upgrades: editable link name, view counts, several children per
-- submission, a child phone, and no duplicate leads for the same phone.
--
-- * forms.slug is the editable part of the public link (/?form=<slug>). The
--   long uuid link keeps working.
-- * forms.view_count counts how often the public page was opened.
-- * submit_form now reads up to 3 children (answers keyed "<field id>#2" and
--   "#3" for the extra ones), takes the child phone, and when the phone already
--   belongs to a lead it adds the answers to that lead's notes instead of
--   creating a second lead.

alter table public.forms
  add column if not exists slug text,
  add column if not exists view_count bigint not null default 0;

alter table public.forms
  drop constraint if exists forms_slug_check;
alter table public.forms
  add constraint forms_slug_check check (
    slug is null
    or (
      char_length(slug) between 3 and 60
      and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      -- A uuid-shaped slug could be mistaken for another form's id.
      and slug !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  );

create unique index if not exists forms_slug_key on public.forms (slug);

alter table public.form_submissions
  add column if not exists lead_was_existing boolean not null default false;

-- Only real edits touch "updated on / by"; a view count bump must not.
drop trigger if exists forms_touch on public.forms;
create trigger forms_touch
before insert or update of name, fields, settings, is_published, slug on public.forms
for each row execute function public.forms_touch();

create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
as $$
  select case
    when d like '60%' and char_length(d) >= 10 then '0' || substr(d, 3)
    else d
  end
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) s;
$$;

revoke all on function public.normalize_phone(text) from public, anon;
grant execute on function public.normalize_phone(text) to authenticated;

-- The public page looks a form up by its link name or its id.
create or replace function public.get_public_form_by_key(p_form_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', f.id,
    'name', f.name,
    'fields', f.fields,
    'settings', f.settings
  )
  from public.forms f
  where f.is_published
    and (
      f.slug = lower(btrim(p_form_key))
      or f.id::text = lower(btrim(p_form_key))
    )
  limit 1;
$$;

revoke all on function public.get_public_form_by_key(text) from public;
grant execute on function public.get_public_form_by_key(text) to anon, authenticated;

create or replace function public.record_form_view(p_form_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.forms
  set view_count = view_count + 1
  where id = p_form_id
    and is_published;
$$;

revoke all on function public.record_form_view(uuid) from public;
grant execute on function public.record_form_view(uuid) to anon, authenticated;

create or replace function public.submit_form(
  p_form_id uuid,
  p_answers jsonb,
  p_honeypot text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.forms;
  v_field jsonb;
  v_type text;
  v_label text;
  v_map text;
  v_key text;
  v_raw jsonb;
  v_value text;
  v_item text;
  v_options jsonb;
  v_max_len int;
  v_clean jsonb := '[]'::jsonb;
  v_max_children int := 1;
  v_n int;
  v_has_block boolean;
  v_parent_name text;
  v_phone text;
  v_notes text[] := '{}';
  v_child_name text[] := array[null, null, null]::text[];
  v_child_age int[] := array[null, null, null]::int[];
  v_child_phone text[] := array[null, null, null]::text[];
  v_children jsonb := '[]'::jsonb;
  v_source_label text;
  v_source_id bigint;
  v_lead_id bigint;
  v_existing boolean := false;
  v_answer_lines text;
  v_age_ok boolean;
begin
  -- Bots fill hidden fields; pretend it worked and keep nothing.
  if coalesce(btrim(p_honeypot), '') <> '' then
    return jsonb_build_object('ok', true);
  end if;

  select * into v_form from public.forms where id = p_form_id and is_published;
  if not found then
    raise exception 'This form is not available.';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Invalid submission.';
  end if;

  if coalesce((v_form.settings ->> 'allowMoreChildren')::boolean, false) then
    v_max_children := 3;
  end if;

  for v_n in 1..v_max_children
  loop
    -- An extra child's block only counts when something was filled in.
    v_has_block := (v_n = 1);
    if v_n > 1 then
      for v_field in select * from jsonb_array_elements(v_form.fields)
      loop
        if (v_field ->> 'mapTo') in ('child_name', 'child_age', 'child_phone')
           and coalesce(btrim(p_answers ->> ((v_field ->> 'id') || '#' || v_n)), '') <> '' then
          v_has_block := true;
        end if;
      end loop;
    end if;

    if not v_has_block then
      continue;
    end if;

    for v_field in select * from jsonb_array_elements(v_form.fields)
    loop
      v_type := v_field ->> 'type';
      v_map := nullif(v_field ->> 'mapTo', '');

      if v_n > 1 and coalesce(v_map, '') not in ('child_name', 'child_age', 'child_phone') then
        continue;
      end if;

      v_label := coalesce(v_field ->> 'label', '');
      v_key := (v_field ->> 'id') || case when v_n > 1 then '#' || v_n else '' end;
      v_raw := p_answers -> v_key;
      v_options := coalesce(v_field -> 'options', '[]'::jsonb);
      v_value := null;

      if v_n > 1 then
        v_label := v_label || ' (child ' || v_n || ')';
      end if;

      if v_type = 'checkbox' then
        -- A list of picked options, stored as "A, B".
        if v_raw is not null and jsonb_typeof(v_raw) = 'array' then
          for v_item in select jsonb_array_elements_text(v_raw)
          loop
            if not (v_options ? v_item) then
              raise exception '% has an option that is not allowed.', v_label;
            end if;
            v_value := case when v_value is null then v_item else v_value || ', ' || v_item end;
          end loop;
        end if;
      elsif v_raw is not null and jsonb_typeof(v_raw) = 'string' then
        v_value := btrim(v_raw #>> '{}');
      end if;

      if v_value = '' then
        v_value := null;
      end if;

      if v_value is null then
        if coalesce((v_field ->> 'required')::boolean, false) then
          raise exception '% is required.', v_label;
        end if;
        continue;
      end if;

      v_max_len := case when v_type = 'long_text' then 4000 else 500 end;
      if char_length(v_value) > v_max_len then
        raise exception '% is too long.', v_label;
      end if;

      if v_type in ('dropdown', 'radio') and not (v_options ? v_value) then
        raise exception '% has an option that is not allowed.', v_label;
      end if;

      if v_type = 'email' and v_value !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception '% is not a valid email.', v_label;
      end if;

      if v_type = 'phone' and v_value !~ '^[0-9+()\-\s.]{6,30}$' then
        raise exception '% is not a valid phone number.', v_label;
      end if;

      if v_type = 'number' and v_value !~ '^-?[0-9]+(\.[0-9]+)?$' then
        raise exception '% must be a number.', v_label;
      end if;

      if v_map = 'child_age' then
        v_age_ok := case when v_value ~ '^[0-9]{1,2}$' then v_value::int >= 1 else false end;
        if not v_age_ok then
          raise exception '% must be a whole age from 1 to 99.', v_label;
        end if;
      end if;

      if v_type = 'date' and v_value !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception '% is not a valid date.', v_label;
      end if;

      v_clean := v_clean || jsonb_build_array(
        jsonb_build_object('id', v_key, 'label', v_label, 'value', v_value)
      );

      if v_map = 'parent_name' then
        v_parent_name := v_value;
      elsif v_map = 'phone' then
        v_phone := v_value;
      elsif v_map = 'child_name' then
        v_child_name[v_n] := v_value;
      elsif v_map = 'child_age' then
        v_child_age[v_n] := v_value::int;
      elsif v_map = 'child_phone' then
        v_child_phone[v_n] := v_value;
      elsif v_map = 'notes' then
        v_notes := v_notes || (v_label || ': ' || v_value);
      end if;
    end loop;
  end loop;

  if jsonb_array_length(v_clean) = 0 then
    raise exception 'The form is empty.';
  end if;

  if coalesce((v_form.settings ->> 'createLead')::boolean, true) then
    -- A lead needs at least a name or a phone to be worth following up.
    if v_parent_name is null and v_phone is null and v_child_name[1] is null then
      -- Nothing mapped: keep every answer in the notes instead.
      select array_agg((a ->> 'label') || ': ' || (a ->> 'value'))
      into v_notes
      from jsonb_array_elements(v_clean) a;
    end if;

    -- A lead stores a child only with an age; the rest goes into the notes.
    for v_n in 1..3
    loop
      if v_child_age[v_n] is not null then
        v_children := v_children || jsonb_build_array(
          jsonb_build_object(
            'name', coalesce(v_child_name[v_n], 'Child'),
            'age', v_child_age[v_n],
            'phone', v_child_phone[v_n]
          )
        );
      elsif v_child_name[v_n] is not null or v_child_phone[v_n] is not null then
        v_notes := v_notes || (
          'Child ' || v_n || ': '
          || concat_ws(' ', v_child_name[v_n], '(' || v_child_phone[v_n] || ')')
        );
      end if;
    end loop;

    -- The same phone is the same family: add to their lead, do not duplicate it.
    if v_phone is not null and public.normalize_phone(v_phone) <> '' then
      select id into v_lead_id
      from public.leads
      where public.normalize_phone(phone) = public.normalize_phone(v_phone)
      order by created_at desc
      limit 1;
    end if;

    if v_lead_id is not null then
      v_existing := true;
      select string_agg((a ->> 'label') || ': ' || (a ->> 'value'), E'\n')
      into v_answer_lines
      from jsonb_array_elements(v_clean) a;

      update public.leads
      set notes = concat_ws(
        E'\n\n',
        nullif(notes, ''),
        'Form "' || v_form.name || '" submitted again on ' || current_date || E':\n' || v_answer_lines
      )
      where id = v_lead_id;
    else
      v_source_label := left('Form: ' || btrim(v_form.name), 60);
      insert into public.lead_options (kind, label)
      values ('source', v_source_label)
      on conflict do nothing;

      select id into v_source_id
      from public.lead_options
      where kind = 'source'
        and lower(btrim(label)) = lower(btrim(v_source_label));

      insert into public.leads (full_name, phone, source_id, status, children, notes)
      values (
        v_parent_name,
        v_phone,
        v_source_id,
        'new',
        v_children,
        nullif(array_to_string(v_notes, E'\n'), '')
      )
      returning id into v_lead_id;
    end if;
  end if;

  insert into public.form_submissions (form_id, answers, lead_id, lead_was_existing)
  values (p_form_id, v_clean, v_lead_id, v_existing);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_form(uuid, jsonb, text) from public;
grant execute on function public.submit_form(uuid, jsonb, text) to anon, authenticated;
