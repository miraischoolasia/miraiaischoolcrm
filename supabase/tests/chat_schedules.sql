-- Checks for 20261025600000_chat_schedules.sql: a message or a flow for one chat, at a time.
-- Run on a scratch copy of the live schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/chat_schedules.sql

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

create function pg_temp.fails(p_sql text, p_pattern text, p_name text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then
      raise notice 'PASS %', p_name;
      return;
    end if;
    raise exception 'FAIL % (wrong error: %)', p_name, sqlerrm;
  end;
  raise exception 'FAIL % (no error)', p_name;
end;
$$;

create function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- An admin and a teacher with no Leads tick, a lead, and two flows with the same trigger.
insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000000000a1', 'test_mei_admin@example.test', 'authenticated', 'authenticated'),
       ('00000000-0000-0000-0000-0000000000b2', 'test_no_leads@example.test', 'authenticated', 'authenticated');
insert into public.teachers (id, full_name, username, role, auth_user_id, is_active)
overriding system value
values (990001, 'Mei Admin', 'test_mei_admin', 'admin', '00000000-0000-0000-0000-0000000000a1', true),
       (990002, 'No Leads', 'test_no_leads', 'teacher', '00000000-0000-0000-0000-0000000000b2', true);
insert into public.lead_stages (key, label) values ('new', 'New') on conflict do nothing;
insert into public.leads (id, full_name, status, children)
overriding system value
values (990001, 'Puan Aminah', 'new', '[{"name":"Ethan","age":8,"phone":null}]'::jsonb);
insert into public.automation_flows (id, name, trigger_type, enabled, graph)
overriding system value
values
  (990101, 'Trial follow-up', 'lead_created', true,
   '{"nodes":[{"id":"m1","type":"message","after":true,"mins":3,"text":"Hello again"}],"edges":[{"from":"trigger","port":"out","to":"m1"}],"settings":{"autoSend":false}}'),
  (990102, 'Another lead flow', 'lead_created', true,
   '{"nodes":[{"id":"m1","type":"message","after":true,"mins":3,"text":"Not for this person"}],"edges":[{"from":"trigger","port":"out","to":"m1"}],"settings":{"autoSend":false}}');

-- ---------------------------------------------------------------------------------------------
-- A message at a time.
-- ---------------------------------------------------------------------------------------------

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;

select public.chat_schedule_message(4242, 9100, null, 'whatsapp', '+60 12-345 6789', 990001, 'Puan Aminah',
  'See you on Saturday!', 'https://storage.example/p.jpg', now() + interval '2 hours', true) as first_id \gset
select pg_temp.ok((select status = 'scheduled' and created_by_name = 'Mei Admin' and phone = '60123456789'
  from public.chat_schedules where id = :first_id), 'a message is scheduled, with who did it');
select pg_temp.ok((select rule_key = 'chat_schedule' and status = 'pending' and conversation_id = 4242 and media_url like 'https://%'
  and due_at > now() + interval '1 hour' and message = 'See you on Saturday!'
  from public.automation_queue where chat_schedule_id = :first_id), 'its queue row waits for its time, with the picture');

select public.chat_schedule_change(:first_id, 'See you on Sunday!', null, now() + interval '3 hours', false);
select pg_temp.ok((select message = 'See you on Sunday!' and media_url is null and due_at > now() + interval '2 hours 30 minutes'
  from public.automation_queue where chat_schedule_id = :first_id), 'a change moves the queue row too');

select pg_temp.fails($$select public.chat_schedule_message(4242, 9100, null, 'whatsapp', null, null, null, 'x', null, now() - interval '1 hour', true)$$,
  'has not passed', 'not in the past');
select pg_temp.fails($$select public.chat_schedule_message(4242, 9100, null, 'whatsapp', null, null, null, '   ', null, now() + interval '1 hour', true)$$,
  'Write the message', 'not without words');

select public.chat_schedule_cancel(:first_id);
select pg_temp.ok((select s.status = 'cancelled' and q.status = 'skipped' and q.error like 'Cancelled by Mei Admin%'
  from public.chat_schedules s join public.automation_queue q on q.id = s.queue_id where s.id = :first_id), 'cancelled: kept, and its queue row skipped');

-- Someone without the Leads tick.
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000b2');
set local role authenticated;
select pg_temp.fails($$select public.chat_schedule_message(4242, 9100, null, 'whatsapp', null, null, null, 'x', null, now() + interval '1 hour', true)$$,
  'Only someone who may answer', 'not without the Leads tick');
select pg_temp.ok((select count(*) from public.chat_schedules) = 0, 'and they read none');
reset role;

-- ---------------------------------------------------------------------------------------------
-- The parent writes first: cancelled. One set not to stays.
-- ---------------------------------------------------------------------------------------------

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select public.chat_schedule_message(4242, 9100, null, 'whatsapp', '60123456789', 990001, null, 'Reminder', null, now() + interval '1 hour', true) as reply_id \gset
select public.chat_schedule_message(4242, 9100, null, 'whatsapp', '60123456789', 990001, null, 'Goes anyway', null, now() + interval '1 hour', false) as keep_id \gset
reset role;
update public.chat_schedules set created_at = now() - interval '5 minutes' where id in (:reply_id, :keep_id);

insert into public.chat_activity (conversation_id, contact_id, last_direction, last_message_at, last_incoming_at, waiting_started_at)
values (4242, 9100, 'incoming', now(), now(), now());
select pg_temp.ok((select s.status = 'replied' and q.status = 'skipped' from public.chat_schedules s join public.automation_queue q on q.id = s.queue_id
  where s.id = :reply_id), 'the parent replied first: cancelled');
select pg_temp.ok((select status = 'scheduled' from public.chat_schedules where id = :keep_id), 'one set to go anyway stays');

-- ---------------------------------------------------------------------------------------------
-- The automatic sender takes a scheduled message at its time (no flow switch needed).
-- ---------------------------------------------------------------------------------------------

update public.automation_queue set due_at = now() - interval '1 minute' where chat_schedule_id = :keep_id;
-- The sender's settings: on, every hour, room under the cap (the live ones keep their own).
insert into public.automation_settings (id, paused, send_from_hour, send_until_hour, gap_seconds, daily_cap)
values (true, false, 0, 24, 10, 200)
on conflict (id) do update set paused = false, send_from_hour = 0, send_until_hour = 24, gap_seconds = 10, daily_cap = 200;
insert into public.automation_sender (id) values (true) on conflict (id) do nothing;
select (select sender_key from public.automation_sender limit 1) as sender_key \gset
select pg_temp.ok(
  (select c.id from public.automation_claim_auto(:'sender_key') c) = (select id from public.automation_queue where chat_schedule_id = :keep_id),
  'the automatic sender takes it at its time, with no flow switch');
select pg_temp.ok((select status = 'sending' and sent_by_automation from public.automation_queue where chat_schedule_id = :keep_id), 'and marks it sending');
update public.automation_queue set status = 'sent', sent_at = now() where chat_schedule_id = :keep_id;
select pg_temp.ok((select status = 'sent' from public.chat_schedules where id = :keep_id), 'once sent, the schedule says so');

-- ---------------------------------------------------------------------------------------------
-- A flow started for this person: only that flow, from its start time.
-- ---------------------------------------------------------------------------------------------

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select public.chat_schedule_flow(5151, 9200, null, 'whatsapp', '60198765432', 990001, 'Puan Aminah', 990101, now() + interval '1 minute', true) as flow_start \gset
reset role;
update public.chat_schedules set run_at = now() - interval '5 minutes' where id = :flow_start;

select automation.run_rules();
select pg_temp.ok((select count(*) = 1 from public.automation_queue where dedupe_key = 'flow:990101:m1:manual:' || :flow_start and message = 'Hello again'),
  'the flow queued its message for this person');
select pg_temp.ok((select count(*) = 0 from public.automation_queue where dedupe_key like 'flow:990102:%:manual:%'),
  'the other flow with the same trigger did not');
select pg_temp.ok((select status = 'started' from public.chat_schedules where id = :flow_start), 'the start is marked started');

-- One that has not started is cancelled by a reply, and its flow queues nothing.
set local role authenticated;
select public.chat_schedule_flow(6161, 9300, null, 'whatsapp', '60111111111', 990001, null, 990101, now() + interval '2 hours', true) as flow_later \gset
reset role;
update public.chat_schedules set created_at = now() - interval '5 minutes' where id = :flow_later;
insert into public.chat_activity (conversation_id, contact_id, last_direction, last_message_at, last_incoming_at, waiting_started_at)
values (6161, 9300, 'incoming', now(), now(), now());
select pg_temp.ok((select status = 'replied' from public.chat_schedules where id = :flow_later), 'a flow not started yet is cancelled by a reply');

rollback;
