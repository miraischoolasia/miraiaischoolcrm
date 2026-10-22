-- Checks for 20261029700000_automation_phase1.sql. Runs on the local test database (it uses its fake data:
-- students, attendance, leads); it rolls back.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/automation_phase1.sql

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
      raise notice 'PASS % [%]', p_name, sqlerrm;
      return;
    end if;
    raise exception 'FAIL % (wrong error: %)', p_name, sqlerrm;
  end;
  raise exception 'FAIL % (no error)', p_name;
end;
$$;

-- A walk of one condition: 'yes' or 'no'.
create function pg_temp.port(p_node jsonb, p_tags bigint[], p_hours numeric, p_at timestamptz, p_key text, p_student bigint)
returns text language sql as $$
  select w.port from automation.flow_walk(
    jsonb_build_object(
      'trigger', jsonb_build_object('x', 0, 'y', 0),
      'nodes', jsonb_build_array(p_node || '{"id":"c1","type":"condition","x":0,"y":0}'::jsonb),
      'edges', '[{"from":"trigger","port":"out","to":"c1"}]'::jsonb
    ),
    null, null, p_hours, null, null, null, p_tags, null, null, null, null, p_at, now(), p_key, p_student
  ) w where w.node_id = 'c1';
$$;

-- ---- Events --------------------------------------------------------------------------------------------
select pg_temp.ok(
  (select count(*) = count(distinct event_key) from automation.phase1_events),
  'every new event appears once'
);
select pg_temp.ok(
  exists (select 1 from automation.rule_events where trigger_type = 'class_absent' and student_id is not null and phone is not null),
  'absences of regular classes are events, with the family phone'
);
select pg_temp.ok(
  not exists (
    select 1 from automation.rule_events e
    join automation.trials t on t.student_id = e.student_id and t.booking_date = e.class_date
    where e.trigger_type = 'class_absent'
  ),
  'trial classes are not class_absent events (they have their own triggers)'
);
select pg_temp.ok(
  (select count(*) from automation.rule_events where trigger_type = 'birthday')
    = 2 * (select count(*) from public.students where is_active and date_of_birth is not null),
  'a birthday event for this year and next year per child with a birth date'
);
select pg_temp.ok(exists (select 1 from automation.rule_events where trigger_type = 'app_account'), 'app logins are events');

-- A lead moved to a stage and given a tag.
create temp table t_lead as select id, status from public.leads where phone ~ '^[0-9]{8,15}$' and status not in ('converted', 'lost') order by id limit 1;
insert into public.lead_options (kind, label) values ('tag', 'Phase1 test tag') returning id as tag_id \gset
update public.leads set status = 'trial_completed' where id = (select id from t_lead);
update public.leads set tag_ids = array_append(coalesce(tag_ids, '{}'), :tag_id) where id = (select id from t_lead);
select pg_temp.ok(
  exists (select 1 from automation.rule_events where trigger_type = 'lead_stage' and lead_id = (select id from t_lead) and lead_status = 'trial_completed'),
  'moving a lead to a stage is an event that carries the new stage'
);
select pg_temp.ok(
  exists (select 1 from automation.rule_events where trigger_type = 'lead_tag' and event_key like 'tag:' || (select id from t_lead) || ':' || :tag_id || ':%'),
  'giving a lead a tag is an event that names the tag'
);

-- Lessons left: a lesson used makes an event with the new count.
create temp table t_used as
select s.id as student_id, (select ll.id from public.lesson_logs ll limit 1) as log_id from public.students s where s.is_active order by s.id limit 1;
insert into public.student_lesson_ledger (student_id, lesson_log_id, delta_lessons, reason)
select student_id, log_id, -1, 'phase1 test' from t_used;
select pg_temp.ok(
  exists (select 1 from automation.rule_events e join t_used u on u.student_id = e.student_id where e.trigger_type = 'lessons_left'),
  'a used lesson makes a lessons-left event'
);

