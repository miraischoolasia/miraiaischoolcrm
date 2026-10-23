-- Checks for 20261101100000_chat_start_flow.sql (Inbox "+" > Start automation). Runs on the local test database
-- (never the live one); it rolls back.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/chat_start_flow.sql

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

update public.automation_flows set enabled = false;
update public.automation_settings set paused = false, family_weekly_cap = 0;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000000000a1', 'test_mei_admin@example.test', 'authenticated', 'authenticated'),
       ('00000000-0000-0000-0000-0000000000b2', 'test_no_leads@example.test', 'authenticated', 'authenticated');
insert into public.teachers (id, full_name, username, role, auth_user_id, is_active)
overriding system value
values (990001, 'Mei Admin', 'test_mei_admin', 'admin', '00000000-0000-0000-0000-0000000000a1', true),
       (990002, 'No Ticks', 'test_no_leads', 'teacher', '00000000-0000-0000-0000-0000000000b2', true);
insert into public.lead_stages (key, label) values ('new', 'New') on conflict do nothing;
-- Added a month ago: the lead_created flows are long done with her.
insert into public.leads (id, full_name, phone, status, children, tag_ids, created_at)
overriding system value
values (990001, 'Puan Aminah', '60198765432', 'new', '[{"name":"Ethan","age":8,"phone":null}]'::jsonb, '{}', now() - interval '30 days');

-- A two-step flow (now, then a day later), and one that only reminds before a class.
insert into public.automation_flows (id, name, trigger_type, enabled, graph)
overriding system value
values
  (990101, 'Welcome by hand', 'lead_created', true,
   '{"nodes":[{"id":"m1","type":"message","after":true,"mins":3,"text":"Hello {parent}"},
              {"id":"m2","type":"message","after":true,"mins":1440,"text":"A day later"}],
     "edges":[{"from":"trigger","port":"out","to":"m1"},{"from":"m1","port":"out","to":"m2"}],"settings":{"autoSend":false}}'),
  (990102, 'Switched off', 'lead_created', false,
   '{"nodes":[{"id":"m1","type":"message","after":true,"mins":3,"text":"x"}],"edges":[{"from":"trigger","port":"out","to":"m1"}]}'),
  (990103, 'Same trigger, not started', 'lead_created', true,
   '{"nodes":[{"id":"m1","type":"message","after":true,"mins":3,"text":"Not for this person"}],"edges":[{"from":"trigger","port":"out","to":"m1"}]}');

select pg_temp.ok(automation.flow_span_minutes((select graph from public.automation_flows where id = 990101)) = 1440,
  'a flow goes on until its last "after" step');

-- 1. Who may -------------------------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b2');
set local role authenticated;
select pg_temp.fails($$select public.chat_start_flow(5151, 9200, null, 'whatsapp', '60198765432', 990001, null, 990101)$$,
  'may edit Automations', 'without the Automations edit tick: refused');
select pg_temp.fails($$select public.chat_flow_state(5151, null, '60198765432', 990001, 990101)$$,
  'may edit Automations', 'and they cannot ask either');
reset role;

-- 2. Start now -----------------------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select pg_temp.ok((public.chat_flow_state(5151, null, '60198765432', 990001, 990101) ->> 'running')::boolean = false,
  'not in the flow yet');
select pg_temp.fails($$select public.chat_start_flow(5151, 9200, null, 'whatsapp', '60198765432', 990001, null, 990102)$$,
  'switched off', 'a flow that is switched off cannot be started');
select (public.chat_start_flow(5151, 9200, null, 'whatsapp', '+60 19-876 5432', 990001, 'Puan Aminah', 990101) ->> 'id')::bigint as start_id \gset
reset role;

select pg_temp.ok((select status = 'started' and created_by_name = 'Mei Admin' and run_at <= now() and not cancel_on_reply
  from public.chat_schedules where id = :start_id), 'started now, with who did it');

