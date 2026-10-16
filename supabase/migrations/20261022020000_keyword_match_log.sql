-- A flow that starts from a message with a keyword writes down WHICH message started it.
--
-- Until now the log of such a flow only knew the event ("kw:<chat>:<message>"), so Enrollment history could not
-- say what the person wrote. The runner now adds one "keyword_matched" row per start, with the words the person
-- wrote (cut at 200 characters) and the channel. The row stays for 90 days like the rest of the log, long after
-- the kept text itself is tidied away.

alter table public.automation_flow_log drop constraint if exists automation_flow_log_kind_check;
alter table public.automation_flow_log
  add constraint automation_flow_log_kind_check
  check (kind in (
    'stage_stopped', 'cooldown', 'condition_no', 'no_message', 'no_phone', 'opted_out',
    'replied', 'no_reply', 'reply_branch', 'action_done', 'action_skipped', 'channel_off',
    'keyword_matched'
  ));

create or replace function automation.log_keyword_match(
  p_flow bigint,
  p_event_key text,
  p_phone text,
  p_parent text,
  p_child text,
  p_lead bigint,
  p_student bigint,
  p_starts timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  m record;
begin
  if p_event_key !~ '^kw:[0-9]+:[0-9]+$' then
    return;
  end if;
  -- One row per start: no need to read the message again once it is written.
  if exists (
    select 1 from public.automation_flow_log l
    where l.flow_id = p_flow and l.event_key = left(p_event_key, 200) and l.node_id = '' and l.kind = 'keyword_matched'
  ) then
    return;
  end if;
  select cm.body, cm.channel into m
  from public.chat_messages cm
  where cm.id = split_part(p_event_key, ':', 3)::bigint;
  if not found then
    return;
  end if;
  perform automation.log_flow_event(
    p_flow, p_event_key, '', 'keyword_matched',
    format('They wrote “%s” on %s.', left(regexp_replace(m.body, '\s+', ' ', 'g'), 200), case coalesce(m.channel, 'whatsapp') when 'messenger' then 'Messenger' when 'instagram' then 'Instagram' else 'WhatsApp' end),
    p_phone, p_parent, p_child, p_lead, p_student, p_starts
  );
end;
$$;

revoke all on function automation.log_keyword_match(bigint, text, text, text, text, bigint, bigint, timestamptz)
  from public, anon, authenticated;

do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid from pg_proc p
  where p.pronamespace = 'automation'::regnamespace and p.proname = 'run_rules';
  if v_oid is null then
    raise exception 'run_rules is missing.';
  end if;
  v_def := replace(pg_get_functiondef(v_oid), chr(13), '');
  v_new := replace(v_def,
    $a$        if f.trigger_type = 'message_keyword'
           and not automation.keyword_event_wanted(f.id, f.graph, ev.event_key) then
          continue;
        end if;
$a$,
    $b$        if f.trigger_type = 'message_keyword' then
          if not automation.keyword_event_wanted(f.id, f.graph, ev.event_key) then
            continue;
          end if;
          perform automation.log_keyword_match(
            f.id, ev.event_key, ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
          );
        end if;
$b$);
  if v_new = v_def then
    raise exception 'run_rules: the keyword place was not found.';
  end if;
  execute v_new;
end;
$$;
