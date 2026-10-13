-- Source keywords as a trigger: "a lead comes in with this source keyword".
--
-- A source keyword is a rule of the WhatsApp inbox: when the parent's first message contains a phrase,
-- the lead gets that rule's source and tags. Until now the lead did not remember WHICH rule it came
-- from. leads.source_rule_id keeps it (set when the lead is made from that first message), and a flow
-- can ask about it with a "Source keyword" block, which the simple editor shows as the trigger
-- "A lead comes in with a source keyword".
--
-- Leads made before this change have no keyword and never match such a block.
-- The rest of this file re-creates the pieces that learn the new question: the flow check on save,
-- the flow walker, the events of a lead, the runner and the test sender.

alter table public.leads
  add column if not exists source_rule_id bigint references public.lead_source_rules (id) on delete set null;

create index if not exists leads_source_rule_idx on public.leads (source_rule_id) where source_rule_id is not null;


create or replace function public.automation_flows_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  g jsonb := new.graph;
  nodes jsonb;
  edges jsonb;
  n jsonb;
  e jsonb;
  ids text[] := array['trigger'];
  nid text;
  from_type text;
  lim text;
begin
  if g is null or jsonb_typeof(g) <> 'object' then
    raise exception 'The flow is not valid.';
  end if;
  nodes := coalesce(g -> 'nodes', '[]'::jsonb);
  edges := coalesce(g -> 'edges', '[]'::jsonb);
  if jsonb_typeof(nodes) <> 'array' or jsonb_typeof(edges) <> 'array' then
    raise exception 'The flow is not valid.';
  end if;
  if jsonb_array_length(nodes) > 40 then
    raise exception 'A flow can have up to 40 blocks.';
  end if;
  if jsonb_array_length(edges) > 80 then
    raise exception 'A flow can have up to 80 lines.';
  end if;

  -- Flow settings (optional): stages to leave alone, and days before the same person is messaged again.
  if g -> 'settings' is not null and jsonb_typeof(g -> 'settings') <> 'null' then
    if jsonb_typeof(g -> 'settings') <> 'object' then
      raise exception 'The flow settings are not valid.';
    end if;
    if g -> 'settings' -> 'stopStages' is not null and (
         jsonb_typeof(g -> 'settings' -> 'stopStages') <> 'array'
         or jsonb_array_length(g -> 'settings' -> 'stopStages') > 6
         or exists (
           select 1 from jsonb_array_elements(g -> 'settings' -> 'stopStages') s
           where jsonb_typeof(s) <> 'string'
              or (s #>> '{}') not in ('new', 'contacted', 'trial_scheduled', 'trial_completed', 'converted', 'lost')
         )
       ) then
      raise exception 'The stages to leave alone are not valid.';
    end if;
    if g -> 'settings' ->> 'cooldownDays' is not null and (
         (g -> 'settings' ->> 'cooldownDays') !~ '^[0-9]{1,3}$'
         or (g -> 'settings' ->> 'cooldownDays')::integer > 365
       ) then
      raise exception 'The days before messaging the same person again must be 0 to 365.';
    end if;
  end if;

  for n in select value from jsonb_array_elements(nodes) as t(value) loop
    nid := n ->> 'id';
    if nid is null or nid !~ '^[A-Za-z0-9_-]{1,20}$' or nid = any (ids) then
      raise exception 'A block has a missing or repeated id.';
    end if;
    ids := ids || nid;

    if n ->> 'type' = 'message' then
      if coalesce(n ->> 'mins', '') !~ '^[0-9]{1,5}$' or (n ->> 'mins')::integer not between 3 and 86400 then
        raise exception 'A message must be set 3 minutes to 60 days before or after.';
      end if;
      if n -> 'after' is not null and jsonb_typeof(n -> 'after') not in ('boolean', 'null') then
        raise exception 'A message must say whether it goes before or after.';
      end if;
      if char_length(btrim(coalesce(n ->> 'text', ''))) not between 1 and 3000 then
        raise exception 'Every message needs text (up to 3000 characters).';
      end if;
    elsif n ->> 'type' = 'condition' then
      if n ->> 'kind' = 'age' then
        foreach lim in array array['min', 'max'] loop
          if n ->> lim is not null and ((n ->> lim) !~ '^[0-9]{1,2}$' or (n ->> lim)::integer > 30) then
            raise exception 'Ages must be whole numbers from 0 to 30.';
          end if;
        end loop;
        if n ->> 'min' is null and n ->> 'max' is null then
          raise exception 'An age condition needs a lowest or a highest age.';
        end if;
        if n ->> 'min' is not null and n ->> 'max' is not null and (n ->> 'min')::integer > (n ->> 'max')::integer then
          raise exception 'The lowest age is higher than the highest age.';
        end if;
      elsif n ->> 'kind' = 'classroom' then
        if jsonb_typeof(n -> 'ids') <> 'array'
           or jsonb_array_length(n -> 'ids') not between 1 and 50
           or exists (select 1 from jsonb_array_elements(n -> 'ids') x where jsonb_typeof(x) <> 'number') then
          raise exception 'A class condition needs at least one class.';
        end if;
      elsif n ->> 'kind' = 'hours' then
        if coalesce(n ->> 'max', '') !~ '^[0-9]{1,3}$' or (n ->> 'max')::integer > 500 then
          raise exception 'Hours left must be a whole number from 0 to 500.';
        end if;
      elsif n ->> 'kind' = 'stage' then
        if jsonb_typeof(n -> 'stages') <> 'array' then
          raise exception 'A stage condition needs at least one stage.';
        end if;
        if jsonb_array_length(n -> 'stages') not between 1 and 6
           or exists (
             select 1 from jsonb_array_elements(n -> 'stages') s
             where jsonb_typeof(s) <> 'string'
                or (s #>> '{}') not in ('new', 'contacted', 'trial_scheduled', 'trial_completed', 'converted', 'lost')
           ) then
          raise exception 'A stage condition needs at least one stage.';
        end if;
      elsif n ->> 'kind' in ('source', 'tag', 'pic', 'keyword') then
        if jsonb_typeof(n -> 'ids') <> 'array'
           or jsonb_array_length(n -> 'ids') not between 1 and 50
           or exists (
             select 1 from jsonb_array_elements(n -> 'ids') x
             where jsonb_typeof(x) <> 'string' or (x #>> '{}') !~ '^[0-9]{1,12}$'
           ) then
          raise exception 'A condition needs at least one choice ticked.';
        end if;
      elsif n ->> 'kind' = 'form' then
        if jsonb_typeof(n -> 'ids') <> 'array'
           or jsonb_array_length(n -> 'ids') not between 1 and 50
           or exists (
             select 1 from jsonb_array_elements(n -> 'ids') x
             where jsonb_typeof(x) <> 'string'
                or (x #>> '{}') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
           ) then
          raise exception 'A form condition needs at least one form ticked.';
        end if;
      else
        raise exception 'A condition has an unknown kind.';
      end if;
    else
      raise exception 'A block has an unknown type.';
    end if;
  end loop;

  for e in select value from jsonb_array_elements(edges) as t(value) loop
    if not (e ->> 'from') = any (ids) or not (e ->> 'to') = any (ids) or (e ->> 'to') = 'trigger' then
      raise exception 'A line connects to a block that does not exist.';
    end if;
    if e ->> 'from' = 'trigger' then
      from_type := 'trigger';
    else
      select x ->> 'type' into from_type
      from jsonb_array_elements(nodes) x
      where x ->> 'id' = e ->> 'from'
      limit 1;
    end if;
    -- The trigger and a message have one way out ("out"); a condition has Yes and No.
    if (from_type in ('trigger', 'message') and coalesce(e ->> 'port', '') <> 'out')
       or (from_type = 'condition' and coalesce(e ->> 'port', '') not in ('yes', 'no')) then
      raise exception 'A line starts from an unknown point.';
    end if;
  end loop;

  return new;
end;
$$;

drop function if exists automation.flow_messages(jsonb, integer, bigint, numeric, text, bigint, bigint, bigint[], text[]);

create or replace function automation.flow_messages(
  p_graph jsonb,
  p_age integer,
  p_classroom bigint,
  p_hours numeric default null,
  p_stage text default null,
  p_source bigint default null,
  p_pic bigint default null,
  p_tags bigint[] default null,
  p_forms text[] default null,
  p_keyword bigint default null
)
returns table (node_id text, mins integer, message_text text, is_after boolean)
language plpgsql
stable
set search_path = ''
as $$
declare
  stack text[] := array['trigger'];
  seen text[] := '{}';
  cur text;
  node jsonb;
  edge jsonb;
  port text;
  lo integer;
  hi integer;
begin
  while coalesce(array_length(stack, 1), 0) > 0 loop
    cur := stack[1];
    stack := coalesce(stack[2:array_length(stack, 1)], '{}');
    if cur = any (seen) then
      continue;
    end if;
    seen := seen || cur;

    if cur = 'trigger' then
      port := 'out';
    else
      select x into node
      from jsonb_array_elements(coalesce(p_graph -> 'nodes', '[]'::jsonb)) x
      where x ->> 'id' = cur
      limit 1;
      if node is null then
        continue;
      end if;

      if node ->> 'type' = 'message' then
        -- This message is queued, and the walk goes on to whatever follows it.
        node_id := cur;
        mins := (node ->> 'mins')::integer;
        message_text := node ->> 'text';
        is_after := coalesce((node ->> 'after')::boolean, false);
        return next;
        port := 'out';
      elsif node ->> 'kind' = 'age' then
        -- A condition: an unknown age or classroom never matches, so the child goes down No.
        lo := (node ->> 'min')::integer;
        hi := (node ->> 'max')::integer;
        port := case
          when p_age is not null and (lo is null or p_age >= lo) and (hi is null or p_age <= hi) then 'yes'
          else 'no'
        end;
      elsif node ->> 'kind' = 'classroom' then
        port := case
          when p_classroom is not null
            and exists (
              select 1 from jsonb_array_elements(node -> 'ids') i where (i #>> '{}')::bigint = p_classroom
            ) then 'yes'
          else 'no'
        end;
      elsif node ->> 'kind' = 'hours' then
        -- Lessons left: an unknown number never matches.
        port := case
          when p_hours is not null and p_hours <= (node ->> 'max')::numeric then 'yes'
          else 'no'
        end;
      elsif node ->> 'kind' = 'stage' then
        port := case
          when p_stage is not null
            and exists (select 1 from jsonb_array_elements_text(node -> 'stages') s where s = p_stage) then 'yes'
          else 'no'
        end;
      elsif node ->> 'kind' = 'source' then
        port := case
          when p_source is not null
            and exists (select 1 from jsonb_array_elements_text(node -> 'ids') i where i = p_source::text) then 'yes'
          else 'no'
        end;
      elsif node ->> 'kind' = 'pic' then
        port := case
          when p_pic is not null
            and exists (select 1 from jsonb_array_elements_text(node -> 'ids') i where i = p_pic::text) then 'yes'
          else 'no'
        end;
      elsif node ->> 'kind' = 'keyword' then
        port := case
          when p_keyword is not null
            and exists (select 1 from jsonb_array_elements_text(node -> 'ids') i where i = p_keyword::text) then 'yes'
          else 'no'
        end;
      elsif node ->> 'kind' = 'tag' then
        port := case
          when p_tags is not null
            and exists (
              select 1 from jsonb_array_elements_text(node -> 'ids') i
              join unnest(p_tags) t on t::text = i
            ) then 'yes'
          else 'no'
        end;
      elsif node ->> 'kind' = 'form' then
        port := case
          when p_forms is not null
            and exists (
              select 1 from jsonb_array_elements_text(node -> 'ids') i
              join unnest(p_forms) t on lower(t) = lower(i)
            ) then 'yes'
          else 'no'
        end;
      else
        port := 'no';
      end if;
    end if;

    for edge in select value from jsonb_array_elements(coalesce(p_graph -> 'edges', '[]'::jsonb)) as t(value) loop
      if edge ->> 'from' = cur and edge ->> 'port' = port then
        stack := stack || (edge ->> 'to');
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function automation.flow_messages(jsonb, integer, bigint, numeric, text, bigint, bigint, bigint[], text[], bigint)
  from public, anon, authenticated;


create or replace view automation.rule_events as
select
  b.trigger_type,
  b.event_key,
  b.phone,
  b.parent_name,
  b.child_name,
  b.student_id,
  b.lead_id,
  b.starts_at,
  b.start_label,
  b.class_date,
  b.class_label,
  b.classroom_id,
  b.age,
  b.hours_left,
  b.lead_status,
  b.group_key,
  x.source_id,
  x.pic_id,
  x.tag_ids,
  x.form_ids,
  x.keyword_id
from automation.rule_events_base b
left join lateral (
  select
    l.source_id,
    l.pic_id,
    l.source_rule_id as keyword_id,
    coalesce(l.tag_ids, '{}')::bigint[] as tag_ids,
    coalesce(
      (
        select array_agg(distinct fs.form_id::text)
        from public.form_submissions fs
        where fs.lead_id = l.id and fs.status = 'completed'
      ),
      '{}'::text[]
    ) as form_ids
  from public.leads l
  where l.id = coalesce(
    b.lead_id,
    (
      select par.lead_id
      from public.people ch
      join public.people par on par.id = ch.parent_id
      where ch.student_id = b.student_id and par.lead_id is not null
      limit 1
    )
  )
) x on true;

revoke all on automation.rule_events from public, anon, authenticated;

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
                replace(replace(replace(replace(replace(replace(m.message_text,
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
                  'parents', jsonb_build_array(coalesce(nullif(btrim(ev.parent_name), ''), ''))
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
            replace(replace(replace(replace(replace(replace(g.value ->> 'template',
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

revoke all on function automation.run_rules() from public, anon, authenticated;

drop function if exists public.queue_automation_test(bigint, text, integer, bigint, numeric, text, bigint, bigint, bigint, text);

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
        replace(replace(replace(replace(replace(replace(m.message_text,
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

revoke all on function public.queue_automation_test(bigint, text, integer, bigint, numeric, text, bigint, bigint, bigint, text, bigint)
from public, anon;
grant execute on function public.queue_automation_test(bigint, text, integer, bigint, numeric, text, bigint, bigint, bigint, text, bigint)
to authenticated;