-- ---- Conditions ------------------------------------------------------------------------------------------
select pg_temp.ok(pg_temp.port('{"kind":"tag_not","ids":["5"]}', array[1, 2]::bigint[], null, now(), null, null) = 'yes', 'does not have a tag: yes');
select pg_temp.ok(pg_temp.port('{"kind":"tag_not","ids":["2"]}', array[1, 2]::bigint[], null, now(), null, null) = 'no', 'does not have a tag: no');
select pg_temp.ok(pg_temp.port('{"kind":"subject","is":"student"}', null, null, now(), null, 3) = 'yes', 'is a student');
select pg_temp.ok(pg_temp.port('{"kind":"subject","is":"lead"}', null, null, now(), null, 3) = 'no', 'a student is not a lead');
select pg_temp.ok(pg_temp.port('{"kind":"hours_is","value":"3"}', null, 3, now(), null, null) = 'yes', 'exactly 3 lessons left');
select pg_temp.ok(pg_temp.port('{"kind":"hours_is","value":"3"}', null, 2, now(), null, null) = 'no', 'not 3 lessons left');
-- Tuesday 27 Oct 2026, 10:00 in Malaysia.
select pg_temp.ok(pg_temp.port('{"kind":"weekday","days":["1"],"from":"9","to":"18"}', null, null, '2026-10-27 02:00+00', null, null) = 'no', 'Tuesday 10 am is not Monday-only');
select pg_temp.ok(pg_temp.port('{"kind":"weekday","days":["2"],"from":"9","to":"18"}', null, null, '2026-10-27 02:00+00', null, null) = 'yes', 'Tuesday 10 am inside the days and hours');
select pg_temp.ok(pg_temp.port('{"kind":"weekday","days":["2"],"from":"12","to":"18"}', null, null, '2026-10-27 02:00+00', null, null) = 'no', 'too early in the day');
select pg_temp.ok(pg_temp.port('{"kind":"tag_added","ids":["44"]}', null, null, now(), 'tag:9:44:1', null) = 'yes', 'the tag that was added');
select pg_temp.ok(pg_temp.port('{"kind":"tag_added","ids":["45"]}', null, null, now(), 'tag:9:44:1', null) = 'no', 'another tag was added');
select pg_temp.ok(
  (select pg_temp.port(('{"kind":"att_status","ids":["' || automation.absence_status(e.event_key) || '"]}')::jsonb, null, null, now(), e.event_key, e.student_id)
   from automation.rule_events e where e.trigger_type = 'class_absent' limit 1) = 'yes',
  'the attendance status of the absence'
);
select pg_temp.ok(
  (select pg_temp.port('{"kind":"absent_streak","min":"20"}', null, null, now(), e.event_key, e.student_id)
   from automation.rule_events e where e.trigger_type = 'class_absent' limit 1) = 'no',
  'not absent 20 times in a row'
);
select pg_temp.ok(
  (select automation.absent_streak(e.student_id, split_part(e.event_key, ':', 3)::date) >= 1
   from automation.rule_events e where e.trigger_type = 'class_absent' limit 1),
  'an absence counts at least 1 in a row'
);

-- ---- The flow checker -----------------------------------------------------------------------------------
select pg_temp.fails($$
  insert into public.automation_flows (name, trigger_type, enabled, graph) values ('bad', 'lead_tag', false,
  '{"trigger":{"x":0,"y":0},"nodes":[{"id":"a1","type":"action","x":0,"y":0,"action":"notify_staff","value":"{\"to\":\"everyone\",\"text\":\"x\"}","mins":0,"after":true}],"edges":[{"from":"trigger","port":"out","to":"a1"}]}')
$$, 'who it is for', 'a note to staff must say who it is for');
select pg_temp.fails($$
  insert into public.automation_flows (name, trigger_type, enabled, graph) values ('bad', 'class_absent', false,
  '{"trigger":{"x":0,"y":0},"nodes":[{"id":"c1","type":"condition","x":0,"y":0,"kind":"absent_streak","min":"1"}],"edges":[{"from":"trigger","port":"out","to":"c1"}]}')
$$, 'in a row', 'absent in a row must be at least 2');

-- ---- Steps ------------------------------------------------------------------------------------------------
create temp table t_staff as select id from public.teachers where is_active order by id limit 1;
insert into public.automation_flows (name, trigger_type, enabled, graph) values ('Phase1 steps', 'lead_tag', false,
  ('{"trigger":{"x":0,"y":0},"nodes":['
   || '{"id":"r1","type":"action","x":0,"y":0,"action":"remove_tag","value":"' || :tag_id || '","mins":0,"after":true},'
   || '{"id":"n1","type":"action","x":0,"y":0,"action":"notify_staff","value":"{\"to\":\"' || (select id from t_staff) || '\",\"text\":\"Call {parent}\"}","mins":0,"after":true},'
   || '{"id":"t1","type":"action","x":0,"y":0,"action":"create_task","value":"{\"to\":\"' || (select id from t_staff) || '\",\"title\":\"Follow up {child}\",\"days\":2}","mins":0,"after":true},'
   || '{"id":"p1","type":"action","x":0,"y":0,"action":"notify_staff","value":"{\"to\":\"pic\",\"text\":\"x\"}","mins":0,"after":true}'
   || '],"edges":[{"from":"trigger","port":"out","to":"r1"},{"from":"r1","port":"out","to":"n1"},{"from":"n1","port":"out","to":"t1"},{"from":"t1","port":"out","to":"p1"}]}')::jsonb)
