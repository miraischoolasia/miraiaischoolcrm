-- Checks for 20261030700000_class_quality.sql. Runs on the local test database (its F1 Math class, schedule 1, with
-- Demo Aiden 1, Demo Bella 2, Demo Caleb 3; Admin Test 1, Teacher Lina 2, staff 4 and 5); it rolls back.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/class_quality.sql

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

create function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
$$;

-- Alerts from lessons of the last days count; two of them need a lower bar here.
update public.app_settings
set value = value || jsonb_build_object('since', timezone('utc', now()) - interval '30 days',
                                         'attendance_drop_lessons', 2, 'early_lessons', 1)
where key = 'class_quality';

-- Who is who: Caleb's Learning Consultant is staff 5, Aiden's is staff 4; staff 5 sees only own students' cards.
update public.students set consultant_id = 5 where id = 3;
update public.students set consultant_id = 4 where id = 1;
update public.teachers
set permissions = '{"progress_cards": {"level": "view", "scope": "own"}}'::jsonb,
    effective_permissions = '{"progress_cards": {"level": "view", "scope": "own"}}'::jsonb
where id = 5;

-- Two lessons of F1 Math (schedule 1): the day before yesterday (S1) and yesterday (S2), 7 pm to 8:15 pm.
select (timezone('utc', now()) at time zone 'Asia/Kuala_Lumpur')::date - 2 as d1,
       (timezone('utc', now()) at time zone 'Asia/Kuala_Lumpur')::date - 1 as d2 \gset
insert into public.class_sessions (schedule_id, lesson_date, classroom_id, teacher_id, starts_at, ends_at, status, started_at, ended_at)
values
  (1, :'d1', 1, 2, (:'d1'::date + time '19:00') at time zone 'Asia/Kuala_Lumpur', (:'d1'::date + time '20:15') at time zone 'Asia/Kuala_Lumpur',
   'ended', (:'d1'::date + time '19:00') at time zone 'Asia/Kuala_Lumpur', (:'d1'::date + time '20:15') at time zone 'Asia/Kuala_Lumpur'),
  (1, :'d2', 1, 2, (:'d2'::date + time '19:00') at time zone 'Asia/Kuala_Lumpur', (:'d2'::date + time '20:15') at time zone 'Asia/Kuala_Lumpur',
   'ended', (:'d2'::date + time '19:00') at time zone 'Asia/Kuala_Lumpur', (:'d2'::date + time '20:15') at time zone 'Asia/Kuala_Lumpur');
select id as s1 from public.class_sessions where schedule_id = 1 and lesson_date = :'d1' \gset
select id as s2, starts_at as s2_start, ends_at as s2_end from public.class_sessions where schedule_id = 1 and lesson_date = :'d2' \gset

-- S2 is on Zoom: the teacher comes in 12 minutes late, Aiden is there the whole time, Bella only the first 22 minutes.
insert into public.class_session_zoom (session_id, meeting_id) values (:s2, 'qa-test-meeting');
insert into public.zoom_participation (session_id, student_id, participant_uuid, user_name, joined_at, left_at, is_host)
values
  (:s2, null, 'host-1', 'Teacher Lina', :'s2_start'::timestamptz + interval '12 minutes', :'s2_end', true),
  (:s2, 1, 'p-aiden', 'Aiden', :'s2_start', :'s2_end', false),
  (:s2, 2, 'p-bella', 'Bella', :'s2_start', :'s2_start'::timestamptz + interval '22 minutes', false);
insert into public.class_session_recordings (session_id, zoom_recording_uuid, created_at)
values (:s2, 'qa-rec-1', :'s2_end'::timestamptz + interval '1 hour');

-- Questions: S1 two, S2 three.
insert into public.live_questions (session_id, position, kind, prompt, points, time_limit_seconds, scoring, status, opened_at, closes_at)
select x.sid, x.pos, 'choice', 'Q' || x.pos, 10, 30, 'fixed', 'closed', timezone('utc', now()) - interval '1 hour',
  timezone('utc', now()) - interval '59 minutes'
from (values (:s1, 1), (:s1, 2), (:s2, 1), (:s2, 2), (:s2, 3)) x(sid, pos);

-- S1: 1 of 3 right (33%), Caleb has the most points. S2: 3 of 8 right (37%), Aiden all right.
insert into public.live_answers (live_question_id, session_id, student_id, answered_by, seconds_taken, points_if_correct, result, points, submitted_at)
select q.id, q.session_id, a.student_id, 'student', 5, 10, a.result, case when a.result = 'correct' then 10 else 0 end, timezone('utc', now())
from public.live_questions q
join (values
  (:s1, 1, 1, 'wrong'), (:s1, 2, 2, 'wrong'), (:s1, 1, 3, 'correct'),
  (:s2, 1, 1, 'correct'), (:s2, 2, 1, 'correct'), (:s2, 3, 1, 'correct'),
  (:s2, 1, 2, 'wrong'), (:s2, 2, 2, 'wrong'), (:s2, 3, 2, 'wrong'),
  (:s2, 1, 3, 'wrong'), (:s2, 2, 3, 'wrong')
) a(sid, pos, student_id, result) on a.sid = q.session_id and a.pos = q.position;

