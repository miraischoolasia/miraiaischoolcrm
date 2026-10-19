-- For ONE chat: a message sent at a chosen time (written here or from a quick reply, with a picture if wanted),
-- or one of the school's Automations flows started for this person at a chosen time. Made from the chat's "+"
-- menu; shown in the chat, where it can be changed or cancelled.
--
-- It uses what the automations already have, not a second system:
--   * a scheduled message is a row of automation_queue (rule_key 'chat_schedule'), sent by the same automatic
--     sender with the same safety rules (pause, sending hours, daily cap, gap, STOP list). A person decided it,
--     so it does not wait for a flow's "Send by itself" switch;
--   * a flow started for one person is an event of its own ('manual:<id>') that the flow runner walks like any
--     other: its messages, waits and replies, its queue rows and its activity log are the flow's.
--   * "If the parent replies first, don't send": when the parent writes before the time, it is cancelled.
--
-- Everything is kept (white label: hidden, not deleted): a cancelled one stays, marked cancelled.

create table public.chat_schedules (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('message', 'flow')),
  conversation_id bigint not null,
  contact_id bigint,
  inbox_id bigint,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'messenger', 'instagram')),
  phone text check (phone is null or phone ~ '^[0-9]{8,15}$'),
  lead_id bigint references public.leads (id) on delete set null,
  parent_name text check (parent_name is null or char_length(parent_name) <= 200),
  -- A message: its words and picture. A flow: which one.
  message text check (message is null or char_length(message) <= 4000),
  media_url text check (media_url is null or (media_url ~ '^https://' and char_length(media_url) <= 2000)),
  flow_id bigint references public.automation_flows (id) on delete set null,
  -- When the message goes out, or the flow starts (its timing counts from here).
  run_at timestamptz not null,
  cancel_on_reply boolean not null default true,
  -- scheduled: waiting; sent / failed: a message, done; started: a flow, running; cancelled: by a person;
  -- replied: the parent wrote first.
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'failed', 'started', 'cancelled', 'replied')),
  queue_id bigint references public.automation_queue (id) on delete set null,
  created_by uuid default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now(),
  changed_at timestamptz,
  closed_at timestamptz,
  closed_by uuid,
  check ((kind = 'message' and message is not null) or (kind = 'flow' and flow_id is not null))
);

create index chat_schedules_conversation_idx on public.chat_schedules (conversation_id, run_at desc);
create index chat_schedules_open_idx on public.chat_schedules (status, run_at) where status = 'scheduled';
create index chat_schedules_contact_idx on public.chat_schedules (contact_id) where status = 'scheduled';

alter table public.chat_schedules enable row level security;

create policy "Leads tick reads the schedules of chats it may see"
  on public.chat_schedules for select to authenticated
  using ((select public.can_read_inbox(inbox_id)));

revoke all on public.chat_schedules from anon;
revoke insert, update, delete on public.chat_schedules from authenticated;

alter table public.automation_queue add column if not exists chat_schedule_id bigint;

-- The person's name for the queue and the log.
create or replace function public.chat_schedule_author()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(t.full_name), ''), 'a team member')
  from public.teachers t
  where t.auth_user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.chat_schedule_author() from public, anon, authenticated;

create or replace function public.chat_schedule_check(p_inbox_id bigint, p_run_at timestamptz)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_permission('leads', 'edit')) or not (select public.can_read_inbox(p_inbox_id)) then
    raise exception 'Only someone who may answer this chat can schedule for it.' using errcode = '42501';
  end if;
  if p_run_at is null or p_run_at < now() - interval '2 minutes' then
    raise exception 'Pick a time that has not passed.' using errcode = '22023';
  end if;
  if p_run_at > now() + interval '60 days' then
    raise exception 'Pick a time within the next 60 days.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.chat_schedule_check(bigint, timestamptz) from public, anon, authenticated;

