-- Two more placeholders for flow messages:
--   {parent_phone}  the parent's phone as it is written in Malaysia: 0123456789 (a number that starts with
--                   60 gets a 0 instead; any other number is left as it is)
--   {child_lower}   the child's name in small letters with no spaces: Albee Ngu -> albeengu
-- For a message that goes to a contact (not the family), {parent_phone} is still the family's number.
-- When one message covers several children (one contact, one class), the values are listed with ", ".
-- Re-creates the runner and the test sender with the two new replacements; nothing else changes.

create or replace function automation.local_phone(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null then ''
    when p ~ '^60[0-9]+$' then '0' || substr(p, 3)
    else p
  end
$$;

create or replace function automation.compact_name(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(coalesce(p, ''), '[[:space:]]+', '', 'g'))
$$;

revoke all on function automation.local_phone(text) from public, anon, authenticated;
revoke all on function automation.compact_name(text) from public, anon, authenticated;

create or replace function automation.run_rules()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued integer := 0;
  added integer;
  is_paused boolean;
  f record;
  ev record;
  m record;
  g record;
  due timestamptz;
  expires timestamptz;
  contact_id bigint;
  to_phone text;
  to_name text;
  to_lead bigint;
  to_student bigint;
  child_text text;
  groups jsonb;
  gkey text;
  cooldown_days integer;
begin
  -- Reminders for events that already started are no longer useful.
  update public.automation_queue
  set status = 'expired'
  where status = 'pending'
    and expires_at is not null
    and expires_at < now();

  -- Finished rows older than 90 days are tidied away.
  delete from public.automation_queue
  where status in ('sent', 'skipped', 'expired')
    and created_at < now() - interval '90 days';

  select s.paused into is_paused from public.automation_settings s limit 1;
  if coalesce(is_paused, false) then
    return 0;
  end if;

  for f in
    select id, name, trigger_type, graph
    from public.automation_flows
    where enabled
    order by id
  loop
    begin
      -- Messages for a contact are gathered here and written once per group (one per class).
      groups := '{}'::jsonb;
      cooldown_days := coalesce(nullif(f.graph -> 'settings' ->> 'cooldownDays', '')::integer, 0);

      for ev in
        select *
        from automation.rule_events e
        where e.trigger_type = f.trigger_type
          and e.starts_at > now() - interval '62 days'
          and e.starts_at <= now() + interval '62 days'
      loop
        -- Stages this flow leaves alone (for example Converted and Lost).
        if ev.lead_status is not null
           and coalesce(f.graph -> 'settings' -> 'stopStages', '[]'::jsonb) ? ev.lead_status then
          continue;
        end if;

        -- The same person is not messaged again by this flow within the cooldown, unless it is the
        -- same event (the steps of one sequence).
        if cooldown_days > 0 and exists (
          select 1
          from public.automation_queue q
          where q.rule_key = 'flow_' || f.id
            and q.created_at > now() - make_interval(days => cooldown_days)
            and q.status in ('pending', 'sending', 'sent')
            and (q.lead_id = ev.lead_id or q.phone = ev.phone)
            and right(q.dedupe_key, char_length(ev.event_key)) <> ev.event_key
        ) then
          continue;
        end if;

        for m in
          select * from automation.flow_messages(
            f.graph, ev.age, ev.classroom_id, ev.hours_left, ev.lead_status,
            ev.source_id, ev.pic_id, ev.tag_ids, ev.form_ids, ev.keyword_id
          )
        loop
          if m.is_after then
            due := ev.starts_at + make_interval(mins => m.mins);
            -- Something told a day after it happened is not worth sending two days late.
            expires := due + interval '1 day';
          else
            -- Before the event: never once it has started.
            if ev.starts_at <= now() then
              continue;
            end if;
            due := ev.starts_at - make_interval(mins => m.mins);
            expires := ev.starts_at;
          end if;

          if due > now() + interval '3 hours' or due < now() - interval '1 hour' then
            continue;
          end if;

          -- Who gets it: the family of the event, or the contact named on the block.
          select nullif(x ->> 'contactId', '')::bigint into contact_id
          from jsonb_array_elements(coalesce(f.graph -> 'nodes', '[]'::jsonb)) x
          where x ->> 'id' = m.node_id
          limit 1;

          child_text := coalesce(nullif(btrim(ev.child_name), ''), 'your child');

          if contact_id is null then
            -- The family: needs a number to send to.
            if ev.phone is null or ev.phone !~ '^[0-9]{8,15}$' then
              continue;
            end if;
            -- A parent who wrote STOP is left alone.
            if exists (select 1 from public.automation_optouts o where o.phone = ev.phone) then
              continue;
            end if;
            insert into public.automation_queue
              (rule_key, rule_name, dedupe_key, phone, parent_name, child_name, lead_id, student_id,
               message, due_at, expires_at)
            values (
              'flow_' || f.id,
              f.name,
              'flow:' || f.id || ':' || m.node_id || ':' || ev.event_key,
              ev.phone,
              left(ev.parent_name, 200),
              left(ev.child_name, 200),
              ev.lead_id,
              ev.student_id,
              left(
                replace(replace(replace(replace(replace(replace(replace(replace(m.message_text,
                  '{parent_phone}', automation.local_phone(ev.phone)),
                  '{child_lower}', automation.compact_name(child_text)),
                  '{child}', child_text),
                  '{parent}', coalesce(nullif(btrim(ev.parent_name), ''), 'there')),
                  '{time}', ev.start_label),
                  '{date}', to_char(ev.class_date, 'Dy DD Mon')),
                  '{class}', coalesce(ev.class_label, 'class')),
                  '{hours_left}', coalesce(round(ev.hours_left)::bigint::text, '?')),
                4000),
              due,
              expires
            )
            on conflict (dedupe_key) do nothing;
            get diagnostics added = row_count;
            queued := queued + added;
          else
            select c.phone, c.name into to_phone, to_name
            from public.automation_contacts c
            where c.id = contact_id;
            if not found then
              raise exception 'A message is sent to a contact that no longer exists.';
            end if;
            gkey := 'flow:' || f.id || ':' || m.node_id || ':' || coalesce(ev.group_key, ev.event_key);
            if groups ? gkey then
              groups := jsonb_set(
                jsonb_set(
                  groups,
                  array[gkey, 'children'],
                  (groups -> gkey -> 'children') || to_jsonb(child_text)
                ),
                array[gkey, 'parents'],
                (groups -> gkey -> 'parents') || to_jsonb(coalesce(nullif(btrim(ev.parent_name), ''), ''))
              );
              groups := jsonb_set(
                groups,
                array[gkey, 'phones'],
                (groups -> gkey -> 'phones') || to_jsonb(coalesce(ev.phone, ''))
              );
            else
              groups := groups || jsonb_build_object(
                gkey,
                jsonb_build_object(
                  'phone', to_phone,
                  'name', to_name,
                  'template', m.message_text,
                  'due', due,
                  'expires', expires,
                  'time', ev.start_label,
                  'date', to_char(ev.class_date, 'Dy DD Mon'),
                  'class', coalesce(ev.class_label, 'class'),
                  'hours', ev.hours_left,
                  'children', jsonb_build_array(child_text),
                  'parents', jsonb_build_array(coalesce(nullif(btrim(ev.parent_name), ''), '')),
                  'phones', jsonb_build_array(coalesce(ev.phone, ''))
                )
              );
            end if;
          end if;
        end loop;
      end loop;

      for g in select key, value from jsonb_each(groups) loop
        insert into public.automation_queue
          (rule_key, rule_name, dedupe_key, phone, parent_name, child_name, lead_id, student_id,
           message, due_at, expires_at)
        values (
          'flow_' || f.id,
          f.name,
          g.key,
          g.value ->> 'phone',
          left(g.value ->> 'name', 200),
          left(
            (select string_agg(x, ', ') from jsonb_array_elements_text(g.value -> 'children') as t(x)),
            200
          ),
          null,
          null,
          left(
            replace(replace(replace(replace(replace(replace(replace(replace(g.value ->> 'template',
              '{parent_phone}', coalesce(
                (select string_agg(distinct automation.local_phone(x), ', ')
                 from jsonb_array_elements_text(g.value -> 'phones') as t(x) where x <> ''), '')),
              '{child_lower}', coalesce(
                (select string_agg(automation.compact_name(x), ', ')
                 from jsonb_array_elements_text(g.value -> 'children') as t(x)), '')),
              '{child}', (select string_agg(x, ', ') from jsonb_array_elements_text(g.value -> 'children') as t(x))),
              '{parent}', coalesce(
                nullif((select string_agg(distinct x, ', ') from jsonb_array_elements_text(g.value -> 'parents') as t(x) where x <> ''), ''),
                'there')),
              '{time}', g.value ->> 'time'),
              '{date}', g.value ->> 'date'),
              '{class}', g.value ->> 'class'),
              '{hours_left}', coalesce(g.value ->> 'hours', '?')),
            4000),
          (g.value ->> 'due')::timestamptz,
          (g.value ->> 'expires')::timestamptz
        )
        on conflict (dedupe_key) do nothing;
        get diagnostics added = row_count;
        queued := queued + added;
      end loop;

      update public.automation_flows set last_run_at = now(), last_error = null where id = f.id;
    exception when others then
      -- One broken flow must not stop the others; the page shows what went wrong.
      update public.automation_flows
      set last_run_at = now(), last_error = left(sqlerrm, 500)
      where id = f.id;
    end;
  end loop;

  return queued;
end;
$$;

create or replace function public.queue_automation_test(
  p_flow_id bigint,
  p_phone text,
  p_age integer default null,
  p_classroom_id bigint default null,
  p_hours numeric default 2,
  p_stage text default 'new',
  p_source bigint default null,
  p_pic bigint default null,
  p_tag bigint default null,
  p_form text default null,
  p_keyword bigint default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  f record;
  m record;
  digits text;
  waiting integer;
  added integer := 0;
  n integer;
  contact_name text;
begin
  if not (select public.is_admin()) then
    raise exception 'Only an admin can send a test.';
  end if;

  digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if digits !~ '^[0-9]{8,15}$' then
    raise exception 'Type the phone number with its country code, like 60123456789.';
  end if;
  if p_age is not null and p_age not between 0 and 30 then
    raise exception 'Ages must be whole numbers from 0 to 30.';
  end if;

  select id, name, graph into f from public.automation_flows where id = p_flow_id;
  if not found then
    raise exception 'This flow was not found. Save it first.';
  end if;

  select count(*) into waiting
  from public.automation_queue
  where rule_key like 'flow_test_%' and status = 'pending';
  if waiting >= 20 then
    raise exception 'There are already 20 test messages waiting. Approve or skip some first.';
  end if;

  -- The sample child has 2 lessons left and the lead is New, so "nearly out" and "still New" are Yes.
  for m in select * from automation.flow_messages(
      f.graph, p_age, p_classroom_id, p_hours, p_stage, p_source, p_pic,
      case when p_tag is null then null else array[p_tag] end,
      case when p_form is null then null else array[p_form] end,
      p_keyword
    ) loop
    select c.name into contact_name
    from jsonb_array_elements(coalesce(f.graph -> 'nodes', '[]'::jsonb)) x
    join public.automation_contacts c on c.id = nullif(x ->> 'contactId', '')::bigint
    where x ->> 'id' = m.node_id
    limit 1;

    insert into public.automation_queue
      (rule_key, rule_name, dedupe_key, phone, parent_name, child_name, message, due_at, expires_at)
    values (
      'flow_test_' || f.id,
      left('TEST · ' || f.name, 120),
      'test:' || f.id || ':' || m.node_id || ':' || gen_random_uuid()::text,
      digits,
      coalesce(contact_name, 'Mrs Lim'),
      'Ethan',
      left(
        case when contact_name is null then '[TEST] ' else '[TEST -> ' || contact_name || '] ' end ||
        replace(replace(replace(replace(replace(replace(replace(replace(m.message_text,
          '{parent_phone}', '0123456789'),
          '{child_lower}', 'ethan'),
          '{child}', 'Ethan'),
          '{parent}', 'Mrs Lim'),
          '{time}', '8:30 pm'),
          '{date}', to_char(now() at time zone 'Asia/Kuala_Lumpur', 'Dy DD Mon')),
          '{class}', 'Coder A'),
          '{hours_left}', coalesce(round(p_hours)::bigint::text, '?')),
        4000),
      now(),
      now() + interval '1 hour'
    );
    get diagnostics n = row_count;
    added := added + n;
  end loop;

  return added;
end;
$$;
