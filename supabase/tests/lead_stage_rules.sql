-- Checks for 20261029400000_lead_stage_rules.sql (and 20261029500000_trial_events_use_attended_flag.sql).
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/lead_stage_rules.sql
-- Part 1 proves that with the default switches every function behaves as it did before; the rest proves each switch
-- and the two new triggers (trial attended / absent).

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

create function pg_temp.stage(p_lead bigint) returns text language sql as $$
  select status from public.leads where id = p_lead;
$$;

select webhook_key as key from public.chat_webhook_settings limit 1 \gset

-- An admin who is signed in, a trial classroom with a weekly slot.
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000d1');
insert into public.teachers (id, auth_user_id, username, full_name, role) overriding system value
values (99861, '00000000-0000-0000-0000-0000000000d1', 'stage_rules_admin', 'Stage Rules Admin', 'admin');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

insert into public.classrooms (id, name, age_group, program_level, teacher_id, status, category) overriding system value
values (99871, 'Stage Rules HOA', '6-8 Years Old', 'Coder Foundation', 99861, 'active', 'trial'),
       (99872, 'Stage Rules Class', '6-8 Years Old', 'Coder Foundation', 99861, 'active', 'regular');
-- The next Monday after tomorrow.
select (current_date + 2 + ((8 - extract(dow from current_date + 2)::int) % 7)) as monday \gset
insert into public.schedules (id, teacher_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, status, classroom_id)
overriding system value
values (99881, 99861, 'Stage Rules HOA slot', 'regular', 'weekly', 1, '10:00', '11:00', current_date - 30, 'active', 99871);

-- ---------------------------------------------------------------------------------------------
-- The switches exist and are all on, with the old behaviour as the options.
-- ---------------------------------------------------------------------------------------------
select pg_temp.ok((select count(*) from public.lead_stage_rules where enabled) = 4, 'four rules, all on');
select pg_temp.ok((select options ->> 'students' from public.lead_stage_rules where key = 'converted_on_student_phone') = 'all', 'every student counts by default');
select pg_temp.ok((select (options ->> 'count_automated')::boolean from public.lead_stage_rules where key = 'contacted_on_reply'), 'an automatic message counts by default');

-- ---------------------------------------------------------------------------------------------
-- 1. The school writes to the parent: New -> Contacted
-- ---------------------------------------------------------------------------------------------
insert into public.leads (id, full_name, phone, status) overriding system value
values (99811, 'Contact One', '60123450811', 'new'),
       (99812, 'Contact Two', '60123450812', 'trial_scheduled');

-- The old call with three arguments still works.
select pg_temp.ok(public.mark_lead_contacted_from_chat(:'key', 99001, '60123450811') = 99811, 'default: a message moves New to Contacted');
select pg_temp.ok(pg_temp.stage(99811) = 'contacted', '...the lead is Contacted');
select pg_temp.ok(public.mark_lead_contacted_from_chat(:'key', 99002, '60123450812') is null and pg_temp.stage(99812) = 'trial_scheduled',
  'default: a lead further on is not moved back');
update public.leads set status = 'new' where id = 99811;
select pg_temp.ok(public.mark_lead_contacted_from_chat(:'key', 99001, '60123450811', true) = 99811, 'default: an automatic message counts too');

-- Only a person's message counts.
update public.leads set status = 'new' where id = 99811;
select public.set_lead_stage_rule('contacted_on_reply', true, '{"count_automated": false}');
select pg_temp.ok(public.mark_lead_contacted_from_chat(:'key', 99001, '60123450811', true) is null and pg_temp.stage(99811) = 'new',
  'an automatic message does not count when only a person counts');
select pg_temp.ok(public.mark_lead_contacted_from_chat(:'key', 99001, '60123450811', false) = 99811, '...a person message does');

-- Switched off.
update public.leads set status = 'new' where id = 99811;
select public.set_lead_stage_rule('contacted_on_reply', false, null);
select pg_temp.ok(public.mark_lead_contacted_from_chat(:'key', 99001, '60123450811', false) is null and pg_temp.stage(99811) = 'new',
  'switched off: no message moves the lead');
