-- The sender on the WhatsApp server asked for the next message every 15 seconds, day and night. Each question
-- leaves log lines (the edge function, and its call to automation_claim_auto), and on the free plan those
-- logs are limited. Now the database also says how long the sender can wait before asking again:
--   paused                      -> 5 minutes (sending starts within 5 minutes of un-pausing)
--   outside the sending hours   -> until the hours open (at most 30 minutes at a time, so a change of hours
--                                  still counts soon)
--   today's limit reached       -> until the hours open tomorrow (at most 30 minutes at a time)
--   the gap after the last one  -> until the gap has passed (keeps a row of messages going at its pace)
--   nothing due                 -> 1 minute (a message that falls due goes out within a minute)
--
-- automation_claim_auto stays as it is (the older edge function and sender still call it); the new
-- automation_claim_auto_next calls it and adds the wait. automation_settings.sender_next_at is when the sender
-- said it would ask again, so the CRM can tell "asleep until 09:00" from "stopped".

alter table public.automation_settings add column if not exists sender_next_at timestamptz;

-- The wait, from the settings and what was sent (no table is read here, so it can be checked with any values).
create or replace function automation.sender_wait(
  p_now timestamptz,
  p_paused boolean,
  p_from integer,
  p_until integer,
  p_used integer,
  p_cap integer,
  p_last_at timestamptz,
  p_gap integer
)
returns table (wait_seconds integer, reason text)
language plpgsql
stable
set search_path = ''
as $$
declare
  local_now timestamp := p_now at time zone 'Asia/Kuala_Lumpur';
  local_hour integer := extract(hour from local_now)::integer;
  opens timestamp;
  gap_left numeric;
begin
  if coalesce(p_paused, false) then
    return query select 300, 'paused';
    return;
  end if;

  if local_hour < p_from or local_hour >= p_until then
    opens := date_trunc('day', local_now) + make_interval(hours => p_from);
    if local_hour >= p_from then
      opens := opens + interval '1 day';
    end if;
    return query select least(1800, greatest(5, ceil(extract(epoch from opens - local_now))::integer + 1)), 'closed';
    return;
  end if;

  if p_used >= p_cap then
    opens := date_trunc('day', local_now) + interval '1 day' + make_interval(hours => p_from);
    return query select least(1800, greatest(5, ceil(extract(epoch from opens - local_now))::integer + 1)), 'daily limit';
    return;
  end if;

  if p_last_at is not null then
    gap_left := p_gap - extract(epoch from p_now - p_last_at);
    if gap_left > 0 then
      return query select least(60, greatest(2, ceil(gap_left)::integer + 1)), 'gap';
      return;
    end if;
  end if;

  return query select 60, 'idle';
end;
$$;
revoke all on function automation.sender_wait(timestamptz, boolean, integer, integer, integer, integer, timestamptz, integer)
  from public, anon, authenticated;

create or replace function public.automation_claim_auto_next(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  picked jsonb;
  st record;
  used integer;
  last_at timestamptz;
  w record;
begin
  -- The key is checked in there (a wrong one raises 28000 here too).
  select to_jsonb(c) into picked from public.automation_claim_auto(p_key) c limit 1;

  if picked is not null then
    -- (a WHERE is needed: the API role refuses an UPDATE without one)
    update public.automation_settings cfg set sender_next_at = now() where cfg.id;
    return jsonb_build_object('message', picked, 'wait_seconds', null, 'reason', 'sending');
  end if;

  select s.paused, s.daily_cap, s.gap_seconds, s.send_from_hour, s.send_until_hour
  into st
  from public.automation_settings s
  limit 1;
  if not found then
    return jsonb_build_object('message', null, 'wait_seconds', 300, 'reason', 'not set up');
  end if;

  -- The same counts automation_claim_auto uses.
  select count(*) into used
  from public.automation_queue q
  where q.status in ('sent', 'sending')
    and coalesce(q.sent_at, q.decided_at)
        >= (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur');

  select max(coalesce(q.sent_at, q.decided_at)) into last_at
  from public.automation_queue q
  where q.status in ('sent', 'sending');

  select * into w
  from automation.sender_wait(
    now(), st.paused, st.send_from_hour, st.send_until_hour, used, st.daily_cap, last_at, st.gap_seconds
  );

  update public.automation_settings cfg
  set sender_next_at = now() + make_interval(secs => w.wait_seconds)
  where cfg.id;

  return jsonb_build_object('message', null, 'wait_seconds', w.wait_seconds, 'reason', w.reason);
end;
$$;

-- Only the edge function auto-sender (service role) calls it; it passes the key on.
revoke all on function public.automation_claim_auto_next(text) from public, anon, authenticated;
grant execute on function public.automation_claim_auto_next(text) to service_role;
