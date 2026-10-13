-- Send automatically: a flow can switch on "send by itself", and a small sender program on the
-- WhatsApp server then sends its messages without a person approving each one.
--
-- * The switch is graph.settings.autoSend of the flow (true or absent). It is off by default, so every
--   flow keeps going through the approval queue unless an admin turns it on for that flow.
-- * The sender cannot read or change anything else. Through the edge function auto-sender it asks this
--   database for the next message with automation_claim_auto(key) and reports back with
--   automation_finish_auto(key, id, result, error). The key is random, kept in automation_sender
--   (nobody but the owner role can read that table) and in the sender's own settings file on the server.
-- * Every safety rule is checked HERE, not in the sender: the pause switch, the daily limit, the gap
--   between two messages, the hours of the day, the STOP list, and that the flow is on and set to send
--   by itself. One message is handed out per call.
-- * The sender itself also refuses a number that has never written to the school (it leaves the
--   message in the queue for a person: automation_finish_auto(..., 'blocked', reason)).

alter table public.automation_settings
  add column if not exists send_from_hour smallint not null default 9 check (send_from_hour between 0 and 23),
  add column if not exists send_until_hour smallint not null default 21 check (send_until_hour between 1 and 24),
  add column if not exists sender_seen_at timestamptz;

grant update (paused, daily_cap, gap_seconds, send_from_hour, send_until_hour, updated_at)
on public.automation_settings to authenticated;

alter table public.automation_queue
  add column if not exists sent_by_automation boolean not null default false,
  -- Why the sender left this message for a person (for example "has not written to us first").
  add column if not exists auto_blocked text check (auto_blocked is null or char_length(auto_blocked) <= 200);

create table if not exists public.automation_sender (
  id boolean primary key default true check (id),
  sender_key text not null
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);

insert into public.automation_sender (id) values (true) on conflict (id) do nothing;

alter table public.automation_sender enable row level security;
revoke all on public.automation_sender from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The next message to send by itself (or nothing)
-- ---------------------------------------------------------------------------------------------

create or replace function public.automation_claim_auto(p_key text)
returns table (
  id bigint,
  phone text,
  message text,
  parent_name text,
  lead_id bigint,
  rule_name text
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

  update public.automation_settings set sender_seen_at = now();

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
  join public.automation_flows f on q.rule_key = 'flow_' || f.id
  where q.status = 'pending'
    and q.auto_blocked is null
    and q.due_at <= now()
    and (q.expires_at is null or q.expires_at > now())
    and f.enabled
    and (f.graph -> 'settings' ->> 'autoSend') = 'true'
    and not exists (select 1 from public.automation_optouts o where o.phone = q.phone)
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
  select q.id, q.phone, q.message, q.parent_name, q.lead_id, q.rule_name
  from public.automation_queue q
  where q.id = picked;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- What happened to it
-- ---------------------------------------------------------------------------------------------

create or replace function public.automation_finish_auto(
  p_key text,
  p_id bigint,
  p_result text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored text;
begin
  select s.sender_key into stored from public.automation_sender s limit 1;
  if p_key is null or stored is null or p_key <> stored then
    raise exception 'not allowed' using errcode = '28000';
  end if;
  if p_result not in ('sent', 'failed', 'blocked') then
    raise exception 'unknown result';
  end if;

  if p_result = 'sent' then
    update public.automation_queue
    set status = 'sent', sent_at = now(), error = null
    where id = p_id and status = 'sending' and sent_by_automation;
  elsif p_result = 'failed' then
    update public.automation_queue
    set status = 'failed', error = left(coalesce(p_error, 'The message was not sent.'), 900)
    where id = p_id and status = 'sending' and sent_by_automation;
  else
    -- Left for a person: back in the queue, marked so the sender does not take it again.
    update public.automation_queue
    set status = 'pending',
        decided_at = null,
        sent_by_automation = false,
        auto_blocked = left(coalesce(p_error, 'Needs a person.'), 200)
    where id = p_id and status = 'sending' and sent_by_automation;
  end if;
end;
$$;

-- Only the edge function auto-sender (service role) calls these; it passes the key on.
revoke all on function public.automation_claim_auto(text) from public, anon, authenticated;
revoke all on function public.automation_finish_auto(text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.automation_claim_auto(text) to service_role;
grant execute on function public.automation_finish_auto(text, bigint, text, text) to service_role;
