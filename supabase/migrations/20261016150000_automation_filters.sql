-- Filters, stops, opt-outs, numbers and four more triggers for the automations.
--
-- Filters (new blocks)   Source, Tag, PIC and Form: "if the lead came from source A", "has tag B",
--                        "handled by C", "filled in form D". Children are checked through their parent's
--                        lead. Ticked ids are kept as text in the block ("ids": ["3", "7"]).
-- Flow settings          graph.settings = { stopStages: [...], cooldownDays: n }
--                        stopStages   a lead in one of these stages gets nothing from this flow
--                        cooldownDays the same person gets nothing from this flow again within n days,
--                                     unless it is the same event (the steps of one sequence)
-- Opt-outs               a parent who writes just "STOP" (or the same in Chinese or Malay) is never
--                        messaged by an automation again; an admin can allow them again.
-- Results                public.automation_flow_stats(): per flow, how many messages were queued, sent,
--                        skipped, and how many of the parents wrote back after one was sent.
-- New triggers           trial_booked    a trial class is booked (the moment it was booked)
--                        package_start   a package is bought or renewed (the moment it was saved)
--                        lead_idle       a lead has not been touched (from its last change)
--                        task_due        a task on a lead is due (09:00 on the due date)

-- ---------------------------------------------------------------------------------------------
-- Opt-outs
-- ---------------------------------------------------------------------------------------------

create table if not exists public.automation_optouts (
  -- Digits only, with the country code.
  phone text primary key check (phone ~ '^[0-9]{8,15}$'),
  reason text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now()
);

alter table public.automation_optouts enable row level security;

drop policy if exists "automation_optouts_select_permitted" on public.automation_optouts;
drop policy if exists "automation_optouts_delete_admin" on public.automation_optouts;

create policy "automation_optouts_select_permitted"
on public.automation_optouts
for select to authenticated
using ((select public.has_permission('leads')));

create policy "automation_optouts_delete_admin"
on public.automation_optouts
for delete to authenticated
using ((select public.is_admin()));

revoke all on public.automation_optouts from public, anon, authenticated;
grant select, delete on public.automation_optouts to authenticated;

-- The chat function gets one more argument: the parent's message was just "STOP".
drop function if exists public.record_chat_message(text, bigint, bigint, text, timestamptz, text, text);