select public.set_lead_stage_rule('contacted_on_reply', true, '{"count_automated": true}');

-- ---------------------------------------------------------------------------------------------
-- 2. A student has the lead's number
-- ---------------------------------------------------------------------------------------------
insert into public.leads (id, full_name, phone, status) overriding system value
values (99821, 'Phone One', '60123450821', 'contacted'),
       (99822, 'Phone Two', '60123450822', 'contacted'),
       (99823, 'Phone Three', '60123450823', 'contacted');

-- Defaults: a trial student with the number converts it (as it did before).
insert into public.students (id, full_name, phone, student_type, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values (99701, 'Trial Kid', '60123450821', 'trial', 0, '2099-12-31', '2099-12-31', '2099-12-31');
select pg_temp.ok(pg_temp.stage(99821) = 'converted' and (select converted_student_id from public.leads where id = 99821) = 99701,
  'default: any student with the number converts the lead');

-- Only regular students count: a trial student leaves the lead alone, a regular one converts it.
select public.set_lead_stage_rule('converted_on_student_phone', true, '{"students": "regular"}');
insert into public.students (id, full_name, phone, student_type, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values (99702, 'Trial Kid Two', '60123450822', 'trial', 0, '2099-12-31', '2099-12-31', '2099-12-31');
select pg_temp.ok(pg_temp.stage(99822) = 'contacted' and (select converted_student_id from public.leads where id = 99822) is null,
  'regular only: a trial student does not convert the lead');
select pg_temp.ok((select parent_id from public.people where student_id = 99702) = (select id from public.people where lead_id = 99822 and kind = 'parent'),
  '...but the child is still tied to the parent');
insert into public.students (id, full_name, phone, student_type, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values (99703, 'Regular Kid', '60123450822', 'regular', 0, '2099-12-31', '2099-12-31', '2099-12-31');
select pg_temp.ok(pg_temp.stage(99822) = 'converted', 'regular only: a regular student converts the lead');

-- Switched off.
select public.set_lead_stage_rule('converted_on_student_phone', false, null);
insert into public.students (id, full_name, phone, student_type, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values (99704, 'Regular Kid Two', '60123450823', 'regular', 0, '2099-12-31', '2099-12-31', '2099-12-31');
select pg_temp.ok(pg_temp.stage(99823) = 'contacted' and (select converted_student_id from public.leads where id = 99823) is null,
  'switched off: the lead is left alone');
select public.set_lead_stage_rule('converted_on_student_phone', true, '{"students": "all"}');

-- ---------------------------------------------------------------------------------------------
-- 3. A student is made from a lead
-- ---------------------------------------------------------------------------------------------
insert into public.leads (id, full_name, phone, status) overriding system value
values (99831, 'Enrol One', '60123450831', 'trial_completed'),
       (99832, 'Enrol Two', '60123450832', 'trial_completed');
select public.create_student_record('Enrolled Kid One', null, 0, current_date, current_date, current_date, null, 'regular', null, 99872, 99831);
select pg_temp.ok(pg_temp.stage(99831) = 'converted' and (select converted_student_id from public.leads where id = 99831) is not null,
  'default: a student made from the lead converts it');
select public.set_lead_stage_rule('converted_on_enrol', false, null);
select public.create_student_record('Enrolled Kid Two', null, 0, current_date, current_date, current_date, null, 'regular', null, 99872, 99832);
select pg_temp.ok(pg_temp.stage(99832) = 'trial_completed' and (select converted_student_id from public.leads where id = 99832) is not null,
  'switched off: the lead is tied to the student but keeps its stage');
select public.set_lead_stage_rule('converted_on_enrol', true, null);

-- ---------------------------------------------------------------------------------------------
-- 4. A trial is booked (the phone is not the lead's, so only this rule is at work)
-- ---------------------------------------------------------------------------------------------
insert into public.leads (id, full_name, phone, status, children) overriding system value
values (99841, 'Book One', '60123450841', 'new', '[]'),
       (99842, 'Book Two', '60123450842', 'contacted', '[]');
select public.book_trial_slot(99881, :'monday'::date, 'Booked Kid One', 9, '60123459941', 99841);
select pg_temp.ok(pg_temp.stage(99841) = 'trial_scheduled', 'default: a booking moves New to Trial Scheduled');
-- A booking made for a number no lead has makes the lead, and the trial student made by the booking carries that same
-- number, so with the defaults (every student counts) the "student has the lead's number" rule converts it at once.
-- That is how the database behaved before the switches; "regular only" is the setting that stops it (tested below).
select public.book_trial_slot(99881, :'monday'::date, 'Booked New Kid', 9, '60123459943', null);
select pg_temp.ok((select status from public.leads where phone = '60123459943') = 'converted', 'default (as before): the lead made by a booking is converted by the trial student''s number');
select public.set_lead_stage_rule('converted_on_student_phone', true, '{"students": "regular"}');
select public.book_trial_slot(99881, :'monday'::date, 'Booked New Kid Three', 9, '60123459945', null);
select pg_temp.ok((select status from public.leads where phone = '60123459945') = 'trial_scheduled', 'regular only: the lead made by a booking stays at Trial Scheduled');
select public.set_lead_stage_rule('converted_on_student_phone', true, '{"students": "all"}');
select public.set_lead_stage_rule('trial_scheduled_on_booking', false, null);
select public.book_trial_slot(99881, :'monday'::date, 'Booked Kid Two', 9, '60123459942', 99842);
select pg_temp.ok(pg_temp.stage(99842) = 'contacted', 'switched off: a booking leaves the lead where it is');
select public.set_lead_stage_rule('converted_on_student_phone', true, '{"students": "regular"}');
select public.book_trial_slot(99881, :'monday'::date, 'Booked New Kid Two', 9, '60123459944', null);
select public.set_lead_stage_rule('converted_on_student_phone', true, '{"students": "all"}');
select pg_temp.ok((select status from public.leads where phone = '60123459944') = 'new', 'switched off: a lead made by the booking starts at New');
select public.set_lead_stage_rule('trial_scheduled_on_booking', true, null);

-- ---------------------------------------------------------------------------------------------
-- The switches can only be set by a person who may edit Automations, and only to known values.
-- ---------------------------------------------------------------------------------------------
do $$
begin
  begin
    perform public.set_lead_stage_rule('contacted_on_reply', true, '{"count_automated": "yes"}');
    raise exception 'FAIL a bad option was accepted';
  exception when others then
    if sqlerrm = 'count_automated must be true or false.' then null; else raise; end if;
  end;
  begin
    perform public.set_lead_stage_rule('converted_on_student_phone', true, '{"students": "some"}');
    raise exception 'FAIL a bad option was accepted';
  exception when others then
    if sqlerrm = 'students must be all or regular.' then null; else raise; end if;
  end;
  begin
    perform public.set_lead_stage_rule('nothing', true, null);
    raise exception 'FAIL an unknown rule was accepted';
  exception when others then
    if sqlerrm = 'That rule does not exist.' then null; else raise; end if;
  end;
end;
$$;
select pg_temp.ok(true, 'unknown rules and options are refused');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ee","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.set_lead_stage_rule('contacted_on_reply', false, null);
    raise exception 'FAIL a person without the right changed a rule';
  exception when others then
    if sqlerrm = 'Not allowed.' then null; else raise; end if;
  end;
end;
$$;
select pg_temp.ok((select enabled from public.lead_stage_rules where key = 'contacted_on_reply'), 'a person who may not edit Automations cannot change a rule');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------------------------
-- The two new triggers: HOA trial attended / absent
-- ---------------------------------------------------------------------------------------------
-- (the bookings made above each have a trial student)
select tb.id as b1, tb.student_id as s1 from public.trial_bookings tb where tb.child_name = 'Booked Kid One' \gset
select tb.id as b2, tb.student_id as s2 from public.trial_bookings tb where tb.child_name = 'Booked Kid Two' \gset
select tb.id as b3, tb.student_id as s3 from public.trial_bookings tb where tb.child_name = 'Booked New Kid' \gset

select pg_temp.ok((select count(*) from automation.rule_events where trigger_type in ('trial_attended', 'trial_absent')) = 0,
  'no attendance yet: no trial result events');

insert into public.lesson_logs (id, schedule_id, teacher_id, lesson_date, revision_number) overriding system value
values (99891, 99881, 99861, :'monday'::date, 1);
insert into public.lesson_log_students (lesson_log_id, student_id, attendance_status)
values (99891, :s1, 'present'), (99891, :s2, 'absent'), (99891, :s3, 'leave');

select pg_temp.ok((select trigger_type from automation.rule_events where event_key = 'trial_attended:' || :b1) = 'trial_attended', 'present: a trial_attended event');
select pg_temp.ok((select lead_id from automation.rule_events where event_key = 'trial_attended:' || :b1) = 99841, '...for the booking''s lead');
select pg_temp.ok((select trigger_type from automation.rule_events where event_key = 'trial_absent:' || :b2) = 'trial_absent', 'absent: a trial_absent event');
select pg_temp.ok((select trigger_type from automation.rule_events where event_key = 'trial_absent:' || :b3) = 'trial_absent', 'on leave counts as absent');

-- The latest attendance wins.
insert into public.lesson_logs (id, schedule_id, teacher_id, lesson_date, revision_number, parent_log_id) overriding system value
values (99892, 99881, 99861, :'monday'::date, 2, 99891);
insert into public.lesson_log_students (lesson_log_id, student_id, attendance_status)
values (99892, :s1, 'absent'), (99892, :s2, 'absent'), (99892, :s3, 'leave');
select pg_temp.ok(not exists (select 1 from automation.rule_events where event_key = 'trial_attended:' || :b1)
  and exists (select 1 from automation.rule_events where event_key = 'trial_absent:' || :b1), 'a corrected attendance replaces the old event');

-- A status the school added itself counts by its own flag: Late (attended) is an attended event, No-show (not attended) an absent one.
insert into public.attendance_statuses (key, label, attended, deducts_lesson, color, sort_order)
values ('late_t', 'Late T', true, true, 'amber', 40), ('noshow_t', 'No-show T', false, true, 'rose', 50);
insert into public.lesson_logs (id, schedule_id, teacher_id, lesson_date, revision_number, parent_log_id) overriding system value
values (99893, 99881, 99861, :'monday'::date, 3, 99892);
insert into public.lesson_log_students (lesson_log_id, student_id, attendance_status)
values (99893, :s1, 'late_t'), (99893, :s2, 'noshow_t'), (99893, :s3, 'present');
select pg_temp.ok(exists (select 1 from automation.rule_events where event_key = 'trial_attended:' || :b1), 'a school status that counts as attended is an attended event');
select pg_temp.ok(exists (select 1 from automation.rule_events where event_key = 'trial_absent:' || :b2), 'a school status that does not count as attended is an absent event');
select pg_temp.ok(exists (select 1 from automation.rule_events where event_key = 'trial_attended:' || :b3), 'present is still attended');
-- Back to the corrected attendance of revision 2 for the flow check below.
delete from public.lesson_log_students where lesson_log_id = 99893;
delete from public.lesson_logs where id = 99893;

-- A flow on the new trigger moves the lead with "Change stage".
insert into public.lead_stages (key, label, color, sort_order, is_system) values ('stage_rules_absent', 'Stage Rules Absent', 'slate', 70, false);
insert into public.automation_flows (id, name, trigger_type, enabled, graph) overriding system value
values (99851, 'Stage rules flow', 'trial_absent', true,
  '{"trigger":{"x":24,"y":140},"nodes":[{"id":"a1","type":"action","x":0,"y":0,"action":"set_stage","value":"stage_rules_absent","mins":0,"after":true}],"edges":[{"from":"trigger","port":"out","to":"a1"}]}');
select automation.run_rules();
select pg_temp.ok(pg_temp.stage(99841) = 'stage_rules_absent' and pg_temp.stage(99842) = 'stage_rules_absent',
  'a flow on "trial absent" with Change stage moves the lead');
select pg_temp.ok(pg_temp.stage(99821) = 'converted', 'a lead the flow does not belong to is not touched');

rollback;