-- A message for this chat at a time. Returns the schedule.
create or replace function public.chat_schedule_message(
  p_conversation_id bigint,
  p_contact_id bigint,
  p_inbox_id bigint,
  p_channel text,
  p_phone text,
  p_lead_id bigint,
  p_parent_name text,
  p_message text,
  p_media_url text,
  p_run_at timestamptz,
  p_cancel_on_reply boolean default true
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_queue bigint;
  v_author text := public.chat_schedule_author();
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
begin
  perform public.chat_schedule_check(p_inbox_id, p_run_at);
  if v_phone !~ '^[0-9]{8,15}$' then
    v_phone := null;
  end if;
  if nullif(btrim(coalesce(p_message, '')), '') is null then
    raise exception 'Write the message (a picture goes with it).' using errcode = '22023';
  end if;

  insert into public.chat_schedules (
    kind, conversation_id, contact_id, inbox_id, channel, phone, lead_id, parent_name, message, media_url, run_at,
    cancel_on_reply, created_by_name
  )
  values (
    'message', p_conversation_id, p_contact_id, p_inbox_id, coalesce(p_channel, 'whatsapp'), v_phone, p_lead_id,
    left(nullif(btrim(p_parent_name), ''), 200), nullif(btrim(p_message), ''), p_media_url, p_run_at,
    coalesce(p_cancel_on_reply, true), v_author
  )
  returning id into v_id;

  insert into public.automation_queue (
    rule_key, rule_name, dedupe_key, phone, parent_name, lead_id, message, status, due_at, expires_at, media_url,
    conversation_id, contact_id, channel, chat_schedule_id
  )
  values (
    'chat_schedule', left('Scheduled by ' || v_author, 120), 'schedule:' || v_id, v_phone,
    left(nullif(btrim(p_parent_name), ''), 200), p_lead_id,
    btrim(p_message), 'pending', p_run_at, p_run_at + interval '1 day', p_media_url,
    -- The chat itself: the sender writes into it, whatever number or page it is on.
    p_conversation_id, p_contact_id, coalesce(p_channel, 'whatsapp'), v_id
  )
  returning id into v_queue;

  update public.chat_schedules set queue_id = v_queue where id = v_id;
  return v_id;
end;
$$;

revoke all on function public.chat_schedule_message(bigint, bigint, bigint, text, text, bigint, text, text, text, timestamptz, boolean) from public, anon;
grant execute on function public.chat_schedule_message(bigint, bigint, bigint, text, text, bigint, text, text, text, timestamptz, boolean) to authenticated;

-- A flow for this person, starting at a time. Returns the schedule.
create or replace function public.chat_schedule_flow(
  p_conversation_id bigint,
  p_contact_id bigint,
  p_inbox_id bigint,
  p_channel text,
  p_phone text,
  p_lead_id bigint,
  p_parent_name text,
  p_flow_id bigint,
  p_run_at timestamptz,
  p_cancel_on_reply boolean default true
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
begin
  perform public.chat_schedule_check(p_inbox_id, p_run_at);
  if not exists (select 1 from public.automation_flows f where f.id = p_flow_id) then
    raise exception 'That flow does not exist.' using errcode = '22023';
  end if;
  if v_phone !~ '^[0-9]{8,15}$' then
    v_phone := null;
  end if;
  if v_phone is null and p_lead_id is null then
    raise exception 'This chat has no number and no lead, so a flow cannot reach it.' using errcode = '22023';
  end if;

  insert into public.chat_schedules (
    kind, conversation_id, contact_id, inbox_id, channel, phone, lead_id, parent_name, flow_id, run_at,
    cancel_on_reply, created_by_name
  )
  values (
    'flow', p_conversation_id, p_contact_id, p_inbox_id, coalesce(p_channel, 'whatsapp'), v_phone, p_lead_id,
    left(nullif(btrim(p_parent_name), ''), 200), p_flow_id, p_run_at, coalesce(p_cancel_on_reply, true),
    public.chat_schedule_author()
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.chat_schedule_flow(bigint, bigint, bigint, text, text, bigint, text, bigint, timestamptz, boolean) from public, anon;
grant execute on function public.chat_schedule_flow(bigint, bigint, bigint, text, text, bigint, text, bigint, timestamptz, boolean) to authenticated;

-- Changing one still waiting: words, picture, time, "cancel if they reply".
create or replace function public.chat_schedule_change(
  p_id bigint,
  p_message text,
  p_media_url text,
  p_run_at timestamptz,
  p_cancel_on_reply boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.chat_schedules;
begin
  select * into s from public.chat_schedules where id = p_id for update;
  if not found or s.status <> 'scheduled' then
    raise exception 'This is no longer waiting, so it cannot be changed.' using errcode = '22023';
  end if;
  perform public.chat_schedule_check(s.inbox_id, p_run_at);
  if s.kind = 'message' and nullif(btrim(coalesce(p_message, '')), '') is null then
    raise exception 'Write the message (a picture goes with it).' using errcode = '22023';
  end if;

  update public.chat_schedules
  set message = case when kind = 'message' then nullif(btrim(p_message), '') else message end,
      media_url = case when kind = 'message' then p_media_url else media_url end,
      run_at = p_run_at,
      cancel_on_reply = coalesce(p_cancel_on_reply, cancel_on_reply),
      changed_at = now()
  where id = p_id;

  if s.kind = 'message' and s.queue_id is not null then
    update public.automation_queue
    set message = btrim(p_message),
        media_url = p_media_url,
        due_at = p_run_at,
        expires_at = p_run_at + interval '1 day'
    where id = s.queue_id and status = 'pending';
  end if;
end;
$$;

revoke all on function public.chat_schedule_change(bigint, text, text, timestamptz, boolean) from public, anon;
grant execute on function public.chat_schedule_change(bigint, text, text, timestamptz, boolean) to authenticated;

-- Closes one: cancelled by a person, or the parent replied first. Its waiting queue rows are skipped.
create or replace function public.chat_schedule_close(p_id bigint, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_schedules
  set status = p_status, closed_at = now(), closed_by = auth.uid()
  where id = p_id and status in ('scheduled', 'started');

  update public.automation_queue
  set status = 'skipped', decided_at = now(), error = left(p_reason, 1000)
  where status = 'pending'
    and (chat_schedule_id = p_id or dedupe_key like 'flow:%:manual:' || p_id);
end;
$$;

revoke all on function public.chat_schedule_close(bigint, text, text) from public, anon, authenticated;

create or replace function public.chat_schedule_cancel(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inbox bigint;
begin
  select inbox_id into v_inbox from public.chat_schedules where id = p_id;
  if not found then
    raise exception 'Not found.' using errcode = '22023';
  end if;
  if not (select public.has_permission('leads', 'edit')) or not (select public.can_read_inbox(v_inbox)) then
    raise exception 'Only someone who may answer this chat can cancel it.' using errcode = '42501';
  end if;
  perform public.chat_schedule_close(p_id, 'cancelled', 'Cancelled by ' || public.chat_schedule_author() || '.');
end;
$$;

revoke all on function public.chat_schedule_cancel(bigint) from public, anon;
grant execute on function public.chat_schedule_cancel(bigint) to authenticated;

-- The parent wrote: what was waiting for this chat (and was set to) is cancelled. chat_activity gets every
-- message of every chat from the chat-activity webhook (record_chat_message), so this runs as each one arrives.
create or replace function public.chat_schedules_on_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
begin
  if new.last_direction <> 'incoming' or new.last_incoming_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.last_incoming_at is not null and new.last_incoming_at <= old.last_incoming_at then
    return new;
  end if;
  for s in
    select c.id
    from public.chat_schedules c
    where c.status = 'scheduled'
      and c.cancel_on_reply
      and (c.conversation_id = new.conversation_id or (new.contact_id is not null and c.contact_id = new.contact_id))
      and c.created_at < new.last_incoming_at
      and c.run_at > new.last_incoming_at
  loop
    perform public.chat_schedule_close(s.id, 'replied', 'The parent replied before it was due.');
  end loop;
  return new;
end;
$$;

revoke all on function public.chat_schedules_on_reply() from public, anon, authenticated;

drop trigger if exists chat_schedules_on_reply on public.chat_activity;
create trigger chat_schedules_on_reply
  after insert or update of last_incoming_at on public.chat_activity
  for each row execute function public.chat_schedules_on_reply();

-- A scheduled message's queue row was sent or failed: the schedule says so too.
create or replace function public.chat_schedules_follow_queue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.chat_schedule_id is not null and new.status in ('sent', 'failed') and new.status is distinct from old.status then
    update public.chat_schedules
    set status = new.status, closed_at = now()
    where id = new.chat_schedule_id and status = 'scheduled';
  end if;
  return new;
end;
$$;

revoke all on function public.chat_schedules_follow_queue() from public, anon, authenticated;

drop trigger if exists chat_schedules_follow_queue on public.automation_queue;
create trigger chat_schedules_follow_queue
  after update of status on public.automation_queue
  for each row execute function public.chat_schedules_follow_queue();

-- ---------------------------------------------------------------------------------------------
-- A flow started for one person: an event of that flow only ('manual:<schedule id>'), from its start time. The
-- runner walks it like any other event (same columns as automation.rule_events). Blocks timed before the start
-- are skipped (late); "after" blocks, waits and replies work as in any flow.
-- ---------------------------------------------------------------------------------------------

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
      nullif(btrim(l.children -> 0 ->> 'name'), '') as lead_child
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
    -- {time} and {date} in the flow's messages: the start, in Malaysia time.
    e.start_label := to_char(s.run_at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI AM');
    e.class_date := (s.run_at at time zone 'Asia/Kuala_Lumpur')::date;
    return next e;
  end loop;
end;
$$;

revoke all on function automation.manual_events(bigint) from public, anon, authenticated;

-- A flow's start time passed: it is running.
create or replace function public.chat_schedules_mark_started()
returns integer
language sql
security definer
set search_path = ''
as $$
  with started as (
    update public.chat_schedules
    set status = 'started'
    where kind = 'flow' and status = 'scheduled' and run_at <= now()
    returning 1
  )
  select count(*)::integer from started;
$$;

revoke all on function public.chat_schedules_mark_started() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The flow runner (latest: 20261024000000), unchanged but for the manual starts above.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION automation.run_rules()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  queued integer := 0;
  added integer;
  is_paused boolean;
  f record;
  ev record;
  m record;
  g record;
  w record;
  due timestamptz;
  expires timestamptz;
  contact_id bigint;
  to_phone text;
  to_name text;
  child_text text;
  groups jsonb;
  gkey text;
  cooldown_days integer;
  n_msgs integer;
  relevant boolean;
  has_wait boolean;
  sent_map jsonb;
  replies jsonb;
  keep_days integer;
  chat_conv bigint;
  chat_contact bigint;
  chat_channel text;
  wf_id text;
  booked_at timestamptz;
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

  delete from public.automation_flow_log
  where created_at < now() - interval '90 days';

  -- Parents' texts are kept as long as the longest wait of an enabled flow plus 2 days (at least 2 days).
  select greatest(2, coalesce(max(ceil((x ->> 'mins')::numeric / 1440)), 0)::integer + 2)
  into keep_days
  from public.automation_flows wf, jsonb_array_elements(coalesce(wf.graph -> 'nodes', '[]'::jsonb)) x
  where wf.enabled and (
    x ->> 'kind' = 'wait'
    or (wf.trigger_type = 'message_keyword' and x ->> 'type' in ('message', 'action'))
  );
  keep_days := coalesce(keep_days, 2);

  delete from public.chat_messages
  where at < now() - make_interval(days => keep_days);

  select s.paused into is_paused from public.automation_settings s limit 1;
  if coalesce(is_paused, false) then
    return 0;
  end if;

  -- A flow a person started for one chat is running once its time has come.
  perform public.chat_schedules_mark_started();

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
      -- A flow that waits for a reply only looks at events the kept texts can still answer for.
      has_wait := exists (
        select 1 from jsonb_array_elements(coalesce(f.graph -> 'nodes', '[]'::jsonb)) x
        where x ->> 'kind' = 'wait'
      );

      for ev in
        select *
        from (
          select * from automation.keyword_events k where f.trigger_type = 'message_keyword'
          union all
          select * from automation.rule_events r where f.trigger_type <> 'message_keyword'
          union all
          -- Started by a person for one chat (chat_schedules): an event of this flow only.
          select * from automation.manual_events(f.id) mm
        ) e
        where e.trigger_type = f.trigger_type
          and e.starts_at > now() - case when has_wait then make_interval(days => keep_days + 14) else interval '62 days' end
          and e.starts_at <= now() + interval '62 days'
      loop
        -- A message flow looks only at the messages that hold one of its words (a person's first, unless it repeats).
        if f.trigger_type = 'message_keyword' and ev.event_key not like 'manual:%' then
          if not automation.keyword_event_wanted(f.id, f.graph, ev.event_key) then
            continue;
          end if;
          perform automation.log_keyword_match(
            f.id, ev.event_key, ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
          );
        end if;

        -- Stages this flow leaves alone (for example Converted and Lost).
        if ev.lead_status is not null
           and coalesce(f.graph -> 'settings' -> 'stopStages', '[]'::jsonb) ? ev.lead_status then
          if has_wait or automation.flow_event_relevant(f.graph, ev.starts_at) then
            perform automation.log_flow_event(
              f.id, ev.event_key, '', 'stage_stopped',
              format('Lead stage is "%s", which this flow leaves alone.', ev.lead_status),
              ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
            );
          end if;
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
          if has_wait or automation.flow_event_relevant(f.graph, ev.starts_at) then
            perform automation.log_flow_event(
              f.id, ev.event_key, '', 'cooldown',
              format('This person was already messaged by this flow in the last %s days.', cooldown_days),
              ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
            );
          end if;
          continue;
        end if;

        n_msgs := 0;
        sent_map := null;
        replies := null;
        if has_wait then
          -- When each message of this flow was sent for this event, and what the parent wrote.
          select coalesce(jsonb_object_agg(x ->> 'id', q.sent_at), '{}'::jsonb) into sent_map
          from jsonb_array_elements(coalesce(f.graph -> 'nodes', '[]'::jsonb)) x
          join public.automation_queue q
            on q.dedupe_key = 'flow:' || f.id || ':' || (x ->> 'id') || ':' || ev.event_key
           and q.status = 'sent' and q.sent_at is not null
          where x ->> 'type' = 'message';

          select coalesce(jsonb_agg(jsonb_build_object('at', cm.at, 'text', cm.body) order by cm.at), '[]'::jsonb)
          into replies
          from public.chat_messages cm
          where cm.at > now() - make_interval(days => keep_days)
            and cm.contact_id in (
              select case when ev.event_key ~ '^kw:[0-9]+:[0-9]+$' then split_part(ev.event_key, ':', 2)::bigint end
              union
              select p.chatwoot_contact_id
              from public.people p
              left join public.people par on par.id = p.parent_id
              where p.chatwoot_contact_id is not null
                and (
                  (ev.lead_id is not null and (p.lead_id = ev.lead_id or par.lead_id = ev.lead_id))
                  or (ev.student_id is not null and p.student_id = ev.student_id)
                )
            );
        end if;

        for m in
          select * from automation.flow_walk(
            f.graph, ev.age, ev.classroom_id, ev.hours_left, ev.lead_status,
            ev.source_id, ev.pic_id, ev.tag_ids, ev.form_ids, ev.keyword_id,
            sent_map, replies, ev.starts_at
          )
        loop
          -- A step that changes the lead happens by itself once it is due (nothing waits for approval).
          if m.node_type = 'action' then
            n_msgs := n_msgs + 1;
            if m.anchor_at is not null then
              due := m.anchor_at + make_interval(mins => m.mins);
            elsif m.is_after then
              due := ev.starts_at + make_interval(mins => m.mins);
            else
              if ev.starts_at <= now() then
                continue;
              end if;
              due := ev.starts_at - make_interval(mins => m.mins);
            end if;
            -- Not before its time, and not hours late (a lead may have moved on by then).
            if due > now() or due < now() - interval '1 hour' then
              continue;
            end if;
            perform automation.do_flow_action(
              f.id, ev.event_key, m.node_id, m.kind, m.message_text,
              ev.lead_id, ev.phone, ev.parent_name, ev.child_name, ev.student_id, ev.starts_at
            );
            continue;
          end if;

          -- The blocks that are not messages only tell what happened to the parent's reply.
          if m.node_type <> 'message' then
            if m.kind = 'wait' and m.port = 'yes' then
              perform automation.log_flow_event(
                f.id, ev.event_key, m.node_id, 'replied', m.detail,
                ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
              );
            elsif m.kind = 'wait' and m.port = 'no' then
              perform automation.log_flow_event(
                f.id, ev.event_key, m.node_id, 'no_reply', m.detail,
                ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
              );
            elsif m.kind = 'reply' and m.port = 'yes' then
              perform automation.log_flow_event(
                f.id, ev.event_key, m.node_id, 'reply_branch', m.detail,
                ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
              );
            end if;
            continue;
          end if;

          n_msgs := n_msgs + 1;
          if m.anchor_at is not null then
            -- After a reply (or after the wait ran out): counted from that moment.
            due := m.anchor_at + make_interval(mins => m.mins);
            expires := due + interval '1 day';
          elsif m.is_after then
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

          if due > now() + interval '3 hours' then
            continue;
          end if;
          if due < now() - interval '1 hour' then
            -- Booked after this message's moment: it is caught up (sent at the next chance) while the class is still
            -- at least 30 minutes away. Anything else that is late is left alone.
            booked_at := automation.event_created_at(ev.event_key);
            if booked_at is null
               or booked_at <= due
               or m.is_after
               or m.anchor_at is not null
               or ev.starts_at <= now() + interval '30 minutes' then
              continue;
            end if;
          end if;

          -- Who gets it: the family of the event, or the contact named on the block.
          select nullif(x ->> 'contactId', '')::bigint into contact_id
          from jsonb_array_elements(coalesce(f.graph -> 'nodes', '[]'::jsonb)) x
          where x ->> 'id' = m.node_id
          limit 1;

          -- A message that starts a GoHighLevel workflow (the buttons live there) instead of sending its text.
          select nullif(x ->> 'ghlWorkflowId', '') into wf_id
          from jsonb_array_elements(coalesce(f.graph -> 'nodes', '[]'::jsonb)) x
          where x ->> 'id' = m.node_id
          limit 1;

          child_text := coalesce(nullif(btrim(ev.child_name), ''), 'your child');

          if contact_id is null then
            -- The family: a number to send to, or (Messenger / Instagram) the lead's own chat.
            chat_conv := null;
            chat_contact := null;
            chat_channel := null;
            if ev.phone is null or ev.phone !~ '^[0-9]{8,15}$' then
              if ev.lead_id is not null then
                select lc.conversation_id, lc.contact_id, lc.channel
                into chat_conv, chat_contact, chat_channel
                from automation.lead_chat(ev.lead_id) lc;
              end if;
              if chat_conv is null then
                perform automation.log_flow_event(
                  f.id, ev.event_key, m.node_id, 'no_phone',
                  'This family has no usable phone number and no Messenger or Instagram chat, so nothing could be queued.',
                  ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
                );
                continue;
              end if;
              if not (coalesce(f.graph -> 'settings' -> 'channels', '["whatsapp"]'::jsonb) ? chat_channel) then
                perform automation.log_flow_event(
                  f.id, ev.event_key, m.node_id, 'channel_off',
                  format('This flow is not set to send on %s.', initcap(chat_channel)),
                  ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
                );
                continue;
              end if;
              if exists (select 1 from public.automation_chat_optouts o where o.contact_id = chat_contact) then
                perform automation.log_flow_event(
                  f.id, ev.event_key, m.node_id, 'opted_out',
                  'The parent wrote STOP, so this flow does not message them.',
                  ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
                );
                continue;
              end if;
            else
              if not (coalesce(f.graph -> 'settings' -> 'channels', '["whatsapp"]'::jsonb) ? 'whatsapp') then
                perform automation.log_flow_event(
                  f.id, ev.event_key, m.node_id, 'channel_off',
                  'This flow is not set to send on WhatsApp.',
                  ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
                );
                continue;
              end if;
              -- A parent who wrote STOP is left alone.
              if exists (select 1 from public.automation_optouts o where o.phone = ev.phone) then
                perform automation.log_flow_event(
                  f.id, ev.event_key, m.node_id, 'opted_out',
                  'The parent wrote STOP, so this flow does not message them.',
                  ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
                );
                continue;
              end if;
            end if;
            -- A button message is a GoHighLevel workflow: it needs a Messenger / Instagram chat and goes out by itself.
            if wf_id is not null and (
                 chat_conv is null or coalesce(f.graph -> 'settings' ->> 'autoSend', 'false') <> 'true'
               ) then
              perform automation.log_flow_event(
                f.id, ev.event_key, m.node_id, 'channel_off',
                'A button message needs a Messenger or Instagram chat, and the flow set to send by itself.',
                ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
              );
              continue;
            end if;
            insert into public.automation_queue
              (rule_key, rule_name, dedupe_key, phone, parent_name, child_name, lead_id, student_id,
               message, due_at, expires_at, media_url, conversation_id, contact_id, channel, kind, workflow_id)
            values (
              'flow_' || f.id,
              f.name,
              'flow:' || f.id || ':' || m.node_id || ':' || ev.event_key,
              case when chat_conv is null then ev.phone end,
              left(ev.parent_name, 200),
              left(ev.child_name, 200),
              ev.lead_id,
              ev.student_id,
              left(
                replace(replace(replace(replace(replace(replace(replace(replace(m.message_text,
                  '{parent_phone}', coalesce(automation.local_phone(ev.phone), '')),
                  '{child_lower}', automation.compact_name(child_text)),
                  '{child}', child_text),
                  '{parent}', coalesce(nullif(btrim(ev.parent_name), ''), 'there')),
                  '{time}', ev.start_label),
                  '{date}', to_char(ev.class_date, 'Dy DD Mon')),
                  '{class}', coalesce(ev.class_label, 'class')),
                  '{hours_left}', coalesce(round(ev.hours_left)::bigint::text, '?')),
                4000),
              due,
              expires,
              nullif(left(m.image_url, 600), ''),
              chat_conv,
              chat_contact,
              coalesce(chat_channel, 'whatsapp'),
              case when wf_id is null then 'message' else 'ghl_workflow' end,
              wf_id
            )
            on conflict (dedupe_key) do update
            set status = 'pending',
                due_at = excluded.due_at,
                expires_at = excluded.expires_at,
                message = excluded.message,
                parent_name = excluded.parent_name,
                child_name = excluded.child_name,
                lead_id = excluded.lead_id,
                student_id = excluded.student_id,
                media_url = excluded.media_url,
                phone = excluded.phone,
                conversation_id = excluded.conversation_id,
                contact_id = excluded.contact_id,
                channel = excluded.channel,
                kind = excluded.kind,
                workflow_id = excluded.workflow_id,
                decided_by = null,
                decided_at = null,
                sent_at = null,
                sent_by_automation = false,
                error = null,
                auto_blocked = null
            where public.automation_queue.status in ('skipped', 'expired')
              and abs(extract(epoch from (public.automation_queue.due_at - excluded.due_at))) > 3600;
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
                  'media', m.image_url,
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

        -- Nothing to send for an event that is about to matter: say which block stopped it.
        if n_msgs = 0 then
          relevant := has_wait or automation.flow_event_relevant(f.graph, ev.starts_at);
          if relevant then
            select * into w
            from automation.flow_walk(
              f.graph, ev.age, ev.classroom_id, ev.hours_left, ev.lead_status,
              ev.source_id, ev.pic_id, ev.tag_ids, ev.form_ids, ev.keyword_id,
              sent_map, replies, ev.starts_at
            ) x
            where x.node_type = 'condition' and x.port = 'no' and x.ended and x.kind not in ('wait', 'reply')
            limit 1;
            if found then
              perform automation.log_flow_event(
                f.id, ev.event_key, w.node_id, 'condition_no', w.detail,
                ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
              );
            else
              perform automation.log_flow_event(
                f.id, ev.event_key, '', 'no_message',
                'This flow has no message to send for this event.',
                ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
              );
            end if;
          end if;
        end if;
      end loop;

      for g in select key, value from jsonb_each(groups) loop
        insert into public.automation_queue
          (rule_key, rule_name, dedupe_key, phone, parent_name, child_name, lead_id, student_id,
           message, due_at, expires_at, media_url)
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
          (g.value ->> 'expires')::timestamptz,
          nullif(g.value ->> 'media', '')
        )
        on conflict (dedupe_key) do update
          set status = 'pending',
              due_at = excluded.due_at,
              expires_at = excluded.expires_at,
              message = excluded.message,
              parent_name = excluded.parent_name,
              child_name = excluded.child_name,
              lead_id = excluded.lead_id,
              student_id = excluded.student_id,
              media_url = excluded.media_url,
              phone = excluded.phone,
              conversation_id = excluded.conversation_id,
              contact_id = excluded.contact_id,
              channel = excluded.channel,
              kind = excluded.kind,
              workflow_id = excluded.workflow_id,
              decided_by = null,
              decided_at = null,
              sent_at = null,
              sent_by_automation = false,
              error = null,
              auto_blocked = null
          where public.automation_queue.status in ('skipped', 'expired')
            and abs(extract(epoch from (public.automation_queue.due_at - excluded.due_at))) > 3600;
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
$function$;

-- ---------------------------------------------------------------------------------------------
-- The automatic sender's pick (latest: 20261019040000), unchanged but for scheduled messages.
-- ---------------------------------------------------------------------------------------------

create or replace function public.automation_claim_auto(p_key text)
returns table (
  id bigint,
  phone text,
  message text,
  parent_name text,
  lead_id bigint,
  rule_name text,
  media_url text,
  conversation_id bigint,
  contact_id bigint,
  channel text,
  kind text,
  workflow_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored text;
  st record;
  local_hour integer;
  used integer;
  last_at timestamptz;
  picked bigint;
begin
  select s.sender_key into stored from public.automation_sender s limit 1;
  if p_key is null or stored is null or p_key <> stored then
    raise exception 'not allowed' using errcode = '28000';
  end if;

  -- (a WHERE is needed: the API role refuses an UPDATE without one)
  update public.automation_settings cfg set sender_seen_at = now() where cfg.id;

  -- Messenger and Instagram only let us answer within 24 hours of the parent's last message. A message
  -- whose time has passed is not sent; a person decides (they can still write in the chat).
  update public.automation_queue q
  set auto_blocked = 'Messenger and Instagram only let us reply within 24 hours of the parent''s last message, and that time is over.'
  where q.status = 'pending'
    and q.auto_blocked is null
    and q.channel in ('messenger', 'instagram')
    and q.due_at <= now()
    and not exists (
      select 1 from public.chat_activity ca
      where ca.contact_id = q.contact_id and ca.last_incoming_at > now() - interval '23 hours'
    );

  -- A message taken by the sender that never reported back is not tried again by itself: it might
  -- have gone out. A person sees it as failed and decides.
  update public.automation_queue q
  set status = 'failed',
      error = 'The sender stopped before it finished. Check the chat before sending it again.'
  where q.status = 'sending'
    and q.sent_by_automation
    and q.decided_at < now() - interval '10 minutes';

  select s.paused, s.daily_cap, s.gap_seconds, s.send_from_hour, s.send_until_hour
  into st
  from public.automation_settings s
  limit 1;
  if not found or st.paused then
    return;
  end if;

  local_hour := extract(hour from (now() at time zone 'Asia/Kuala_Lumpur'))::integer;
  if local_hour < st.send_from_hour or local_hour >= st.send_until_hour then
    return;
  end if;

  select count(*) into used
  from public.automation_queue q
  where q.status in ('sent', 'sending')
    and coalesce(q.sent_at, q.decided_at)
        >= (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur');
  if used >= st.daily_cap then
    return;
  end if;

  select max(coalesce(q.sent_at, q.decided_at)) into last_at
  from public.automation_queue q
  where q.status in ('sent', 'sending');
  if last_at is not null and last_at > now() - make_interval(secs => st.gap_seconds) then
    return;
  end if;

  select q.id into picked
  from public.automation_queue q
  left join public.automation_flows f on q.rule_key = 'flow_' || f.id
  where q.status = 'pending'
    and q.auto_blocked is null
    and q.due_at <= now()
    and (q.expires_at is null or q.expires_at > now())
    -- A flow's message needs the flow on and set to send by itself; a message a person scheduled for one chat
    -- (chat_schedule) was decided by that person and goes at its time, with the same safety rules as the rest.
    and (q.rule_key = 'chat_schedule' or (f.enabled and (f.graph -> 'settings' ->> 'autoSend') = 'true'))
    and not exists (select 1 from public.automation_optouts o where o.phone = q.phone)
    and not exists (select 1 from public.automation_chat_optouts oc where oc.contact_id = q.contact_id)
  order by q.due_at, q.id
  limit 1
  for update of q skip locked;

  if picked is null then
    return;
  end if;

  update public.automation_queue q
  set status = 'sending',
      decided_at = now(),
      decided_by = null,
      sent_by_automation = true,
      error = null
  where q.id = picked;

  return query
  select q.id, q.phone, q.message, q.parent_name, q.lead_id, q.rule_name, q.media_url,
         q.conversation_id, q.contact_id, q.channel, q.kind, q.workflow_id
  from public.automation_queue q
  where q.id = picked;
end;
$$;

revoke all on function public.automation_claim_auto(text) from public, anon, authenticated;
grant execute on function public.automation_claim_auto(text) to service_role;
