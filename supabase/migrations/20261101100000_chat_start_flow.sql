-- Inbox "+" > Start automation: a person starts one of the school's flows for this chat now, like ManyChat. For when
-- the system did not pick the person up by itself (a keyword it missed, a lead added late).
--
-- It is the flow started for one chat of 20261025600000_chat_schedules.sql (a chat_schedules row of kind 'flow',
-- walked by the runner as the event 'manual:<id>'), started now. The trigger is skipped; everything else holds as in
-- any flow: its own blocks, the weekly limit, STOP, approval (unless the flow sends by itself), the sending hours.
--
--   * public.chat_flow_state: is this person still in this flow (a run with steps still to come, or messages
--     waiting)? Since when, and started by whom (a person's name, or automatically).
--   * public.chat_start_flow: starts it. Only someone who may edit Automations and may answer this chat. A person
--     already in the flow is not started twice unless p_restart: then the runs going on are stopped first (their
--     waiting messages skipped) and the flow starts again from the first step.
--   * automation.flow_event_stops: a run stopped by a restart. The runner leaves it alone from then on (one line
--     added at the top of its event loop).
--   * automation.manual_events now carries the lead's source, person in charge, tags, forms and source keyword, so
--     the flow's "Who it is for" checks see the same lead as for a run that started by itself.
-- Who started it is the chat_schedules row's created_by_name; the flow's Enrollment history shows it.

-- ---------------------------------------------------------------------------------------------------------
-- 1. Stopped runs
-- ---------------------------------------------------------------------------------------------------------

create table if not exists automation.flow_event_stops (
  flow_id bigint not null references public.automation_flows (id) on delete cascade,
  event_key text not null,
  stopped_by text,
  stopped_at timestamptz not null default now(),
  primary key (flow_id, event_key)
);

revoke all on automation.flow_event_stops from public, anon, authenticated;

create or replace function pg_temp.patch(p_fn regprocedure, p_label text, p_from text, p_to text)
returns void
language plpgsql
as $$
declare
  v_def text := replace(pg_get_functiondef(p_fn), chr(13), '');
begin
  if position(p_to in v_def) > 0 then
    raise notice '%: already there', p_label;
    return;
  end if;
  if position(p_from in v_def) = 0 then
    raise exception '%: the text to change was not found', p_label;
  end if;
  execute replace(v_def, p_from, p_to);
end;
$$;

select pg_temp.patch(
  'automation.run_rules()'::regprocedure,
  'run_rules: stopped runs',
  $x$      loop
        -- A message flow looks only at the messages that hold one of its words (a person's first, unless it repeats).$x$,
  $x$      loop
        -- A run stopped by a person (Start automation > start again): left alone (20261101100000).
        if exists (select 1 from automation.flow_event_stops st where st.flow_id = f.id and st.event_key = ev.event_key) then
          continue;
        end if;
        -- A message flow looks only at the messages that hold one of its words (a person's first, unless it repeats).$x$
);

-- ---------------------------------------------------------------------------------------------------------
-- 2. A started run sees the lead as a run that started by itself does
-- ---------------------------------------------------------------------------------------------------------

create or replace function automation.manual_events(p_flow_id bigint)
returns setof automation.rule_events
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s record;
  e automation.rule_events;
  v_trigger text;
begin
  select f.trigger_type into v_trigger from public.automation_flows f where f.id = p_flow_id;
  for s in
    select c.*, l.status as lead_status, coalesce(nullif(btrim(l.full_name), ''), c.parent_name) as family_name,
      nullif(btrim(l.children -> 0 ->> 'name'), '') as lead_child,
      case when (l.children -> 0 ->> 'age') ~ '^[0-9]{1,2}$' then (l.children -> 0 ->> 'age')::integer end as lead_age,
      l.source_id as lead_source, l.pic_id as lead_pic, l.source_rule_id as lead_keyword,
      coalesce(l.tag_ids, '{}')::bigint[] as lead_tags,
      coalesce(
        (select array_agg(distinct fs.form_id::text) from public.form_submissions fs
         where fs.lead_id = l.id and fs.status = 'completed'),
        '{}'::text[]
      ) as lead_forms
    from public.chat_schedules c
    left join public.leads l on l.id = c.lead_id
    where c.kind = 'flow'
      and c.flow_id = p_flow_id
      and c.status in ('scheduled', 'started')
      and c.run_at <= now() + interval '3 hours'
      and c.run_at > now() - interval '30 days'
  loop
    e := null;
    e.trigger_type := v_trigger;
    e.event_key := 'manual:' || s.id;
    e.phone := s.phone;
    e.parent_name := s.family_name;
    e.child_name := s.lead_child;
    e.lead_id := s.lead_id;
    e.starts_at := s.run_at;
    e.lead_status := s.lead_status;
    e.age := s.lead_age;
    e.group_key := 'manual:' || s.id;
    e.source_id := s.lead_source;
    e.pic_id := s.lead_pic;
    e.tag_ids := s.lead_tags;
    e.form_ids := s.lead_forms;
    e.keyword_id := s.lead_keyword;
    -- {time} and {date} in the flow's messages: the start, in Malaysia time.
    e.start_label := to_char(s.run_at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI AM');
    e.class_date := (s.run_at at time zone 'Asia/Kuala_Lumpur')::date;
    return next e;
  end loop;
end;
$$;

revoke all on function automation.manual_events(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Is this person in this flow?
-- ---------------------------------------------------------------------------------------------------------

-- How long a run of the flow goes on after it starts, in minutes: its latest "after" step, plus every wait.
create or replace function automation.flow_span_minutes(p_graph jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce((
      select max(coalesce(nullif(x ->> 'mins', '')::integer, 0))
      from jsonb_array_elements(coalesce(p_graph -> 'nodes', '[]'::jsonb)) x
      where x ->> 'type' in ('message', 'action') and coalesce((x ->> 'after')::boolean, false)
    ), 0)
    + coalesce((
      select sum(coalesce(nullif(x ->> 'mins', '')::integer, 0))
      from jsonb_array_elements(coalesce(p_graph -> 'nodes', '[]'::jsonb)) x
      where x ->> 'kind' = 'wait'
    ), 0)::integer;
$$;

-- The runs of a flow for one person that are still going on: started by hand for this chat or lead, or started by
-- themselves (an event of the flow's trigger for this lead or number) with steps still to come, or with messages
-- still waiting in the queue. Stopped runs are left out.
create or replace function automation.flow_person_runs(p_flow_id bigint, p_conversation_id bigint, p_lead_id bigint, p_phone text)
returns table (event_key text, started_at timestamptz, started_by text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trigger text;
  v_span interval;
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
begin
  select f.trigger_type, make_interval(mins => automation.flow_span_minutes(f.graph) + 60)
  into v_trigger, v_span
  from public.automation_flows f where f.id = p_flow_id;
  if v_trigger is null then
    return;
  end if;

  return query
  with runs as (
    -- Started by hand.
    select 'manual:' || c.id as key, c.run_at as at, coalesce(c.created_by_name, 'a team member') as who
    from public.chat_schedules c
    where c.kind = 'flow' and c.flow_id = p_flow_id and c.status in ('scheduled', 'started')
      and (c.conversation_id = p_conversation_id or (p_lead_id is not null and c.lead_id = p_lead_id))
      and c.run_at > now() - v_span
    union all
    -- Started by itself, with steps still to come.
    select r.event_key, r.starts_at, null::text
    from automation.rule_events r
    where v_trigger <> 'message_keyword'
      and r.trigger_type = v_trigger
      and ((p_lead_id is not null and r.lead_id = p_lead_id) or (v_phone is not null and r.phone = v_phone))
      and r.starts_at > now() - v_span
      and r.starts_at <= now() + interval '1 day'
    union all
    -- Messages of the flow still waiting for this person.
    select regexp_replace(q.dedupe_key, '^flow:[0-9]+:[^:]+:', ''), q.created_at, null::text
    from public.automation_queue q
    where q.rule_key = 'flow_' || p_flow_id and q.status = 'pending'
      and ((p_lead_id is not null and q.lead_id = p_lead_id) or (v_phone is not null and q.phone = v_phone)
           or (p_conversation_id is not null and q.conversation_id = p_conversation_id))
  )
  select runs.key, min(runs.at), max(runs.who)
  from runs
  where not exists (select 1 from automation.flow_event_stops st where st.flow_id = p_flow_id and st.event_key = runs.key)
  group by runs.key;
end;
$$;

revoke all on function automation.flow_span_minutes(jsonb) from public, anon, authenticated;
revoke all on function automation.flow_person_runs(bigint, bigint, bigint, text) from public, anon, authenticated;

create or replace function automation.require_flow_starter(p_inbox_id bigint)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_permission('automations', 'edit')) then
    raise exception 'Only someone who may edit Automations can start a flow by hand.' using errcode = '42501';
  end if;
  if not (select public.has_permission('leads', 'edit')) or not (select public.can_read_inbox(p_inbox_id)) then
    raise exception 'Only someone who may answer this chat can start a flow for it.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function automation.require_flow_starter(bigint) from public, anon, authenticated;

-- {"running": false} or {"running": true, "since": ..., "startedBy": "<name>" | null (by itself), "runs": n}.
create or replace function public.chat_flow_state(
  p_conversation_id bigint,
  p_inbox_id bigint,
  p_phone text,
  p_lead_id bigint,
  p_flow_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform automation.require_flow_starter(p_inbox_id);
  select case when count(*) = 0 then jsonb_build_object('running', false)
    else jsonb_build_object(
      'running', true,
      'since', min(r.started_at),
      'startedBy', (array_agg(r.started_by order by r.started_at desc) filter (where r.started_by is not null))[1],
      'runs', count(*)
    ) end
  into v
  from automation.flow_person_runs(p_flow_id, p_conversation_id, p_lead_id, p_phone) r;
  return v;
end;
$$;

revoke all on function public.chat_flow_state(bigint, bigint, text, bigint, bigint) from public, anon;
grant execute on function public.chat_flow_state(bigint, bigint, text, bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 4. Start it
-- ---------------------------------------------------------------------------------------------------------

-- {"started": true, "id": <chat_schedules id>} or, for a person already in the flow without p_restart,
-- {"started": false, "state": <as chat_flow_state>}.
create or replace function public.chat_start_flow(
  p_conversation_id bigint,
  p_contact_id bigint,
  p_inbox_id bigint,
  p_channel text,
  p_phone text,
  p_lead_id bigint,
  p_parent_name text,
  p_flow_id bigint,
  p_restart boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state jsonb;
  v_who text := public.chat_schedule_author();
  r record;
  v_id bigint;
begin
  perform automation.require_flow_starter(p_inbox_id);
  if not exists (select 1 from public.automation_flows f where f.id = p_flow_id and f.enabled) then
    raise exception 'This flow is switched off. Switch it on in Automations first.' using errcode = '22023';
  end if;

  v_state := public.chat_flow_state(p_conversation_id, p_inbox_id, p_phone, p_lead_id, p_flow_id);
  if (v_state ->> 'running')::boolean and not coalesce(p_restart, false) then
    return jsonb_build_object('started', false, 'state', v_state);
  end if;

  -- Starting again: what is going on stops first.
  for r in select * from automation.flow_person_runs(p_flow_id, p_conversation_id, p_lead_id, p_phone) loop
    insert into automation.flow_event_stops (flow_id, event_key, stopped_by)
    values (p_flow_id, r.event_key, v_who)
    on conflict do nothing;
    if r.event_key like 'manual:%' then
      perform public.chat_schedule_close(substring(r.event_key from 8)::bigint, 'cancelled',
        'Started again from the first step by ' || v_who || '.');
    end if;
    update public.automation_queue q
    set status = 'skipped', decided_at = now(), error = 'Started again from the first step by ' || v_who || '.'
    where q.status = 'pending'
      and q.rule_key = 'flow_' || p_flow_id
      and right(q.dedupe_key, char_length(r.event_key) + 1) = ':' || r.event_key;
  end loop;

  v_id := public.chat_schedule_flow(
    p_conversation_id, p_contact_id, p_inbox_id, p_channel, p_phone, p_lead_id, p_parent_name, p_flow_id, now(), false
  );
  update public.chat_schedules set status = 'started' where id = v_id;
  return jsonb_build_object('started', true, 'id', v_id);
end;
$$;

revoke all on function public.chat_start_flow(bigint, bigint, bigint, text, text, bigint, text, bigint, boolean) from public, anon;
grant execute on function public.chat_start_flow(bigint, bigint, bigint, text, text, bigint, text, bigint, boolean) to authenticated;
