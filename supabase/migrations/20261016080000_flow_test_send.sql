-- "Send test to my phone" on the Automations page.
--
-- An admin picks a flow, types their own number and (optionally) the age and class of a pretend
-- child. Every message that child would get from the flow is added to the approval queue for that
-- number, with a made-up child, parent and class. Nothing is sent until a person approves it in the
-- queue, exactly like a real reminder, so the whole path (queue -> approval -> WhatsApp) can be tried
-- without waiting for a class and without touching a real family.
--
-- * Admin only. The flow is read as it was last saved.
-- * The messages start with "[TEST] ", are due now and expire after one hour.
-- * At most 20 test messages can be waiting at once, so a button pressed repeatedly cannot fill the
--   queue.
-- * The sample child is the same one "Try it with a child" uses on the canvas.

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

  for m in select * from automation.flow_messages(f.graph, p_age, p_classroom_id) loop
    insert into public.automation_queue
      (rule_key, rule_name, dedupe_key, phone, parent_name, child_name, message, due_at, expires_at)
    values (
      'flow_test_' || f.id,
      left('TEST · ' || f.name, 120),
      'test:' || f.id || ':' || m.node_id || ':' || gen_random_uuid()::text,
      digits,
      'Mrs Lim',
      'Ethan',
      left(
        '[TEST] ' ||
        replace(replace(replace(replace(replace(m.message_text,
          '{child}', 'Ethan'),
          '{parent}', 'Mrs Lim'),
          '{time}', '8:30 pm'),
          '{date}', to_char(now() at time zone 'Asia/Kuala_Lumpur', 'Dy DD Mon')),
          '{class}', 'Coder A'),
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