returning id as flow_id \gset
update public.leads set pic_id = null where id = (select id from t_lead);
select automation.do_flow_action(:flow_id, 'test:1', 'r1', 'remove_tag', :tag_id::text, (select id from t_lead), null, 'Mum', 'Ah Boy', null, now());
select pg_temp.ok(not ((select tag_ids from public.leads where id = (select id from t_lead)) @> array[:tag_id]::bigint[]), 'remove a tag');
select automation.do_flow_action(:flow_id, 'test:1', 'n1', 'notify_staff',
  '{"to":"' || (select id from t_staff) || '","text":"Call {parent}"}', (select id from t_lead), null, 'Mum', 'Ah Boy', null, now());
select pg_temp.ok(
  exists (select 1 from public.staff_notifications where teacher_id = (select id from t_staff) and body = 'Call Mum' and flow_id = :flow_id),
  'notify a chosen staff member in the CRM, with the parent''s name filled in'
);
select automation.do_flow_action(:flow_id, 'test:1', 't1', 'create_task',
  '{"to":"' || (select id from t_staff) || '","title":"Follow up {child}","days":2}', (select id from t_lead), null, 'Mum', 'Ah Boy', null, now());
select pg_temp.ok(
  exists (
    select 1 from public.calendar_items
    where kind = 'task' and title = 'Follow up Ah Boy' and assignee_id = (select id from t_staff)
      and lead_id = (select id from t_lead) and item_date = (now() at time zone 'Asia/Kuala_Lumpur')::date + 2
  ),
  'a follow-up task for the chosen person, due in 2 days'
);
select automation.do_flow_action(:flow_id, 'test:1', 'p1', 'notify_staff', '{"to":"pic","text":"x"}', (select id from t_lead), null, null, null, null, now());
select pg_temp.ok(
  exists (select 1 from public.automation_flow_log where flow_id = :flow_id and node_id = 'p1' and kind = 'action_skipped' and detail like 'Nobody is in charge%'),
  'no PIC: the note is skipped and the log says why'
);

-- ---- The weekly limit -------------------------------------------------------------------------------------
update public.automation_settings set family_weekly_cap = 1, paused = false;
insert into public.automation_flows (name, trigger_type, enabled, graph) values ('Phase1 tagged', 'lead_tag', true,
  '{"trigger":{"x":0,"y":0},"nodes":[{"id":"m1","type":"message","x":0,"y":0,"mins":3,"after":true,"text":"Hi {parent}"}],"edges":[{"from":"trigger","port":"out","to":"m1"}]}')
returning id as tagged_flow \gset
insert into public.automation_queue (rule_key, rule_name, dedupe_key, phone, message, due_at, expires_at)
select 'flow_0', 'Earlier', 'phase1:earlier', l.phone, 'Earlier message', now() - interval '1 day', now() + interval '1 day'
from public.leads l where l.id = (select id from t_lead);
update public.leads set tag_ids = array_append(coalesce(tag_ids, '{}'), :tag_id) where id = (select id from t_lead);
select automation.run_rules();
select pg_temp.ok(
  exists (select 1 from public.automation_flow_log where flow_id = :tagged_flow and kind = 'weekly_limit'),
  'over the weekly limit: skipped and logged'
);
select pg_temp.ok(
  not exists (select 1 from public.automation_queue where rule_key = 'flow_' || :tagged_flow),
  'nothing was queued over the limit'
);
update public.automation_settings set family_weekly_cap = 0;
delete from public.automation_flow_log where flow_id = :tagged_flow;
select automation.run_rules();
select pg_temp.ok(
  exists (select 1 from public.automation_queue where rule_key = 'flow_' || :tagged_flow and status = 'pending'),
  'with no limit the message waits for approval'
);

rollback;