create or replace function public.record_chat_message(
  p_key text,
  p_conversation_id bigint,
  p_contact_id bigint,
  p_direction text,
  p_at timestamptz,
  p_name text,
  p_phone text,
  p_opt_out boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_key text;
  at_time timestamptz;
  newest text;
  opt_phone text;
begin
  select webhook_key into stored_key from public.chat_webhook_settings limit 1;
  if p_key is null or stored_key is null or p_key <> stored_key then
    raise exception 'The key is not right.' using errcode = '28000';
  end if;

  if p_direction not in ('incoming', 'outgoing') then
    raise exception 'The direction must be incoming or outgoing.';
  end if;
  if p_conversation_id is null or p_conversation_id <= 0 then
    raise exception 'The chat is missing.';
  end if;

  -- A clock a little ahead is fine; a message from the future is not.
  at_time := least(coalesce(p_at, now()), now() + interval '5 minutes');

  insert into public.chat_activity as a (
    conversation_id, contact_id, contact_name, contact_phone,
    last_incoming_at, last_outgoing_at, last_direction, last_message_at,
    silence_started_at, waiting_started_at
  )
  values (
    p_conversation_id,
    p_contact_id,
    left(nullif(btrim(p_name), ''), 200),
    left(nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), ''), 30),
    case when p_direction = 'incoming' then at_time end,
    case when p_direction = 'outgoing' then at_time end,
    p_direction,
    at_time,
    case when p_direction = 'outgoing' then at_time end,
    case when p_direction = 'incoming' then at_time end
  )
  on conflict (conversation_id) do update
  set contact_id = coalesce(excluded.contact_id, a.contact_id),
      contact_name = coalesce(excluded.contact_name, a.contact_name),
      contact_phone = coalesce(excluded.contact_phone, a.contact_phone),
      last_incoming_at = greatest(a.last_incoming_at, excluded.last_incoming_at),
      last_outgoing_at = greatest(a.last_outgoing_at, excluded.last_outgoing_at),
      last_direction = case
        when excluded.last_message_at >= a.last_message_at then excluded.last_direction
        else a.last_direction
      end,
      -- The silence begins with our first message after the parent's last one and ends when they write.
      silence_started_at = case
        when excluded.last_message_at < a.last_message_at then a.silence_started_at
        when excluded.last_direction = 'incoming' then null
        when a.last_direction = 'incoming' or a.silence_started_at is null then excluded.last_message_at
        else a.silence_started_at
      end,
      -- The parent starts waiting with their first message after ours and stops when we write.
      waiting_started_at = case
        when excluded.last_message_at < a.last_message_at then a.waiting_started_at
        when excluded.last_direction = 'outgoing' then null
        when a.last_direction = 'outgoing' or a.waiting_started_at is null then excluded.last_message_at
        else a.waiting_started_at
      end,
      last_message_at = greatest(a.last_message_at, excluded.last_message_at),
      updated_at = now();

  -- Only when this message is the newest one does it settle what was waiting.
  select last_direction into newest from public.chat_activity where conversation_id = p_conversation_id;
  if newest = p_direction then
    update public.automation_queue
    set status = 'skipped',
        decided_at = now(),
        error = case
          when p_direction = 'incoming' then 'The parent has replied since.'
          else 'The chat has been answered since.'
        end
    where status = 'pending'
      and dedupe_key like (
        'flow:%:' || case when p_direction = 'incoming' then 'chat_out:' else 'chat_in:' end
        || p_conversation_id || ':%'
      );
  end if;
  -- A parent who wrote "STOP" is not messaged by an automation again: the number is remembered and
  -- whatever is still waiting for approval for it is skipped.
  if p_opt_out and p_direction = 'incoming' then
    select coalesce(
      (
        select l.phone
        from public.people pe
        left join public.people par on par.id = pe.parent_id
        join public.leads l on l.id = coalesce(pe.lead_id, par.lead_id)
        where pe.chatwoot_contact_id = p_contact_id and l.phone ~ '^[0-9]{8,15}$'
        limit 1
      ),
      (
        select pe.phone from public.people pe
        where pe.chatwoot_contact_id = p_contact_id and pe.phone ~ '^[0-9]{8,15}$'
        limit 1
      ),
      case
        when regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') ~ '^(60|65)[0-9]{8,10}$'
        then regexp_replace(p_phone, '[^0-9]', '', 'g')
      end
    ) into opt_phone;

    if opt_phone is not null then
      insert into public.automation_optouts (phone, reason)
      values (opt_phone, 'The parent wrote STOP')
      on conflict (phone) do nothing;

      update public.automation_queue
      set status = 'skipped', decided_at = now(), error = 'The parent asked to stop.'
      where status = 'pending' and phone = opt_phone;
    end if;
  end if;
end;
$$;

revoke all on function public.record_chat_message(text, bigint, bigint, text, timestamptz, text, text, boolean)
from public, anon, authenticated;
grant execute on function public.record_chat_message(text, bigint, bigint, text, timestamptz, text, text, boolean)
to service_role;

-- ---------------------------------------------------------------------------------------------
-- The new triggers are allowed
-- ---------------------------------------------------------------------------------------------

alter table public.automation_flows drop constraint if exists automation_flows_trigger_type_check;
alter table public.automation_flows
  add constraint automation_flows_trigger_type_check
  check (trigger_type in (
    'class_start', 'replacement_start', 'trial_start', 'zoom_start',
    'lesson_expiry', 'account_fee_expiry', 'club_fee_expiry', 'lead_created', 'form_submitted',
    'parent_no_reply', 'parent_waiting',
    'trial_booked', 'package_start', 'lead_idle', 'task_due'
  ));

