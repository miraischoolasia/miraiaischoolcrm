-- A form submission whose phone already belongs to a lead is linked to that
-- lead without writing anything into its notes. Leads now show every form
-- submission linked to them (Edit lead > Form answers), so appending the
-- answers to the notes as well would only repeat them. Notes already written
-- by earlier submissions are left as they are.

create or replace function public.submit_form(
  p_form_id uuid,
  p_answers jsonb,
  p_honeypot text default '',
  p_token uuid default null
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
  v_age_ok boolean;
  v_pages jsonb;
  v_visited text[];
  v_first_page text;
  v_field_page text;
  v_completed boolean;
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

  -- Sending the same finished form twice (a double click) must not make a
  -- second lead.
  if p_token is not null then
    select true into v_completed
    from public.form_submissions
    where form_id = p_form_id and session_token = p_token and status = 'completed';
    if v_completed then
      return jsonb_build_object('ok', true);
    end if;
  end if;

  if coalesce((v_form.settings ->> 'allowMoreChildren')::boolean, false) then
    v_max_children := 3;
  end if;

  v_pages := coalesce(v_form.settings -> 'pages', '[]'::jsonb);
  v_visited := public.form_visited_pages(v_pages, p_answers);
  v_first_page := v_pages -> 0 ->> 'id';

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

      -- A question on a page the person skipped is not asked or stored. A
      -- field on a page that does not exist counts as being on the first one.
      if v_visited is not null then
        v_field_page := coalesce(nullif(v_field ->> 'pageId', ''), v_first_page);
        if not exists (
          select 1 from jsonb_array_elements(v_pages) p where p ->> 'id' = v_field_page
        ) then
          v_field_page := v_first_page;
        end if;
        if not (v_field_page = any(v_visited)) then
          continue;
        end if;
      end if;

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
      -- Nothing is copied into the lead: its "Form answers" in the CRM lists
      -- every submission linked to it, this one included.
      v_existing := true;
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

  -- Finish the incomplete row saved along the way, or start a finished one.
  if p_token is not null then
    update public.form_submissions
    set answers = v_clean,
        lead_id = v_lead_id,
        lead_was_existing = v_existing,
        status = 'completed',
        created_at = timezone('utc', now())
    where form_id = p_form_id and session_token = p_token and status = 'partial';
    if found then
      return jsonb_build_object('ok', true);
    end if;
  end if;

  insert into public.form_submissions (form_id, answers, lead_id, lead_was_existing, session_token)
  values (p_form_id, v_clean, v_lead_id, v_existing, p_token);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_form(uuid, jsonb, text, uuid) from public;
grant execute on function public.submit_form(uuid, jsonb, text, uuid) to anon, authenticated;