select automation.run_rules();
select pg_temp.ok((select count(*) = 1 from public.automation_queue
  where dedupe_key = 'flow:990101:m1:manual:' || :start_id and message = 'Hello Puan Aminah' and status = 'pending'),
  'its first step waits for approval (the flow does not send by itself)');
select pg_temp.ok(not exists (select 1 from public.automation_queue where rule_key = 'flow_990103' and lead_id = 990001),
  'another flow with the same trigger is not started');
select pg_temp.ok((select e.tag_ids = '{}'::bigint[] and e.age = 8 from automation.manual_events(990101) e where e.event_key = 'manual:' || :start_id),
  'the run sees the lead (tags, age) for the flow''s checks');

-- 3. Already in the flow -------------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select public.chat_flow_state(5151, null, '60198765432', 990001, 990101) as state \gset
select pg_temp.ok((:'state'::jsonb ->> 'running')::boolean and :'state'::jsonb ->> 'startedBy' = 'Mei Admin',
  'in the flow now, started by Mei Admin');
select public.chat_start_flow(5151, 9200, null, 'whatsapp', '60198765432', 990001, null, 990101) as again \gset
select pg_temp.ok((:'again'::jsonb ->> 'started')::boolean = false and (:'again'::jsonb -> 'state' ->> 'running')::boolean,
  'starting again without saying so: not started twice, told why');
select pg_temp.ok((select count(*) = 1 from public.chat_schedules where flow_id = 990101), 'still one run');

-- 4. Start again from the first step ---------------------------------------------------------------------------
select (public.chat_start_flow(5151, 9200, null, 'whatsapp', '60198765432', 990001, null, 990101, true) ->> 'id')::bigint as second_id \gset
reset role;
select pg_temp.ok((select status = 'cancelled' from public.chat_schedules where id = :start_id), 'the first run is stopped');
select pg_temp.ok((select status = 'skipped' and error like 'Started again from the first step by Mei Admin%'
  from public.automation_queue where dedupe_key = 'flow:990101:m1:manual:' || :start_id), 'its waiting message is skipped');
select automation.run_rules();
select pg_temp.ok((select count(*) = 1 from public.automation_queue where dedupe_key = 'flow:990101:m1:manual:' || :second_id and status = 'pending'),
  'the flow starts again from its first step');

-- 5. A run that started by itself, started again by hand -------------------------------------------------------
insert into public.leads (id, full_name, phone, status, children, created_at)
overriding system value
values (990002, 'Encik Lim', '60123334444', 'new', '[{"name":"Mia","age":7}]'::jsonb, now() - interval '10 minutes');
select automation.run_rules();
select pg_temp.ok((select count(*) = 1 from public.automation_queue where dedupe_key = 'flow:990101:m1:lead:990002'),
  'a new lead starts the flow by itself');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select public.chat_flow_state(6161, null, '60123334444', 990002, 990101) as auto_state \gset
select pg_temp.ok((:'auto_state'::jsonb ->> 'running')::boolean and :'auto_state'::jsonb ->> 'startedBy' is null,
  'in the flow, started automatically');
select (public.chat_start_flow(6161, 9300, null, 'whatsapp', '60123334444', 990002, null, 990101, true) ->> 'id')::bigint as third_id \gset
reset role;
select pg_temp.ok(exists (select 1 from automation.flow_event_stops where flow_id = 990101 and event_key = 'lead:990002'),
  'the run that started by itself is stopped');
update public.automation_queue set status = 'skipped' where dedupe_key = 'flow:990101:m1:lead:990002' and status = 'pending';
delete from public.automation_queue where dedupe_key = 'flow:990101:m1:lead:990002';
select automation.run_rules();
select pg_temp.ok(not exists (select 1 from public.automation_queue where dedupe_key = 'flow:990101:m1:lead:990002'),
  'the runner leaves the stopped run alone');
select pg_temp.ok(exists (select 1 from public.automation_queue where dedupe_key = 'flow:990101:m1:manual:' || :third_id),
  'and the new run goes');

rollback;
