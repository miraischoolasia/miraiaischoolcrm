-- Multi-page forms with skip logic, and saving progress page by page.
--
-- A form's pages live in forms.settings -> 'pages' (id, title, description and
-- rules); each field says which page it is on with 'pageId'. A form without
-- pages is one page, so every older form keeps working.
--
-- A page's rules read earlier answers and either jump forward to a later page
-- or end the form. form_visited_pages() walks that route the same way the
-- browser does, so submit_form only asks for the questions on pages the
-- person really went through, and only stores those answers.
--
-- Pressing "Next" saves what has been filled in so far as an incomplete
-- submission (status 'partial', no lead). The final submit completes the same
-- row and creates the lead.

alter table public.form_submissions
  add column if not exists status text not null default 'completed',
  add column if not exists session_token uuid,
  add column if not exists last_page int;

alter table public.form_submissions
  drop constraint if exists form_submissions_status_check;
alter table public.form_submissions
  add constraint form_submissions_status_check check (status in ('partial', 'completed'));

create unique index if not exists form_submissions_session_key
on public.form_submissions (form_id, session_token)
where session_token is not null;

-- The ids of the pages a person goes through, in order. Null means the form
-- has no pages (one page: everything counts).
create or replace function public.form_visited_pages(p_pages jsonb, p_answers jsonb)
returns text[]
language plpgsql
immutable
as $$
declare
  v_count int;
  v_idx int := 0;
  v_next int;
  v_visited text[] := '{}';
  v_page jsonb;
  v_rule jsonb;
  v_raw jsonb;
  v_value text;
  v_equal boolean;
  v_has boolean;
  v_hit boolean;
  v_target int;
begin
  if p_pages is null or jsonb_typeof(p_pages) <> 'array' or jsonb_array_length(p_pages) = 0 then
    return null;
  end if;

  v_count := jsonb_array_length(p_pages);

  while v_idx < v_count
  loop
    v_page := p_pages -> v_idx;
    v_visited := v_visited || (v_page ->> 'id');
    v_next := v_idx + 1;

    for v_rule in select * from jsonb_array_elements(coalesce(v_page -> 'rules', '[]'::jsonb))
    loop
      v_raw := p_answers -> (v_rule ->> 'fieldId');
      v_value := v_rule ->> 'value';
      v_equal := coalesce(jsonb_typeof(v_raw) = 'string' and (v_raw #>> '{}') = v_value, false);
      v_has := coalesce(jsonb_typeof(v_raw) = 'array' and v_raw ? v_value, false);

      v_hit := case v_rule ->> 'op'
        when 'is' then v_equal
        when 'is_not' then not v_equal
        when 'includes' then v_has
        when 'excludes' then not v_has
        else false
      end;

      if not v_hit then
        continue;
      end if;

      if v_rule -> 'action' ->> 'type' = 'end' then
        v_next := v_count;
        exit;
      elsif v_rule -> 'action' ->> 'type' = 'page' then
        select (t.ord - 1)::int into v_target
        from jsonb_array_elements(p_pages) with ordinality as t(page, ord)
        where t.page ->> 'id' = v_rule -> 'action' ->> 'pageId';

        -- Only forward: a jump to this page or an earlier one is ignored.
        if v_target is not null and v_target > v_idx then
          v_next := v_target;
          exit;
        end if;
      end if;
    end loop;

    v_idx := v_next;
  end loop;

  return v_visited;
end;
$$;

revoke all on function public.form_visited_pages(jsonb, jsonb) from public, anon;
grant execute on function public.form_visited_pages(jsonb, jsonb) to authenticated;

-- submit_form gets an optional token, so the final submit completes the
-- incomplete row saved along the way. The old three-argument version is
-- dropped first: two overloads would make a call without a token ambiguous.
drop function if exists public.submit_form(uuid, jsonb, text);

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
  v_answer_lines text;
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

-- Keeps what has been filled in so far, without checking it (the questions
-- ahead are still to come) and without making a lead. Only text for real
-- questions on this form is kept, cut to the same lengths submit_form allows.
create or replace function public.save_form_progress(
  p_form_id uuid,
  p_token uuid,
  p_answers jsonb,
  p_last_page int default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.forms;
  v_field jsonb;
  v_type text;
  v_n int;
  v_max int := 1;
  v_key text;
  v_raw jsonb;
  v_value text;
  v_label text;
  v_clean jsonb := '[]'::jsonb;
begin
  if p_token is null or p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    return;
  end if;

  select * into v_form from public.forms where id = p_form_id and is_published;
  if not found then
    return;
  end if;

  if coalesce((v_form.settings ->> 'allowMoreChildren')::boolean, false) then
    v_max := 3;
  end if;

  for v_n in 1..v_max
  loop
    for v_field in select * from jsonb_array_elements(v_form.fields)
    loop
      v_type := v_field ->> 'type';
      if v_type in ('image', 'text_block') then
        continue;
      end if;
      if v_n > 1 and coalesce(v_field ->> 'mapTo', '') not in ('child_name', 'child_age', 'child_phone') then
        continue;
      end if;

      v_key := (v_field ->> 'id') || case when v_n > 1 then '#' || v_n else '' end;
      v_raw := p_answers -> v_key;
      v_value := null;

      if v_raw is null then
        continue;
      elsif jsonb_typeof(v_raw) = 'array' then
        select string_agg(left(x, 200), ', ') into v_value
        from jsonb_array_elements_text(v_raw) x;
      elsif jsonb_typeof(v_raw) = 'string' then
        v_value := v_raw #>> '{}';
      end if;

      v_value := left(btrim(coalesce(v_value, '')), case when v_type = 'long_text' then 4000 else 500 end);
      if v_value = '' then
        continue;
      end if;

      v_label := coalesce(v_field ->> 'label', '') || case when v_n > 1 then ' (child ' || v_n || ')' else '' end;
      v_clean := v_clean || jsonb_build_array(
        jsonb_build_object('id', v_key, 'label', v_label, 'value', v_value)
      );
    end loop;
  end loop;

  if jsonb_array_length(v_clean) = 0 then
    return;
  end if;

  insert into public.form_submissions (form_id, answers, status, session_token, last_page)
  values (p_form_id, v_clean, 'partial', p_token, greatest(coalesce(p_last_page, 1), 1))
  on conflict (form_id, session_token) where session_token is not null
  do update
  set answers = excluded.answers,
      last_page = greatest(coalesce(form_submissions.last_page, 1), excluded.last_page)
  where form_submissions.status = 'partial';
end;
$$;

revoke all on function public.save_form_progress(uuid, uuid, jsonb, int) from public;
grant execute on function public.save_form_progress(uuid, uuid, jsonb, int) to anon, authenticated;