-- Attendance: S1 Aiden and Bella here, Caleb absent (67%); S2 only Aiden (33%). Aiden gets full marks in S2.
insert into public.lesson_logs (schedule_id, teacher_id, lesson_date, submitted_at, revision_number)
values (1, 2, :'d1', timezone('utc', now()), 1), (1, 2, :'d2', timezone('utc', now()), 1);
select id as log1 from public.lesson_logs where schedule_id = 1 and lesson_date = :'d1' \gset
select id as log2 from public.lesson_logs where schedule_id = 1 and lesson_date = :'d2' \gset
insert into public.lesson_log_students (lesson_log_id, student_id, attendance_status)
values (:log1, 1, 'present'), (:log1, 2, 'present'), (:log1, 3, 'absent'),
       (:log2, 1, 'present'), (:log2, 2, 'absent'), (:log2, 3, 'absent');
insert into public.lesson_review_scores (lesson_log_id, student_id, criterion_id, score, remark)
select :log2, 1, c.id, c.max_score, case when c.id = (select min(id) from public.review_criteria) then 'Great focus today.' end
from public.review_criteria c where c.is_active;

-- 1. Finding the alerts ----------------------------------------------------------------------------------
select automation.detect_quality_alerts() as made \gset
select pg_temp.ok(:made > 0, 'alerts are found');

create temp table got as select kind, session_id, student_id, reason, news from automation.quality_alerts;
select pg_temp.ok(exists (select 1 from got where kind = 'late_start' and session_id = :s2 and reason ~ '12 minutes late'),
  'the teacher started 12 minutes late');
select pg_temp.ok(exists (select 1 from got where kind = 'low_score' and session_id = :s2 and reason ~ '33%, 38%|38%, 33%'),
  'answers right below 50% two lessons running (33%, 38%)');
select pg_temp.ok(not exists (select 1 from got where kind = 'low_score' and session_id = :s1),
  'one low lesson alone is no alert');
select pg_temp.ok(exists (select 1 from got where kind = 'attendance_drop' and session_id = :s2 and reason ~ '67% → 33%'),
  'attendance fell (67% → 33%)');
select pg_temp.ok(exists (select 1 from got where kind = 'absent_streak' and session_id = :s2 and student_id = 3 and reason ~ 'missed 2 classes'),
  'Caleb missed 2 classes in a row');
select pg_temp.ok(not exists (select 1 from got where kind = 'absent_streak' and student_id = 2),
  'Bella''s first absence after being there is no streak');
select pg_temp.ok(exists (select 1 from got where kind = 'low_participation' and student_id = 2 and reason ~ 'only 29%'),
  'Bella was in class only 29% of the time');
select pg_temp.ok(exists (select 1 from got where kind = 'leaves_early' and student_id = 2),
  'Bella left early (the bar is once here)');
select pg_temp.ok(not exists (select 1 from got where kind = 'low_participation' and student_id = 1),
  'Aiden, in class all the time, is fine');
select pg_temp.ok(exists (select 1 from got where kind = 'all_correct' and student_id = 1 and reason ~ '3 of 3' and news ~ '全部答对（3/3）'),
  'Aiden got every answer right (3 of 3); the news for the parent is in Chinese');
select pg_temp.ok(exists (select 1 from got where kind = 'first_place' and session_id = :s2 and student_id = 1)
  and exists (select 1 from got where kind = 'first_place' and session_id = :s1 and student_id = 3),
  'first place in each lesson (Aiden in S2, Caleb in S1)');
select pg_temp.ok(exists (select 1 from got where kind = 'high_rating' and student_id = 1),
  'Aiden got a top rating');
select pg_temp.ok(automation.detect_quality_alerts() = 0, 'looking again finds nothing new');

-- A switched-off kind is not looked for.
delete from automation.quality_alerts;
delete from automation.quality_checked;
update public.app_settings set value = value || '{"alerts": {"first_place": false}}'::jsonb where key = 'class_quality';
select automation.detect_quality_alerts();
select pg_temp.ok(not exists (select 1 from automation.quality_alerts where kind = 'first_place')
  and exists (select 1 from automation.quality_alerts where kind = 'all_correct'),
  'a kind switched off is not raised, the others are');