-- ---------------------------------------------------------------------------------------------
-- A flow is checked on save: the new blocks and the flow settings
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
      elsif n ->> 'kind' in ('source', 'tag', 'pic') then
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

-- ---------------------------------------------------------------------------------------------
-- Walking a flow: the new questions
-- ---------------------------------------------------------------------------------------------

drop function if exists automation.flow_messages(jsonb, integer, bigint, numeric, text);

create or replace function automation.flow_messages(
  p_graph jsonb,
  p_age integer,
  p_classroom bigint,
  p_hours numeric default null,
  p_stage text default null,
  p_source bigint default null,
  p_pic bigint default null,
  p_tags bigint[] default null,
  p_forms text[] default null
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

revoke all on function automation.flow_messages(jsonb, integer, bigint, numeric, text, bigint, bigint, bigint[], text[])
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- What an event knows about its lead: source, PIC, tags and the forms they filled in
-- ---------------------------------------------------------------------------------------------

create or replace view automation.leads as
select
  l.id,
  l.full_name,
  l.phone,
  l.status,
  l.state,
  l.pic_id,
  l.children,
  l.follow_ups,
  l.tasks,
  l.added_date,
  l.converted_student_id,
  l.created_at,
  l.source_id,
  l.tag_ids,
  l.updated_at
from public.leads l;

-- ---------------------------------------------------------------------------------------------
-- The events
-- ---------------------------------------------------------------------------------------------

create or replace view automation.rule_events_base as
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
  and fs.created_at > now() - interval '62 days'

union all

-- Our message is the last one in the chat: the event is when the silence began (our first message since the parent last wrote).
select
  'parent_no_reply'::text,
  'chat_out:' || ca.conversation_id || ':' || extract(epoch from ca.silence_started_at)::bigint,
  coalesce(
    case when ld.phone ~ '^[0-9]{8,15}$' then ld.phone end,
    case when ca.contact_phone ~ '^(60|65)[0-9]{8,10}$' then ca.contact_phone end
  ),
  coalesce(nullif(btrim(ld.full_name), ''), nullif(btrim(ca.contact_name), '')),
  coalesce(nullif(btrim(st.full_name), ''), nullif(btrim(ld.children -> 0 ->> 'name'), '')),
  st.id,
  ld.id,
  ca.silence_started_at,
  to_char(ca.silence_started_at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI am'),
  (ca.silence_started_at at time zone 'Asia/Kuala_Lumpur')::date,
  'Chat',
  st.classroom_id,
  coalesce(
    st.age,
    case when (ld.children -> 0 ->> 'age') ~ '^[0-9]{1,2}$' then (ld.children -> 0 ->> 'age')::integer end
  ),
  st.remaining_hours::numeric,
  ld.status,
  'chat_out:' || ca.conversation_id || ':' || extract(epoch from ca.silence_started_at)::bigint
from public.chat_activity ca
join public.people p on p.chatwoot_contact_id = ca.contact_id
left join public.people par on par.id = p.parent_id
left join automation.leads ld on ld.id = coalesce(p.lead_id, par.lead_id)
left join automation.students st on st.id = p.student_id
where ca.last_direction = 'outgoing'
  and ca.silence_started_at > now() - interval '62 days'
  and (ld.id is not null or st.id is not null)

union all

-- The parent's message is the last one in the chat: the event is the parent's first message that is still unanswered.
select
  'parent_waiting'::text,
  'chat_in:' || ca.conversation_id || ':' || extract(epoch from ca.waiting_started_at)::bigint,
  coalesce(
    case when ld.phone ~ '^[0-9]{8,15}$' then ld.phone end,
    case when ca.contact_phone ~ '^(60|65)[0-9]{8,10}$' then ca.contact_phone end
  ),
  coalesce(nullif(btrim(ld.full_name), ''), nullif(btrim(ca.contact_name), '')),
  coalesce(nullif(btrim(st.full_name), ''), nullif(btrim(ld.children -> 0 ->> 'name'), '')),
  st.id,
  ld.id,
  ca.waiting_started_at,
  to_char(ca.waiting_started_at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI am'),
  (ca.waiting_started_at at time zone 'Asia/Kuala_Lumpur')::date,
  'Chat',
  st.classroom_id,
  coalesce(
    st.age,
    case when (ld.children -> 0 ->> 'age') ~ '^[0-9]{1,2}$' then (ld.children -> 0 ->> 'age')::integer end
  ),
  st.remaining_hours::numeric,
  ld.status,
  'chat_in:' || ca.conversation_id || ':' || extract(epoch from ca.waiting_started_at)::bigint
from public.chat_activity ca
join public.people p on p.chatwoot_contact_id = ca.contact_id
left join public.people par on par.id = p.parent_id
left join automation.leads ld on ld.id = coalesce(p.lead_id, par.lead_id)
left join automation.students st on st.id = p.student_id
where ca.last_direction = 'incoming'
  and ca.waiting_started_at > now() - interval '62 days'
  and (ld.id is not null or st.id is not null)

union all

-- A trial class was booked, from the moment of the booking.
select
  'trial_booked',
  'trial_booked:' || t.id,
  t.phone,
  ld.full_name,
  t.child_name,
  t.student_id,
  t.lead_id,
  t.created_at,
  to_char(t.created_at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI am'),
  (t.created_at at time zone 'Asia/Kuala_Lumpur')::date,
  coalesce(t.classroom_name, t.class_title),
  null::bigint,
  t.child_age,
  null::numeric,
  ld.status,
  'trial_booked:' || t.id
from automation.trials t
left join automation.leads ld on ld.id = t.lead_id
where t.created_at > now() - interval '62 days'

union all

-- A package was bought or renewed, from the moment it was saved.
select
  'package_start',
  'package:' || e.id,
  coalesce(c.child_phone, c.parent_phone),
  c.parent_name,
  s.full_name,
  s.id,
  c.parent_lead_id,
  e.created_at,
  to_char(e.created_at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI am'),
  (e.created_at at time zone 'Asia/Kuala_Lumpur')::date,
  coalesce(pk.name, 'Package'),
  s.classroom_id,
  s.age,
  s.remaining_hours::numeric,
  null::text,
  'package:' || e.id
from public.student_enrollments e
join automation.students s on s.id = e.student_id
left join automation.student_contacts c on c.student_id = s.id
left join public.packages pk on pk.id = e.package_id
where e.created_at > now() - interval '62 days'

union all

-- A lead nobody has touched: from its last change (a change starts it again). Open leads only.
select
  'lead_idle',
  'idle:' || l.id || ':' || extract(epoch from l.updated_at)::bigint,
  l.phone,
  l.full_name,
  nullif(btrim(l.children -> 0 ->> 'name'), ''),
  null::bigint,
  l.id,
  l.updated_at,
  to_char(l.updated_at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI am'),
  (l.updated_at at time zone 'Asia/Kuala_Lumpur')::date,
  'Lead',
  null::bigint,
  case when (l.children -> 0 ->> 'age') ~ '^[0-9]{1,2}$' then (l.children -> 0 ->> 'age')::integer end,
  null::numeric,
  l.status,
  'idle:' || l.id || ':' || extract(epoch from l.updated_at)::bigint
from automation.leads l
where l.status not in ('converted', 'lost')
  and l.updated_at > now() - interval '62 days'

union all

-- A task written on a lead, at 09:00 on its due date, until it is ticked off. {class} is the task.
select
  'task_due',
  'task:' || x.id || ':' || (x.task ->> 'id'),
  x.phone,
  x.full_name,
  nullif(btrim(x.children -> 0 ->> 'name'), ''),
  null::bigint,
  x.id,
  ((x.due_date + time '09:00') at time zone 'Asia/Kuala_Lumpur'),
  '9:00 am',
  x.due_date,
  coalesce(nullif(btrim(x.task ->> 'title'), ''), 'Task'),
  null::bigint,
  case when (x.children -> 0 ->> 'age') ~ '^[0-9]{1,2}$' then (x.children -> 0 ->> 'age')::integer end,
  null::numeric,
  x.status,
  'task:' || x.id || ':' || (x.task ->> 'id')
from (
  select
    l.id, l.phone, l.full_name, l.children, l.status,
    t.value as task,
    case
      when (t.value ->> 'dueDate') ~ '^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
      then (t.value ->> 'dueDate')::date
    end as due_date
  from automation.leads l
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(l.tasks) = 'array' then l.tasks else '[]'::jsonb end
  ) as t(value)
  where coalesce(t.value ->> 'completed', 'false') <> 'true'
) x
where x.due_date between (now() at time zone 'Asia/Kuala_Lumpur')::date - 62 and (now() at time zone 'Asia/Kuala_Lumpur')::date + 62;

-- The same events with what the filters ask about, from the family's lead (a child's class event
-- looks through the parent).
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
  x.form_ids
from automation.rule_events_base b
left join lateral (
  select
    l.source_id,
    l.pic_id,
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

revoke all on automation.rule_events_base from public, anon, authenticated;
revoke all on automation.rule_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The runner: stop stages, cooldown, opt-outs and the new questions
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
            ev.source_id, ev.pic_id, ev.tag_ids, ev.form_ids
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

-- ---------------------------------------------------------------------------------------------
-- "Send a test to my phone": what the tester shows is what is sent
-- ---------------------------------------------------------------------------------------------

drop function if exists public.queue_automation_test(bigint, text, integer, bigint);

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
  p_form text default null
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
      case when p_form is null then null else array[p_form] end
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

revoke all on function public.queue_automation_test(bigint, text, integer, bigint, numeric, text, bigint, bigint, bigint, text)
from public, anon;
grant execute on function public.queue_automation_test(bigint, text, integer, bigint, numeric, text, bigint, bigint, bigint, text)
to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Results per flow
-- ---------------------------------------------------------------------------------------------

-- replied: messages that were sent to a family and the parent wrote back after them.
create or replace function public.automation_flow_stats()
returns table (
  flow_id bigint,
  queued integer,
  sent integer,
  pending integer,
  skipped integer,
  expired integer,
  failed integer,
  replied integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    regexp_replace(q.rule_key, '^flow_', '')::bigint as flow_id,
    count(*)::integer as queued,
    (count(*) filter (where q.status = 'sent'))::integer as sent,
    (count(*) filter (where q.status in ('pending', 'sending')))::integer as pending,
    (count(*) filter (where q.status = 'skipped'))::integer as skipped,
    (count(*) filter (where q.status = 'expired'))::integer as expired,
    (count(*) filter (where q.status = 'failed'))::integer as failed,
    (count(*) filter (
      where q.status = 'sent'
        and q.sent_at is not null
        and exists (
          select 1
          from public.people p
          join public.chat_activity ca on ca.contact_id = p.chatwoot_contact_id
          where ((q.lead_id is not null and p.lead_id = q.lead_id)
                 or (q.student_id is not null and p.student_id = q.student_id))
            and ca.last_incoming_at > q.sent_at
        )
    ))::integer as replied
  from public.automation_queue q
  where q.rule_key ~ '^flow_[0-9]+$'
    and (select public.has_permission('leads'))
  group by 1;
$$;

revoke all on function public.automation_flow_stats() from public, anon;
grant execute on function public.automation_flow_stats() to authenticated;
