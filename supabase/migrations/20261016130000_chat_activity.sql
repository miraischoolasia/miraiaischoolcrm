-- "A parent has not replied" and "A parent is waiting for us": what is said in a WhatsApp chat becomes
-- something an automation flow can start from.
--
-- How it works
--   * The WhatsApp inbox (Chatwoot) tells the edge function chat-activity about every message, through
--     its webhook. The function calls record_chat_message below, which keeps ONE row per chat: when the
--     parent last wrote and when we last wrote.
--   * Two new triggers read that table:
--       parent_no_reply   our message is the last one in the chat and the parent has not answered.
--                         The "event" is the moment the SILENCE began: the first message we wrote since
--                         the parent last wrote. Our own follow-ups do not move it, so a flow with
--                         "4 hours after", "1 day after" and "3 days after" is one sequence that runs
--                         once, and stops by itself when the parent answers.
--       parent_waiting    the parent's message is the last one and nobody has answered it.
--                         The "event" is the first message of the parent that is still unanswered.
--   * When the parent answers, a "no reply" message that is still waiting for approval is skipped (it
--     is no longer true); when we answer, a "waiting" one is skipped.
--   * Only chats that belong to a lead or a student count (a chat nobody has placed is not a family
--     yet), and the number the message goes to is the lead's number, or the chat's own number when
--     WhatsApp shows one (a hidden WhatsApp id is never used as a number). A message to a contact
--     (for example the team) does not need a number.
--
-- The address Chatwoot calls carries a key that only this database knows: chat_webhook_settings holds
-- it, an admin sees it in the CRM (Automations > Parent replies) and pastes the address into Chatwoot.
-- Nothing in the browser can read or write the chat table.

-- ---------------------------------------------------------------------------------------------
-- The key, and the table of chats
-- ---------------------------------------------------------------------------------------------

create table if not exists public.chat_webhook_settings (
  id boolean primary key default true check (id),
  -- Long and random; the address given to Chatwoot ends with it.
  webhook_key text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

insert into public.chat_webhook_settings (id) values (true)
on conflict (id) do nothing;

alter table public.chat_webhook_settings enable row level security;
revoke all on public.chat_webhook_settings from public, anon, authenticated;

create table if not exists public.chat_activity (
  -- The Chatwoot conversation.
  conversation_id bigint primary key,
  -- The Chatwoot contact of the chat (people.chatwoot_contact_id).
  contact_id bigint,
  contact_name text check (contact_name is null or char_length(contact_name) <= 200),
  -- Digits of the chat's number, as Chatwoot gave it (may be a hidden WhatsApp id).
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 30),
  last_incoming_at timestamptz,
  last_outgoing_at timestamptz,
  last_direction text not null check (last_direction in ('incoming', 'outgoing')),
  last_message_at timestamptz not null,
  -- When the current silence began (the first message of ours after the parent last wrote); null while
  -- the parent has the last word.
  silence_started_at timestamptz,
  -- When the parent started waiting (their first message since we last wrote); null while we have the last word.
  waiting_started_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists chat_activity_contact_idx on public.chat_activity (contact_id);
create index if not exists chat_activity_last_idx on public.chat_activity (last_message_at);

alter table public.chat_activity enable row level security;
revoke all on public.chat_activity from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- What the edge function calls for each message
-- ---------------------------------------------------------------------------------------------

create or replace function public.record_chat_message(
  p_key text,
  p_conversation_id bigint,
  p_contact_id bigint,
  p_direction text,
  p_at timestamptz,
  p_name text,
  p_phone text
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
end;
$$;

revoke all on function public.record_chat_message(text, bigint, bigint, text, timestamptz, text, text)
from public, anon, authenticated;
grant execute on function public.record_chat_message(text, bigint, bigint, text, timestamptz, text, text)
to service_role;

-- ---------------------------------------------------------------------------------------------
-- What an admin sees on the Automations page
-- ---------------------------------------------------------------------------------------------

-- The key and how much has arrived, so the admin can paste the address into Chatwoot and see it work.
create or replace function public.chat_webhook_info()
returns table (webhook_key text, last_received_at timestamptz, chats integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Only an admin can see this.';
  end if;

  return query
  select
    (select s.webhook_key from public.chat_webhook_settings s limit 1),
    (select max(c.updated_at) from public.chat_activity c),
    (select count(*)::integer from public.chat_activity c);
end;
$$;

revoke all on function public.chat_webhook_info() from public, anon;
grant execute on function public.chat_webhook_info() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The new triggers are allowed
-- ---------------------------------------------------------------------------------------------

alter table public.automation_flows drop constraint if exists automation_flows_trigger_type_check;
alter table public.automation_flows
  add constraint automation_flows_trigger_type_check
  check (trigger_type in (
    'class_start', 'replacement_start', 'trial_start', 'zoom_start',
    'lesson_expiry', 'account_fee_expiry', 'club_fee_expiry', 'lead_created', 'form_submitted',
    'parent_no_reply', 'parent_waiting'
  ));

-- ---------------------------------------------------------------------------------------------
-- The events: everything automation.rule_events had, plus the two chat ones
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
  and (ld.id is not null or st.id is not null);

revoke all on automation.rule_events from public, anon, authenticated;
