-- More things a flow can start from, "before" or "after", and two more questions it can ask.
--
-- New triggers (the "When" of a flow):
--   * lesson_expiry        a child's lesson period ends (09:00 on the expiry date)
--   * account_fee_expiry   a child's account fee ends
--   * club_fee_expiry      a child's Mirai Club fee ends
--   * lead_created         a new lead is added (the moment it was created)
--   * form_submitted       a marketing form is completed (the moment it was)
--
-- Message blocks
--   * can be set before OR after the event ("after": true on the block; it was always before), and
--   * may be as far as 60 days from it (it was 7 days), so "14 days before the fees end" works.
--
-- New conditions
--   * "hours": the child has this many lesson hours left or fewer. With "a regular class starts" this
--     gives "when a class starts and the child is nearly out of lessons, tell Lex".
--   * "stage": the lead is in one of these stages when the message is due, which makes "3 days after
--     a lead is added, if it is still New, tell me" possible.
--
-- A message that goes to a contact (see 20261016110000_automation_contacts.sql) is sent once per class,
-- not once per child: the children of the class are written into it as {child}.
--
-- Flows saved before this behave exactly as before.

-- ---------------------------------------------------------------------------------------------
-- The new triggers are allowed
-- ---------------------------------------------------------------------------------------------

alter table public.automation_flows drop constraint if exists automation_flows_trigger_type_check;
alter table public.automation_flows
  add constraint automation_flows_trigger_type_check
  check (trigger_type in (
    'class_start', 'replacement_start', 'trial_start', 'zoom_start',
    'lesson_expiry', 'account_fee_expiry', 'club_fee_expiry', 'lead_created', 'form_submitted'
  ));

-- ---------------------------------------------------------------------------------------------
-- The only thing about a form submission a flow may read: that it happened, and for which lead.
-- (The answers stay where they are.)
-- ---------------------------------------------------------------------------------------------

create or replace view automation.form_submissions as
select fs.id, fs.form_id, fs.lead_id, fs.status, fs.created_at
from public.form_submissions fs;

revoke all on automation.form_submissions from public, anon, authenticated;

-- The same classes as automation.class_reminders (which the n8n flow reads and which is left alone), two
-- days back as well so "after the class" messages still find the class, and also for children with no
-- number (a message for a contact does not need one).
create or replace view automation.class_events as
with days as (
  select (series.d)::date as class_date
  from generate_series(
    (now() at time zone 'Asia/Kuala_Lumpur')::date - 2,
    (now() at time zone 'Asia/Kuala_Lumpur')::date + 7,
    interval '1 day'
  ) as series(d)
),
weekly as (
  select
    sc.id as schedule_id,
    sc.classroom_id,
    c.name as classroom_name,
    sc.title,
    sc.start_time,
    days.class_date
  from days
  join public.schedules sc
    on sc.event_type = 'regular'
   and sc.status = 'active'
   and sc.day_of_week = extract(dow from days.class_date)::int
   and sc.start_recur is not null
   and sc.start_recur <= days.class_date
   and (sc.end_recur is null or days.class_date <= sc.end_recur)
  join public.classrooms c
    on c.id = sc.classroom_id
   and c.category = 'regular'
   and c.status = 'active'
  where extract(day from days.class_date) < 29
    and not exists (
      select 1
      from public.schedule_exceptions e
      where e.schedule_id = sc.id
        and e.exception_date = days.class_date
    )
),
people_in_class as (
  select
    'regular'::text as kind,
    w.schedule_id,
    w.classroom_id,
    w.classroom_name,
    w.title as class_title,
    w.start_time,
    w.class_date,
    p.student_id
  from weekly w
  join public.student_classroom_periods p
    on p.classroom_id = w.classroom_id
   and (p.start_date is null or p.start_date <= w.class_date)
   and (p.end_date is null or w.class_date < p.end_date)
  union all
  select
    'replacement'::text,
    sc.id,
    sc.classroom_id,
    null::text,
    sc.title,
    sc.start_time,
    sc.scheduled_date,
    sc.student_id
  from public.schedules sc
  join days on days.class_date = sc.scheduled_date
  where sc.event_type = 'replacement'
    and sc.status = 'active'
    and sc.student_id is not null
)
select
  'class1h:' || s.id || ':' || x.schedule_id || ':' || to_char(x.class_date, 'YYYY-MM-DD') as dedupe_key,
  x.kind,
  s.id as student_id,
  s.full_name as child_name,
  contact.parent_name,
  coalesce(contact.child_phone, contact.parent_phone) as phone,
  (contact.child_phone is not null) as phone_is_childs,
  x.classroom_name,
  x.class_title,
  x.class_date,
  ((x.class_date + x.start_time) at time zone 'Asia/Kuala_Lumpur') as starts_at,
  to_char(x.start_time, 'FMHH12:MI am') as start_label,
  x.schedule_id,
  x.classroom_id
from people_in_class x
join public.students s on s.id = x.student_id and s.is_active
left join automation.student_contacts contact on contact.student_id = s.id;

revoke all on automation.class_events from public, anon, authenticated;