-- 2. Through Automations to the bell ------------------------------------------------------------------------
select automation.run_rules();
select pg_temp.ok(
  exists (select 1 from public.staff_notifications n where n.teacher_id = 1 and n.title = 'Class needs attention: F1 Math (test)'
          and n.class_session_id = :s2 and n.body ~ '12 minutes late'),
  'the managers (the admin) are told about the class, with the lesson'
);
select pg_temp.ok(
  exists (select 1 from public.staff_notifications n where n.teacher_id = 5 and n.title = 'Please check on Demo Caleb'
          and n.student_id = 3 and n.body ~ 'missed 2 classes'),
  'Caleb''s Learning Consultant is asked to check on him'
);
select pg_temp.ok(
  exists (select 1 from public.staff_notifications n where n.teacher_id = 4 and n.title ~ '^Good news: Demo Aiden'
          and n.body ~ 'Suggested message to the parent' and n.body ~ '好消息：Demo Aiden在 F1 Math'),
  'Aiden''s Learning Consultant gets the good news with a draft for the parent (in Chinese)'
);
select pg_temp.ok(
  exists (select 1 from public.staff_notifications n
          where n.student_id = 2 and n.title = 'Please check on Demo Bella'
            and n.teacher_id = (select o.teacher_id from public.leads l join public.lead_options o on o.id = l.pic_id
                                where l.id = automation.student_lead(2))),
  'Bella has no Learning Consultant, so her lead''s PIC is asked'
);

-- 3. Reading the scorecard, retention and cards -------------------------------------------------------------
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.ok(
  (select started_on_time = false and recording_on_time and marked = 3 and attended = 1 and correct = 3 and wrong = 5
          and questions = 3 and teacher_id = 2 and commented = 1 and present_logged = 1
   from public.quality_lessons(:'d1'::date - 1, :'d2'::date) where session_id = :s2),
  'the scorecard row of S2 (late start, recording on time, attendance, answers, comments)'
);
select pg_temp.ok(
  (select bool_and(classroom_name not like 'HOA%' and classroom_name not like 'Holiday%')
   from public.quality_periods(:'d1'::date - 60, :'d2'::date)),
  'retention reads only the counted (regular) classes'
);
select pg_temp.ok(public.set_class_quality('{"low_score_percent": 40}'::jsonb) ->> 'low_score_percent' = '40',
  'an admin changes a threshold');
select pg_temp.fails($$select public.set_class_quality('{"low_score_percent": 0}'::jsonb)$$, '1 to 100', 'a threshold out of range is refused');
select pg_temp.fails($$select public.set_class_quality('{"made_up": 1}'::jsonb)$$, 'Unknown setting', 'an unknown setting is refused');
select pg_temp.fails($$select public.set_class_quality('{"parent_language": "fr"}'::jsonb)$$, 'zh or en', 'only zh or en for parents');
reset role;

select pg_temp.login('a0000000-0000-4000-8000-000000000002');
set local role authenticated;
select pg_temp.fails($$select * from public.quality_lessons(current_date - 7, current_date)$$, 'Teacher quality', 'a teacher without the tick cannot read the scorecard');
reset role;

-- Staff 5 (only own students' cards) sees Caleb, not Aiden.
select auth_user_id as staff5 from public.teachers where id = 5 \gset
select pg_temp.login(:'staff5');
set local role authenticated;
select pg_temp.ok(
  (select jsonb_array_length(c -> 'lessons') >= 2 and c -> 'student' ->> 'name' = 'Demo Caleb'
   from (select public.progress_card(3, :'d2'::date) as c) x),
  'Caleb''s card has his lessons'
);
select pg_temp.fails($$select public.progress_card(1, current_date)$$, 'cannot see', 'another LC''s student''s card is refused');
select pg_temp.ok(public.mark_progress_card_sent(3, :'d2'::date) is not null, 'pressing Send is recorded');
select pg_temp.ok(
  (select (public.progress_card(3, :'d2'::date) ->> 'sentAt') is not null),
  'the card shows it was sent this month'
);
select pg_temp.ok(
  (select (public.progress_card(3, (:'d2'::date - interval '1 month')::date) ->> 'sentAt') is null),
  'and not in another month'
);
reset role;

-- The admin sees Aiden's card with the teacher's words.
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.ok(
  (select c -> 'words' -> 0 ->> 'text' = 'Great focus today.' from (select public.progress_card(1, :'d2'::date) as c) x),
  'the card has the teacher''s words of the month'
);
reset role;

-- 4. Ticks and the flow check -------------------------------------------------------------------------------
select pg_temp.ok(public.valid_account_permissions('{"progress_cards": {"level": "view", "scope": "own"}, "quality": {"level": "edit"}}'),
  'the two new ticks are valid');
select pg_temp.ok(not public.valid_account_permissions('{"quality": {"level": "view", "scope": "own"}}'),
  'Teacher quality has no "only own"');
select pg_temp.ok(
  (select count(*) = 3 from public.automation_flows where trigger_type in ('class_alert', 'student_care', 'good_news') and enabled),
  'the three flows are made and on'
);
select pg_temp.fails(
  $$update public.automation_flows set graph = jsonb_set(graph, '{nodes,0,value}', to_jsonb('{"to":"bosses","text":"x"}'::text))
    where trigger_type = 'class_alert'$$,
  'note|who', 'an unknown "who" is refused (managers is known)'
);

rollback;
