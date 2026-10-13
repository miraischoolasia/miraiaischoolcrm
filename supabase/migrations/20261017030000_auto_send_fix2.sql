-- Second fix for automation_claim_auto: 20261017020000 added the WHERE the API's safe-update guard needs,
-- but "id" there is also the name of an output column of the function, which PostgreSQL refuses as
-- ambiguous. The settings row is now named (st.id). Same function otherwise.

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

  -- (a WHERE is needed: the API role refuses an UPDATE without one)
  update public.automation_settings st set sender_seen_at = now() where st.id;

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

revoke all on function public.automation_claim_auto(text) from public, anon, authenticated;
grant execute on function public.automation_claim_auto(text) to service_role;