-- ---------------------------------------------------------------------------------------------
-- The events. The columns up to "age" are what they were; hours_left, lead_status and group_key are
-- added at the end.
--   hours_left   lesson hours the child has left now (children only)
--   lead_status  the stage of the lead now (leads only)
--   group_key    events with the same key are one thing for a contact: all the children of one class
-- ---------------------------------------------------------------------------------------------

create or replace view automation.rule_events as
select
  'class_start'::text as trigger_type,
  'class:' || r.student_id || ':' || r.schedule_id || ':' || to_char(r.class_date, 'YYYY-MM-DD') as event_key,
  r.phone,
  r.parent_name,
  r.child_name,
  r.student_id,
  null::bigint as lead_id,
  r.starts_at,
  r.start_label,
  r.class_date,
  coalesce(r.classroom_name, r.class_title) as class_label,
  r.classroom_id,
  st.age as age,
  st.remaining_hours::numeric as hours_left,
  null::text as lead_status,
  'class:' || r.schedule_id || ':' || to_char(r.class_date, 'YYYY-MM-DD') as group_key
from automation.class_events r
left join automation.students st on st.id = r.student_id
where r.kind = 'regular'

union all

select
  'replacement_start',
  'replacement:' || r.student_id || ':' || r.schedule_id || ':' || to_char(r.class_date, 'YYYY-MM-DD'),
  r.phone,
  r.parent_name,
  r.child_name,
  r.student_id,
  null::bigint,
  r.starts_at,
  r.start_label,
  r.class_date,
  coalesce(r.classroom_name, r.class_title),
  r.classroom_id,
  st.age,
  st.remaining_hours::numeric,
  null::text,
  'replacement:' || r.schedule_id || ':' || to_char(r.class_date, 'YYYY-MM-DD')
from automation.class_events r
left join automation.students st on st.id = r.student_id
where r.kind = 'replacement'

union all

select
  'trial_start',
  'trial:' || t.id,
  t.phone,
  ld.full_name,
  t.child_name,
  t.student_id,
  t.lead_id,
  ((t.booking_date + t.start_time) at time zone 'Asia/Kuala_Lumpur'),
  to_char(t.start_time, 'FMHH12:MI am'),
  t.booking_date,
  coalesce(t.classroom_name, t.class_title),
  t.classroom_id,
  t.child_age,
  null::numeric,
  ld.status,
  'trial:' || to_char(t.booking_date, 'YYYY-MM-DD') || ':' || t.start_time || ':' || coalesce(t.classroom_id, 0)
from automation.trials t
left join automation.leads ld on ld.id = t.lead_id
where t.start_time is not null
  and t.phone ~ '^[0-9]{8,15}$'
  and t.booking_date between (now() at time zone 'Asia/Kuala_Lumpur')::date - 2
                         and (now() at time zone 'Asia/Kuala_Lumpur')::date + 7

union all

