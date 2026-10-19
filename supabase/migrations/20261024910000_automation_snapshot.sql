-- The automation queue's numbers in one request.
--
-- Before: the ⚡ window and the admin's Today asked five things every minute, each its own request (the
-- waiting messages, the pause/limit settings, the sending hours, how many went out today, and which
-- flows send by themselves). Now one call answers all five, with exactly the same rows and numbers.
--
-- security invoker: it runs as the person asking, so the same row rules (has_permission('leads')) apply
-- as when the five were asked one by one.

create or replace function public.automation_snapshot(p_since timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    -- The same as fetchQueue: waiting, sending or failed, the soonest first, at most 300.
    'queue', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.due_at, q.id)
      from (
        select id, rule_key, rule_name, phone, parent_name, child_name, lead_id, student_id, message, status,
               due_at, expires_at, decided_at, sent_at, error, created_at, auto_blocked, media_url,
               conversation_id, channel, kind
        from public.automation_queue
        where status in ('pending', 'sending', 'failed')
        order by due_at, id
        limit 300
      ) q
    ), '[]'::jsonb),
    -- The single settings row (null when there is none: the page then uses its defaults).
    'settings', (
      select jsonb_build_object(
        'paused', s.paused,
        'daily_cap', s.daily_cap,
        'gap_seconds', s.gap_seconds,
        'send_from_hour', s.send_from_hour,
        'send_until_hour', s.send_until_hour
      )
      from public.automation_settings s
      limit 1
    ),
    -- The same as fetchSentToday: sent since the start of the asker's day.
    'sent_today', (
      select count(*)
      from public.automation_queue
      where status = 'sent' and sent_at >= p_since
    ),
    -- The same as fetchAutoSendRuleKeys: switched-on flows whose settings say autoSend = true.
    'auto_rule_keys', coalesce((
      select jsonb_agg('flow_' || f.id order by f.id)
      from public.automation_flows f
      where f.enabled and f.graph #> '{settings,autoSend}' = 'true'::jsonb
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.automation_snapshot(timestamptz) from public, anon;
grant execute on function public.automation_snapshot(timestamptz) to authenticated;

notify pgrst, 'reload schema';