select
  'zoom_start',
  'zoom:' || z.id,
  ld.phone,
  ld.full_name,
  nullif(btrim(ld.children -> 0 ->> 'name'), ''),
  null::bigint,
  ld.id,
  z.starts_at,
  to_char(z.starts_at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI am'),
  (z.starts_at at time zone 'Asia/Kuala_Lumpur')::date,
  'Zoom meeting',
  null::bigint,
  case when (ld.children -> 0 ->> 'age') ~ '^[0-9]{1,2}$' then (ld.children -> 0 ->> 'age')::integer end,
  null::numeric,
  ld.status,
  'zoom:' || z.id
from automation.zoom_meetings z
join automation.leads ld on ld.id = z.lead_id
where ld.phone ~ '^[0-9]{8,15}$'
  and z.starts_at > now() - interval '8 days'
  and z.starts_at < now() + interval '8 days'

union all

-- A child's lesson period, account fee and Mirai Club fee end on a date; the event is 09:00 that day.
select
  'lesson_expiry',
  'lesson_expiry:' || s.id || ':' || to_char(s.lesson_expiry_date, 'YYYY-MM-DD'),
  coalesce(c.child_phone, c.parent_phone),
  c.parent_name,
  s.full_name,
  s.id,
  c.parent_lead_id,
  ((s.lesson_expiry_date + time '09:00') at time zone 'Asia/Kuala_Lumpur'),
  '9:00 am',
  s.lesson_expiry_date,
  'Lessons',
  s.classroom_id,
  s.age,
  s.remaining_hours::numeric,
  null::text,
  'lesson_expiry:' || s.id || ':' || to_char(s.lesson_expiry_date, 'YYYY-MM-DD')
from automation.students s
left join automation.student_contacts c on c.student_id = s.id
where s.is_active
  and s.student_type = 'regular'
  and s.lesson_expiry_date between (now() at time zone 'Asia/Kuala_Lumpur')::date - 62
                               and (now() at time zone 'Asia/Kuala_Lumpur')::date + 62

union all

select
  'account_fee_expiry',
  'account_fee_expiry:' || s.id || ':' || to_char(s.account_fee_expiry_date, 'YYYY-MM-DD'),
  coalesce(c.child_phone, c.parent_phone),
  c.parent_name,
  s.full_name,
  s.id,
  c.parent_lead_id,
  ((s.account_fee_expiry_date + time '09:00') at time zone 'Asia/Kuala_Lumpur'),
  '9:00 am',
  s.account_fee_expiry_date,
  'Account fee',
  s.classroom_id,
  s.age,
  s.remaining_hours::numeric,
  null::text,
  'account_fee_expiry:' || s.id || ':' || to_char(s.account_fee_expiry_date, 'YYYY-MM-DD')
from automation.students s
left join automation.student_contacts c on c.student_id = s.id
where s.is_active
  and s.student_type = 'regular'
  and s.account_fee_expiry_date between (now() at time zone 'Asia/Kuala_Lumpur')::date - 62
                                    and (now() at time zone 'Asia/Kuala_Lumpur')::date + 62

union all

select
  'club_fee_expiry',
  'club_fee_expiry:' || s.id || ':' || to_char(s.mirai_club_expiry_date, 'YYYY-MM-DD'),
  coalesce(c.child_phone, c.parent_phone),
  c.parent_name,
  s.full_name,
  s.id,
  c.parent_lead_id,
  ((s.mirai_club_expiry_date + time '09:00') at time zone 'Asia/Kuala_Lumpur'),
  '9:00 am',
  s.mirai_club_expiry_date,
  'Mirai Club fee',
  s.classroom_id,
  s.age,
  s.remaining_hours::numeric,
  null::text,
  'club_fee_expiry:' || s.id || ':' || to_char(s.mirai_club_expiry_date, 'YYYY-MM-DD')
from automation.students s
left join automation.student_contacts c on c.student_id = s.id
where s.is_active
  and s.student_type = 'regular'
  and s.mirai_club_expiry_date between (now() at time zone 'Asia/Kuala_Lumpur')::date - 62
                                   and (now() at time zone 'Asia/Kuala_Lumpur')::date + 62

union all

-- A new lead, from the moment it was added.
select
  'lead_created',
  'lead:' || l.id,
  l.phone,
  l.full_name,
  nullif(btrim(l.children -> 0 ->> 'name'), ''),
  null::bigint,
  l.id,
  l.created_at,
  to_char(l.created_at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI am'),
  (l.created_at at time zone 'Asia/Kuala_Lumpur')::date,
  'New lead',
  null::bigint,
  case when (l.children -> 0 ->> 'age') ~ '^[0-9]{1,2}$' then (l.children -> 0 ->> 'age')::integer end,
  null::numeric,
  l.status,
  'lead:' || l.id
from automation.leads l
where l.created_at > now() - interval '62 days'

union all

-- A completed marketing form, from the moment it was submitted, for the lead it made or found.
select
  'form_submitted',
  'form:' || fs.id,
  l.phone,
  l.full_name,
  nullif(btrim(l.children -> 0 ->> 'name'), ''),
  null::bigint,
  l.id,
  fs.created_at,
  to_char(fs.created_at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI am'),
  (fs.created_at at time zone 'Asia/Kuala_Lumpur')::date,
  'Form',
  null::bigint,
  case when (l.children -> 0 ->> 'age') ~ '^[0-9]{1,2}$' then (l.children -> 0 ->> 'age')::integer end,
  null::numeric,
  l.status,
  'form:' || fs.id
from automation.form_submissions fs
join automation.leads l on l.id = fs.lead_id
where fs.status = 'completed'
  and fs.created_at > now() - interval '62 days';

revoke all on automation.rule_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- A flow is checked on save: the new bounds and the new blocks
-- ---------------------------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------------------------
-- Walking a flow for one child (or lead)
-- ---------------------------------------------------------------------------------------------

drop function if exists automation.flow_messages(jsonb, integer, bigint);

create or replace function automation.flow_messages(
  p_graph jsonb,
  p_age integer,
  p_classroom bigint,
  p_hours numeric default null,
  p_stage text default null
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

revoke all on function automation.flow_messages(jsonb, integer, bigint, numeric, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The runner
-- ---------------------------------------------------------------------------------------------

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

      for ev in
        select *
        from automation.rule_events e
        where e.trigger_type = f.trigger_type
          and e.starts_at > now() - interval '62 days'
          and e.starts_at <= now() + interval '62 days'
      loop
        for m in
          select * from automation.flow_messages(f.graph, ev.age, ev.classroom_id, ev.hours_left, ev.lead_status)
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

-- ---------------------------------------------------------------------------------------------
-- "Send a test to my phone": the sample child also has lessons left, and {hours_left} is filled
-- ---------------------------------------------------------------------------------------------

create or replace function public.queue_automation_test(
  p_flow_id bigint,
  p_phone text,
  p_age integer default null,
  p_classroom_id bigint default null
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
  for m in select * from automation.flow_messages(f.graph, p_age, p_classroom_id, 2, 'new') loop
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
          '{hours_left}', '2'),
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

revoke all on function public.queue_automation_test(bigint, text, integer, bigint) from public, anon;
grant execute on function public.queue_automation_test(bigint, text, integer, bigint) to authenticated;
