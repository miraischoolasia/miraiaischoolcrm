-- Checks for 20261021100000_class_sessions.sql and 20261021110000_review_criteria.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/class_sessions_and_criteria.sql
-- Every check prints PASS; the first failure stops the run.

begin;

create function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
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

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

grant execute on all functions in schema pg_temp to authenticated;

-- Seed ---------------------------------------------------------------------
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),  -- admin
  ('00000000-0000-0000-0000-00000000000b'),  -- teacher Amy (owns the class)
  ('00000000-0000-0000-0000-00000000000c'),  -- teacher Ben (not her class)
  ('00000000-0000-0000-0000-00000000000d'),  -- staff Cara (may edit students)
  ('00000000-0000-0000-0000-0000000000a1'),  -- student Ali (in the class)
  ('00000000-0000-0000-0000-0000000000a2');  -- student Siti (other class)

insert into public.teachers (id, auth_user_id, username, full_name, role) overriding system value values
  (9001, '00000000-0000-0000-0000-00000000000a', 't_admin', 'Admin', 'admin'),
  (9002, '00000000-0000-0000-0000-00000000000b', 't_amy', 'Amy', 'teacher'),
  (9003, '00000000-0000-0000-0000-00000000000c', 't_ben', 'Ben', 'teacher');
insert into public.teachers (id, auth_user_id, username, full_name, role, permissions) overriding system value values
  (9004, '00000000-0000-0000-0000-00000000000d', 't_cara', 'Cara', 'staff', '{"students": {"level": "edit"}}');

insert into public.classrooms (id, name, age_group, program_level, teacher_id) overriding system value values
  (9101, 'Test Class A', '9-11 Years Old', 'Coder Foundation', 9002),
  (9102, 'Test Class B', '9-11 Years Old', 'Coder Foundation', 9003);

-- 2026-10-14 is a Wednesday (dow 3).
insert into public.schedules (id, teacher_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, classroom_id)
  overriding system value values
  (9201, 9002, 'Class A weekly', 'regular', 'weekly', 3, '15:00', '16:00', '2026-09-01', 9101),
  (9202, 9003, 'Class B weekly', 'regular', 'weekly', 3, '17:00', '18:00', '2026-09-01', 9102);

insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, classroom_id, teacher_id)
  overriding system value values
  (9301, 'Ali', 8, '2027-01-01', '2027-01-01', '2027-01-01', 9101, 9002),
  (9302, 'Siti', 8, '2027-01-01', '2027-01-01', '2027-01-01', 9102, 9003);

-- The classroom trigger records membership; make sure Ali is in A from September.
update public.student_classroom_periods set start_date = '2026-09-01' where student_id in (9301, 9302);
insert into public.student_classroom_periods (student_id, classroom_id, start_date)
select v.s, v.c, '2026-09-01' from (values (9301, 9101), (9302, 9102)) v(s, c)
where not exists (select 1 from public.student_classroom_periods p where p.student_id = v.s);

insert into public.schedule_exceptions (schedule_id, exception_date, reason) values (9201, '2026-10-07', 'Holiday');

-- Class days ----------------------------------------------------------------
select pg_temp.ok(public.schedule_meets_on(9201, '2026-10-14'), 'meets on its weekday');
select pg_temp.ok(not public.schedule_meets_on(9201, '2026-10-15'), 'not on another weekday');
select pg_temp.ok(not public.schedule_meets_on(9201, '2026-09-30'), 'not on the 30th');
select pg_temp.ok(not public.schedule_meets_on(9201, '2026-10-07'), 'not on a cancelled day');
select pg_temp.ok(not public.schedule_meets_on(9201, '2026-08-26'), 'not before it starts');

-- Teacher opens her class ---------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;

select pg_temp.ok((public.open_class_session(9201, '2026-10-14')).id is not null, 'teacher opens her own class day');
select pg_temp.ok(
  (select starts_at = timestamptz '2026-10-14 15:00+08' and ends_at = timestamptz '2026-10-14 16:00+08'
     and status = 'scheduled' and teacher_id = 9002 and classroom_id = 9101
   from public.class_sessions where schedule_id = 9201),
  'session copies the planned time in Malaysia time');
select pg_temp.ok(
  (public.open_class_session(9201, '2026-10-14')).id = (select id from public.class_sessions where schedule_id = 9201),
  'opening again returns the same session');
select pg_temp.ok((public.open_class_session(9201, '2026-10-21')).id is not null, 'teacher may open a future day');
select pg_temp.fails($$select public.open_class_session(9201, '2026-10-15')$$, 'does not run', 'cannot open a day the class does not meet');
select pg_temp.fails($$select public.open_class_session(9202, '2026-10-14')$$, 'only this class', 'cannot open another teacher''s class');
select pg_temp.fails($$insert into public.class_sessions (schedule_id, lesson_date, teacher_id, starts_at, ends_at) values (9201, '2026-10-28', 9002, now(), now() + interval '1 hour')$$,
  'permission denied', 'no direct insert');
select pg_temp.fails($$update public.class_sessions set status = 'live'$$, 'permission denied', 'no direct update');
select pg_temp.fails($$insert into public.class_session_zoom (session_id, meeting_id) select id, '123' from public.class_sessions limit 1$$,
  'permission denied', 'teacher cannot write the Zoom row');

reset role;
insert into public.class_session_zoom (session_id, meeting_id, join_url)
select id, '987654321', 'https://zoom.us/j/987654321' from public.class_sessions where schedule_id = 9201 and lesson_date = '2026-10-14';

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select pg_temp.ok((select count(*) from public.class_session_zoom) = 1, 'teacher reads her session''s Zoom row');

-- Another teacher ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select count(*) from public.class_sessions) = 0, 'other teacher sees none of her sessions');
select pg_temp.ok((select count(*) from public.class_session_zoom) = 0, 'other teacher sees no Zoom row');

-- Admin ----------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) from public.class_sessions) = 2, 'admin sees every session');
select pg_temp.ok((public.open_class_session(9202, '2026-10-14')).teacher_id = 9003, 'admin opens any class; teacher stays the class teacher');

-- Student logins ---------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
update public.students set auth_user_id = '00000000-0000-0000-0000-0000000000a1' where id = 9301;
select pg_temp.ok((select auth_user_id from public.students where id = 9301) is null, 'a teacher cannot link a student login');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails($$update public.students set auth_user_id = '00000000-0000-0000-0000-0000000000a1' where id = 9301$$,
  'only an admin', 'staff who may edit students still cannot link a login');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.fails($$update public.students set auth_user_id = '00000000-0000-0000-0000-00000000000c' where id = 9301$$,
  'staff account', 'a staff login cannot become a student');
update public.students set auth_user_id = '00000000-0000-0000-0000-0000000000a1' where id = 9301;
update public.students set auth_user_id = '00000000-0000-0000-0000-0000000000a2' where id = 9302;
select pg_temp.ok(true, 'admin links student logins');

reset role;
select pg_temp.fails($$update public.teachers set auth_user_id = '00000000-0000-0000-0000-0000000000a1' where id = 9003$$,
  'belongs to a student', 'a student login cannot become staff');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select pg_temp.ok(public.current_student_id() = 9301, 'student login resolves to the student');
select pg_temp.ok(public.current_teacher_id() is null and not public.has_permission('students') and not public.can_view_classes(),
  'student has no staff rights');
select pg_temp.ok(
  (select count(*) from public.class_sessions) = 2
  and (select bool_and(classroom_id = 9101) from public.class_sessions),
  'student sees only his own class''s sessions');
select pg_temp.ok((select count(*) from public.class_session_zoom) = 0, 'student never reads the class Zoom link');
select pg_temp.ok((select count(*) from public.students) = 0, 'student reads no student records');
select pg_temp.ok((select count(*) from public.teachers) = 0, 'student reads no staff records');
select pg_temp.ok((select count(*) from public.leads) = 0 and (select count(*) from public.people) = 0, 'student reads no leads or people');
select pg_temp.ok((select count(*) from public.lesson_logs) = 0 and (select count(*) from public.schedules) = 0, 'student reads no lesson logs or schedules');
select pg_temp.ok((select count(*) from public.review_criteria) = 0, 'student reads no review criteria (yet)');
select pg_temp.fails($$select public.open_class_session(9201, '2026-10-14')$$, 'only this class', 'student cannot open a class');

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select pg_temp.ok((select count(*) from public.class_sessions) = 1
  and (select classroom_id from public.class_sessions) = 9102, 'other student sees only her class');

-- Attendance links the session and copies review scores ------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select * from public.submit_lesson_attendance(
  9201, '2026-10-14', null,
  '[{"student_id": 9301, "status": "present"}]'::jsonb,
  '[{"student_id": 9301, "logicalThinkingScore": 4, "codingCreativityScore": 5, "problemSolvingScore": 3,
     "expressivenessScore": 2, "expressivenessRemark": "Shy today", "sustainedFocusScore": 4}]'::jsonb
);
select pg_temp.ok(
  (select lesson_log_id from public.class_sessions where schedule_id = 9201 and lesson_date = '2026-10-14')
    = (select max(id) from public.lesson_logs where schedule_id = 9201),
  'submitted attendance links the lesson log to the session');
select pg_temp.ok((select count(*) from public.lesson_review_scores) = 5, 'five review scores copied');
select pg_temp.ok(
  (select s.score = 2 and s.remark = 'Shy today'
   from public.lesson_review_scores s join public.review_criteria c on c.id = s.criterion_id
   where c.legacy_key = 'expressiveness'),
  'score and remark copied to the right criterion');

select * from public.submit_lesson_attendance(
  9201, '2026-10-14', null,
  '[{"student_id": 9301, "status": "present"}]'::jsonb,
  '[{"student_id": 9301, "logicalThinkingScore": 5, "codingCreativityScore": 5, "problemSolvingScore": 5,
     "expressivenessScore": 5, "sustainedFocusScore": 5}]'::jsonb
);
select pg_temp.ok(
  (select lesson_log_id from public.class_sessions where schedule_id = 9201 and lesson_date = '2026-10-14')
    = (select id from public.lesson_logs where schedule_id = 9201 order by revision_number desc limit 1)
  and (select revision_number from public.lesson_logs where id =
        (select lesson_log_id from public.class_sessions where schedule_id = 9201 and lesson_date = '2026-10-14')) = 2,
  'a correction moves the link to the newest revision');
select pg_temp.ok((select count(*) from public.lesson_review_scores) = 10, 'the correction''s scores are copied too');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select count(*) from public.lesson_review_scores) = 0, 'other teacher reads none of those scores');

-- Review criteria ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((select count(*) from public.review_criteria) = 5, 'teacher reads the criteria');
select pg_temp.fails($$select public.save_review_criterion(null, 'Teamwork', null, 3::smallint, 1::smallint, null, true)$$,
  'only admin', 'teacher cannot add a criterion');
select pg_temp.fails($$update public.review_criteria set name = 'x'$$, 'permission denied', 'no direct criterion edit');
select pg_temp.fails($$insert into public.lesson_review_scores (lesson_log_id, student_id, criterion_id, score) select max(id), 9301, 1, 3 from public.lesson_logs$$,
  'permission denied', 'no direct score insert');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((public.save_review_criterion(null, 'Teamwork', 'Works with others', 3::smallint, 1::smallint, null, true)).max_score = 3,
  'admin adds a criterion with its own scale');
select pg_temp.ok((select sort_order from public.review_criteria where name = 'Teamwork') = 60, 'new criterion goes last');
select pg_temp.ok(
  (public.save_review_criterion((select id from public.review_criteria where legacy_key = 'expressiveness'),
    'Confidence', null, null, null, null, true)).legacy_key = 'expressiveness',
  'admin renames a criterion; old scores stay attached');
select pg_temp.fails(
  format('select public.save_review_criterion(%s, %L, null, 10::smallint, null, null, true)',
    (select id from public.review_criteria where legacy_key = 'logical_thinking'), 'Logic'),
  'top score cannot change', 'top score of a used criterion is locked');
select pg_temp.fails($$select public.save_review_criterion(null, 'Bad', null, 3::smallint, 3::smallint, null, true)$$,
  'check constraint', 'remark threshold must be below the top score');
select pg_temp.fails($$select public.save_review_criterion(null, 'teamwork', null, 5::smallint, 2::smallint, null, true)$$,
  'duplicate key', 'two active criteria cannot share a name');
select pg_temp.ok((public.save_review_criterion((select id from public.review_criteria where name = 'Teamwork'),
  'Teamwork', null, null, null, null, false)).is_active = false, 'admin switches a criterion off');

reset role;
select pg_temp.fails(
  $$insert into public.lesson_review_scores (lesson_log_id, student_id, criterion_id, score)
    select max(l.id), 9301, (select id from public.review_criteria where name = 'Teamwork'), 4 from public.lesson_logs l$$,
  'above the top score', 'a score above the top score is refused');

-- Zoom options ----------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select pg_temp.fails($$select public.set_zoom_meeting_options('{"mute_upon_entry": false, "waiting_room": false, "join_before_host": false, "auto_recording": "cloud"}')$$,
  'only admin', 'teacher cannot change Zoom settings');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.set_zoom_meeting_options('{"mute_upon_entry": false, "waiting_room": true, "join_before_host": false, "auto_recording": "none"}');
select pg_temp.ok((select value ->> 'auto_recording' from public.app_settings where key = 'zoom_meeting_options') = 'none',
  'admin changes Zoom settings');
select pg_temp.fails($$select public.set_zoom_meeting_options('{"mute_upon_entry": true, "waiting_room": true, "join_before_host": false, "auto_recording": "cloud", "client_secret": "x"}')$$,
  'not valid', 'unknown keys (like secrets) are refused');
select pg_temp.fails($$select public.set_zoom_meeting_options('{"mute_upon_entry": "yes", "waiting_room": true, "join_before_host": false, "auto_recording": "cloud"}')$$,
  'not valid', 'wrong value types are refused');

-- Attendance with the school's own criteria (20261021130000) ----------------
select pg_temp.ok((select name from public.review_criteria where legacy_key = 'logical_thinking') = 'Logical & Algorithmic Thinking',
  'first criterion keeps the name the form always showed');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.save_review_criterion((select id from public.review_criteria where name = 'Teamwork'), 'Teamwork', null, null, null, null, true);

create function pg_temp.review_json(p_teamwork text) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'student_id', 9301,
    'lessonRemark', 'Built the menu screen',
    'scores', (
      select jsonb_agg(jsonb_build_object('criterion_id', id, 'score', 4, 'remark', null))
      from public.review_criteria where legacy_key is not null
    ) || coalesce(p_teamwork::jsonb, '[]'::jsonb)
  ));
$$;
grant execute on function pg_temp.review_json(text) to authenticated;

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;

select pg_temp.fails($$select * from public.submit_lesson_attendance(9201, '2026-09-23', null,
  '[{"student_id": 9301, "status": "present"}]', pg_temp.review_json(null))$$,
  'please rate teamwork', 'a switched-on criterion must be rated');
select pg_temp.fails(format($$select * from public.submit_lesson_attendance(9201, '2026-09-23', null,
  '[{"student_id": 9301, "status": "present"}]', pg_temp.review_json(%L))$$,
  format('[{"criterion_id": %s, "score": 4}]', (select id from public.review_criteria where name = 'Teamwork'))),
  'between 1 and 3', 'a score above the criterion''s top score is refused');
select pg_temp.fails(format($$select * from public.submit_lesson_attendance(9201, '2026-09-23', null,
  '[{"student_id": 9301, "status": "present"}]', pg_temp.review_json(%L))$$,
  format('[{"criterion_id": %s, "score": 1, "remark": "  "}]', (select id from public.review_criteria where name = 'Teamwork'))),
  'remark is required', 'a low score needs a remark at the criterion''s own threshold');
select pg_temp.fails(format($$select * from public.submit_lesson_attendance(9201, '2026-09-23', null,
  '[{"student_id": 9301, "status": "present"}]', pg_temp.review_json(%L))$$,
  format('[{"criterion_id": %s, "score": 2}, {"criterion_id": %s, "score": 3}]',
    (select id from public.review_criteria where name = 'Teamwork'), (select id from public.review_criteria where name = 'Teamwork'))),
  'scored twice', 'one criterion cannot be scored twice');

select * from public.submit_lesson_attendance(9201, '2026-09-23', null,
  '[{"student_id": 9301, "status": "present"}]',
  pg_temp.review_json(format('[{"criterion_id": %s, "score": 2}]', (select id from public.review_criteria where name = 'Teamwork'))));
select pg_temp.ok(
  (select count(*) from public.lesson_review_scores s join public.lesson_logs l on l.id = s.lesson_log_id
   where l.schedule_id = 9201 and l.lesson_date = '2026-09-23') = 6,
  'new-style review saves all six criteria');
select pg_temp.ok(
  (select r.logical_thinking_score = 4 and r.lesson_remark = 'Built the menu screen'
   from public.lesson_log_student_reviews r join public.lesson_logs l on l.id = r.lesson_log_id
   where l.schedule_id = 9201 and l.lesson_date = '2026-09-23'),
  'old columns and the lesson remark are still filled');
select pg_temp.ok(
  (select remaining_hours from public.students where id = 9301) = 6,
  'lessons are still deducted (two present lessons)');

select pg_temp.fails($$select * from public.submit_lesson_attendance(9201, '2026-09-16', null,
  '[{"student_id": 9301, "status": "present"}]',
  '[{"student_id": 9301, "logicalThinkingScore": 3, "codingCreativityScore": 3, "problemSolvingScore": 3, "expressivenessScore": 3, "sustainedFocusScore": 3}]')$$,
  'please rate teamwork', 'an old page cannot skip a new switched-on criterion');

reset role;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
set local role authenticated;
select public.save_review_criterion((select id from public.review_criteria where name = 'Teamwork'), 'Teamwork', null, null, null, null, false);
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select * from public.submit_lesson_attendance(9201, '2026-09-16', null,
  '[{"student_id": 9301, "status": "present"}]',
  '[{"student_id": 9301, "logicalThinkingScore": 3, "codingCreativityScore": 3, "problemSolvingScore": 1, "problemSolvingRemark": "Gave up early", "expressivenessScore": 3, "sustainedFocusScore": 3}]');
select pg_temp.ok(
  (select count(*) from public.lesson_review_scores s join public.lesson_logs l on l.id = s.lesson_log_id
   where l.schedule_id = 9201 and l.lesson_date = '2026-09-16') = 5
  and (select s.remark from public.lesson_review_scores s join public.lesson_logs l on l.id = s.lesson_log_id
       join public.review_criteria c on c.id = s.criterion_id
       where l.schedule_id = 9201 and l.lesson_date = '2026-09-16' and c.legacy_key = 'problem_solving') = 'Gave up early',
  'an old page still works once the new criterion is off');
select pg_temp.fails($$select * from public.submit_lesson_attendance(9201, '2026-09-09', null,
  '[{"student_id": 9301, "status": "present"}]',
  '[{"student_id": 9301, "logicalThinkingScore": 3, "codingCreativityScore": 3, "problemSolvingScore": 1, "expressivenessScore": 3, "sustainedFocusScore": 3}]')$$,
  'remark is required', 'old page: a 1-star score still needs its remark');

-- Attendance statuses each school sets (20261021140000) ----------------------
-- Ali has 5 lessons left here (three present lessons so far).
reset role;
select pg_temp.ok((select remaining_hours from public.students where id = 9301) = 5, 'start: 5 lessons left');
select pg_temp.ok((select string_agg(key, ',' order by sort_order) from public.attendance_statuses) = 'present,absent,leave',
  'the three usual statuses are there');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select pg_temp.ok((select count(*) from public.attendance_statuses) = 3, 'teacher reads the statuses');
select pg_temp.fails($$select public.save_attendance_status(null, 'Late', true, true, 'sky', null, true)$$,
  'only admin', 'teacher cannot add a status');
select pg_temp.fails($$update public.attendance_statuses set label = 'x'$$, 'permission denied', 'no direct status edit');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((public.save_attendance_status(null, 'Late', true, true, 'sky', null, true)).key = 'late', 'admin adds Late');
select pg_temp.ok((public.save_attendance_status(null, 'No-show!', false, true, 'rose', null, true)).key = 'no_show', 'admin adds No-show (key from the label)');
select pg_temp.fails($$select public.save_attendance_status(null, 'late', true, true, 'sky', null, true)$$,
  'duplicate key', 'two shown statuses cannot share a label');
select pg_temp.fails($$select public.save_attendance_status('present', 'Present', true, true, 'emerald', null, false)$$,
  'always stays on', 'Present cannot be hidden');
select pg_temp.fails($$select public.save_attendance_status('present', 'Present', true, false, 'emerald', null, true)$$,
  'always stays on', 'Present always takes a lesson');

create function pg_temp.full_review(p_student bigint) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('student_id', p_student, 'scores', (
    select jsonb_agg(jsonb_build_object('criterion_id', id, 'score', 4)) from public.review_criteria where is_active)));
$$;
grant execute on function pg_temp.full_review(bigint) to authenticated;

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$select * from public.submit_lesson_attendance(9201, '2026-09-02', null, '[{"student_id": 9301, "status": "late"}]', '[]')$$,
  'missing student review', 'Late counts as attended, so it needs a review');
select * from public.submit_lesson_attendance(9201, '2026-09-02', null, '[{"student_id": 9301, "status": "late"}]', pg_temp.full_review(9301));
select pg_temp.ok((select remaining_hours from public.students where id = 9301) = 4, 'Late takes one lesson');

select * from public.submit_lesson_attendance(9201, '2026-09-02', null, '[{"student_id": 9301, "status": "absent"}]', '[]');
select pg_temp.ok((select remaining_hours from public.students where id = 9301) = 5, 'correcting Late to Absent gives the lesson back');

select * from public.submit_lesson_attendance(9201, '2026-09-09', null, '[{"student_id": 9301, "status": "no_show"}]', '[]');
select pg_temp.ok((select remaining_hours from public.students where id = 9301) = 4
  and not exists (select 1 from public.lesson_log_student_reviews r join public.lesson_logs l on l.id = r.lesson_log_id
                  where l.schedule_id = 9201 and l.lesson_date = '2026-09-09'),
  'No-show takes a lesson without a review');
select pg_temp.fails($$select * from public.submit_lesson_attendance(9201, '2026-09-23', null, '[{"student_id": 9301, "status": "sick"}]', '[]')$$,
  'invalid attendance status', 'an unknown status is refused');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.fails($$select public.save_attendance_status('late', 'Late', true, false, 'sky', null, true)$$,
  'already use this status', 'a used status keeps whether it takes a lesson');
select pg_temp.ok((public.save_attendance_status('late', 'Came late', null, null, null, null, null)).label = 'Came late',
  'a used status can be renamed');
select public.save_attendance_status('no_show', 'No-show', null, null, null, null, false);

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.fails($$select * from public.submit_lesson_attendance(9202, '2026-10-14', null, '[{"student_id": 9302, "status": "no_show"}]', '[]')$$,
  'invalid attendance status', 'a hidden status is refused on a new lesson');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select * from public.submit_lesson_attendance(9201, '2026-09-09', 'note', '[{"student_id": 9301, "status": "no_show"}]', '[]');
select pg_temp.ok((select remaining_hours from public.students where id = 9301) = 4,
  'a correction may keep a hidden status the student already had, without a second deduction');

-- Reward points (20261021150000) -----------------------------------------------
-- Ali so far: Present on 10-14, 09-23 and 09-16 (+10 each); Late/Absent/No-show give 0.
reset role;
create function pg_temp.balance(p_student bigint) returns integer language sql security definer as $$
  select coalesce(sum(points), 0)::int from public.student_points where student_id = p_student;
$$;
grant execute on function pg_temp.balance(bigint) to authenticated;
create function pg_temp.last_award() returns bigint language sql security definer as $$
  select max(id) from public.student_points where kind = 'award';
$$;
grant execute on function pg_temp.last_award() to authenticated;

select pg_temp.ok(pg_temp.balance(9301) = 30, 'attendance gave Present points once per lesson (corrections did not double them)');
select pg_temp.ok(pg_temp.balance(9302) = 0, 'no attendance, no points');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
set local role authenticated;
select public.set_attendance_status_points('late', 5);
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select * from public.submit_lesson_attendance(9201, '2026-09-02', null, '[{"student_id": 9301, "status": "late"}]', pg_temp.full_review(9301));
select pg_temp.ok(pg_temp.balance(9301) = 35, 'a status with points gives them');
select * from public.submit_lesson_attendance(9201, '2026-09-02', null, '[{"student_id": 9301, "status": "absent"}]', '[]');
select pg_temp.ok(pg_temp.balance(9301) = 30, 'a correction takes back the difference');

select pg_temp.ok(public.award_points(array[9301], null, null, (select id from public.reward_presets where label = 'Great answer'), 9201, '2026-10-14') = 1,
  'teacher gives a preset reward in her lesson');
select pg_temp.ok(pg_temp.balance(9301) = 35, 'the preset gives its points');
select pg_temp.fails($$select public.award_points(array[9302], 5, 'Nice', null, 9201, '2026-10-14')$$, 'not in this lesson', 'only students of that lesson');
select pg_temp.fails($$select public.award_points(array[9301], 5, 'Nice')$$, 'students edit', 'a teacher cannot give points outside a lesson');
select pg_temp.fails($$select public.award_points(array[9301], -5, 'Bad', null, 9201, '2026-10-14')$$, 'from 1 to 100', 'a teacher cannot take points away');
select pg_temp.fails($$select public.award_points(array[9301], 500, 'Lots', null, 9201, '2026-10-14')$$, 'from 1 to 100', 'at most 100 at a time');
select pg_temp.fails($$select public.award_points(array[9301], 5, '  ', null, 9201, '2026-10-14')$$, 'say what', 'a reason is needed');
select pg_temp.fails($$insert into public.student_points (student_id, points, kind, reason) values (9301, 5, 'award', 'x')$$,
  'permission denied', 'no direct points insert');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.fails($$select public.award_points(array[9301], 5, 'Nice', null, 9201, '2026-10-14')$$, 'only this class', 'another teacher cannot give points in her class');
select pg_temp.ok((select count(*) from public.student_points where student_id = 9301) = 0, 'another teacher does not see her students'' points');
select pg_temp.fails(format('select public.undo_points(%s)', pg_temp.last_award()), 'only who gave', 'another teacher cannot undo');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select public.undo_points((select id from public.student_points where kind = 'award' and student_id = 9301));
select pg_temp.ok(pg_temp.balance(9301) = 30, 'the giver undoes her award');
select pg_temp.fails(format('select public.undo_points(%s)', (select id from public.student_points where kind = 'award' and student_id = 9301)),
  'already undone', 'an award is undone only once');
select pg_temp.fails(format('select public.undo_points(%s)', (select min(id) from public.student_points where kind = 'attendance' and student_id = 9301)),
  'change with the attendance', 'attendance points are not undone by hand');
select pg_temp.fails($$select public.redeem_points(9301, 5, 'Sticker')$$, 'who may edit students', 'a teacher cannot redeem');

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails($$select public.redeem_points(9301, 40, 'Big prize')$$, 'not enough points', 'cannot spend more than the balance');
select public.redeem_points(9301, 20, 'Sticker pack');
select pg_temp.ok(pg_temp.balance(9301) = 10, 'staff with Students edit redeems points');
select pg_temp.ok(public.award_points(array[9301, 9302], 3, 'Holiday bonus') = 2, 'Students edit can give points outside a lesson');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok((select count(*) from public.student_points) = 0, 'a student login reads no points yet');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$select public.save_reward_preset(null, 'Kindness', 2, null, null, true)$$, 'only admin', 'teacher cannot add a reward');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((public.save_reward_preset(null, 'Kindness', 2, '💛', null, true)).sort_order = 50, 'admin adds a reward');
select pg_temp.fails($$select public.set_reward_levels('[{"name": "Gold", "min_points": 50}]')$$, 'start at 0', 'levels must start at 0');
select public.set_reward_levels('[{"name": "Seed", "min_points": 0}, {"name": "Tree", "min_points": 50}]');
select pg_temp.ok((select string_agg(name, ',' order by min_points) from public.reward_levels) = 'Seed,Tree', 'admin replaces the levels');
select pg_temp.ok(public.award_points(array[9301], -4, 'Correction') = 1 and pg_temp.balance(9301) = 9, 'admin may correct downwards');

-- Question bank (20261021160000) --------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((public.save_question(null, '{"kind": "choice", "prompt": "2 + 2?", "options": [{"text": "3", "correct": false}, {"text": "4", "correct": true}], "points": 5}')).owner_id = 9002,
  'teacher adds a choice question');
select pg_temp.ok((public.save_question(null, '{"kind": "fill", "prompt": "Capital of Malaysia?", "accepted_answers": [{"text": "Kuala Lumpur", "match": "close"}, {"text": "KL", "match": "exact"}], "topic": "Geography", "is_shared": true}')).is_shared,
  'teacher adds and shares a fill-in question');
select pg_temp.ok((public.save_question(null, '{"kind": "screenshot", "prompt": "Show your game", "options": [{"text": "ignored", "correct": true}]}')).options = '[]'::jsonb,
  'a screenshot question keeps no options');
select pg_temp.fails($$select public.save_question(null, '{"kind": "choice", "prompt": "Pick", "options": [{"text": "A", "correct": false}, {"text": "B", "correct": false}]}')$$,
  'at least one option as correct', 'a choice question needs a correct option');
select pg_temp.fails($$select public.save_question(null, '{"kind": "choice", "prompt": "Pick", "options": [{"text": "A", "correct": true}]}')$$,
  '2 to 8 options', 'a choice question needs two options');
select pg_temp.fails($$select public.save_question(null, '{"kind": "fill", "prompt": "Word?", "accepted_answers": []}')$$,
  'at least one accepted answer', 'a fill-in question needs an answer');
select pg_temp.fails($$select public.save_question(null, '{"kind": "fill", "prompt": "Word?", "accepted_answers": [{"text": "a", "match": "regex"}]}')$$,
  'how it matches', 'unknown match rules are refused');
select pg_temp.fails($$select public.save_question(null, '{"kind": "essay", "prompt": "x"}')$$, 'check constraint', 'unknown kinds are refused');
select pg_temp.fails($$insert into public.questions (owner_id, kind, prompt) values (9002, 'short', 'x')$$, 'permission denied', 'no direct question insert');

select pg_temp.fails($$select public.import_questions('[{"kind": "short", "prompt": "Why?"}, {"kind": "fill", "prompt": "Bad", "accepted_answers": []}]')$$,
  'row 2', 'an import names the bad row');
select pg_temp.ok((select count(*) from public.questions where prompt = 'Why?') = 0, 'a failed import saves nothing');
select pg_temp.ok(public.import_questions('[{"kind": "short", "prompt": "Why?"}, {"kind": "link", "prompt": "Send your site"}]') = 2, 'an import saves every row');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select string_agg(prompt, ',') from public.questions) = 'Capital of Malaysia?', 'another teacher sees only shared questions');
select pg_temp.fails(format('select public.save_question(%s, %L)', (select id from public.questions where prompt = 'Capital of Malaysia?'), '{"kind": "short", "prompt": "Mine now"}'),
  'only the teacher who wrote', 'another teacher cannot change a shared question');
select pg_temp.ok((public.copy_question((select id from public.questions where prompt = 'Capital of Malaysia?'))).owner_id = 9003,
  'another teacher copies a shared question to change it');
select pg_temp.fails($$select public.copy_question((select min(id) from public.questions where prompt = '2 + 2?'))$$, 'not found', 'a private question cannot be copied by others');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) from public.questions) = 6, 'admin sees every question');
select public.set_question_archived((select id from public.questions where prompt = '2 + 2?'), true);
select pg_temp.ok((select is_archived from public.questions where prompt = '2 + 2?'), 'admin archives a question');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok((select count(*) from public.questions) = 0, 'a student login never reads questions (they hold the answers)');

-- AI analysis (20261021170000) -----------------------------------------------
reset role;
insert into public.student_ai_reports (student_id, audience, report, language)
values (9301, 'teacher', '{"summary": "Doing well."}', 'English'), (9302, 'parent', '{"summary": "Hello."}', 'English');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select pg_temp.ok((select count(*) from public.student_ai_reports) = 1
  and (select student_id from public.student_ai_reports) = 9301, 'a teacher reads the analyses of her own students only');
select pg_temp.fails($$insert into public.student_ai_reports (student_id, audience, report, language) values (9301, 'teacher', '{}', 'x')$$,
  'permission denied', 'only the server writes analyses');
select pg_temp.fails($$select public.set_ai_report_settings('{"sources": {"reviews": true}, "language": "English", "instructions": ""}')$$,
  'only admin', 'a teacher cannot change the AI settings');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.set_ai_report_settings('{"sources": {"reviews": true, "remarks": false, "attendance": true, "points": false}, "language": "中文", "instructions": "Short."}');
select pg_temp.ok((select value ->> 'language' from public.app_settings where key = 'ai_student_report') = '中文', 'admin sets the AI language and sources');
select pg_temp.fails($$select public.set_ai_report_settings('{"sources": {"reviews": false, "remarks": false, "attendance": false, "points": false}, "language": "English", "instructions": ""}')$$,
  'not valid', 'at least one source stays on');
select pg_temp.fails($$select public.set_ai_report_settings('{"sources": {"reviews": true}, "language": "English", "instructions": "", "api_key": "x"}')$$,
  'not valid', 'unknown settings are refused');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok((select count(*) from public.student_ai_reports) = 0, 'a student login reads no analyses yet');

-- Subjects and age groups (20261021180000) ----------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select pg_temp.fails($$select public.save_subject(null, 'Coding', null, true)$$, 'only admin', 'a teacher cannot add a subject');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((public.save_subject(null, 'Coding', null, true)).name = 'Coding', 'admin adds a subject');
select public.save_subject(null, 'Maths', null, true);
select pg_temp.fails($$select public.save_subject(null, ' coding ', null, true)$$, 'duplicate key', 'two shown subjects cannot share a name');

reset role;
update public.classrooms set subject_id = (select id from public.subjects where name = 'Coding') where id = 9101;
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;

create function pg_temp.q(p_prompt text, p_subject text, p_ages text) returns bigint language sql as $$
  select (public.save_question(null, jsonb_build_object(
    'kind', 'short', 'prompt', p_prompt,
    'subject_id', (select id from public.subjects where name = p_subject),
    'age_groups', p_ages::jsonb))).id;
$$;
grant execute on function pg_temp.q(text, text, text) to authenticated;

select pg_temp.q('Loop for 9-11', 'Coding', '["9-11 Years Old", "9-11 Years Old"]');
select pg_temp.ok((select subject_id is not null and age_groups = '{9-11 Years Old}'
  from public.questions where prompt = 'Loop for 9-11'),
  'a question keeps its subject and age groups (no repeats)');
select pg_temp.fails($$select pg_temp.q('Bad age', 'Coding', '["7 Years Old"]')$$, 'unknown age group', 'unknown age groups are refused');
select pg_temp.fails($$select public.save_question(null, '{"kind": "short", "prompt": "x", "subject_id": 999999}')$$, 'subject not found', 'unknown subjects are refused');

select pg_temp.q('Teen loop', 'Coding', '["15-17 Years Old"]');
select pg_temp.q('Fractions', 'Maths', '[]');
select pg_temp.q('Any class', null, '[]');
select pg_temp.ok(public.question_fits_classroom((select id from public.questions where prompt = 'Loop for 9-11'), 9101),
  'a Coding 9-11 question fits the Coding 9-11 class');
select pg_temp.ok(not public.question_fits_classroom((select id from public.questions where prompt = 'Teen loop'), 9101),
  'a 15-17 question does not fit a 9-11 class');
select pg_temp.ok(not public.question_fits_classroom((select id from public.questions where prompt = 'Fractions'), 9101),
  'a Maths question does not fit a Coding class');
select pg_temp.ok(public.question_fits_classroom((select id from public.questions where prompt = 'Any class'), 9101),
  'a question with no subject or age fits every class');
select pg_temp.ok((public.copy_question((select id from public.questions where prompt = 'Loop for 9-11'))).age_groups = '{9-11 Years Old}',
  'a copy keeps subject and age groups');

-- Age groups the school keeps itself
select pg_temp.ok((select string_agg(name, ',' order by sort_order) from public.age_groups) = '6-8 Years Old,9-11 Years Old,12-14 Years Old,15-17 Years Old',
  'the four usual age groups are there');
select pg_temp.fails($$select public.save_age_group(null, 'Primary 1-3', null, true)$$, 'only admin', 'a teacher cannot add an age group');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((public.save_age_group(null, 'Primary 1-3', null, true)).sort_order = 50, 'admin adds an age group');
reset role;
select pg_temp.ok((select count(*) from public.questions where prompt = 'Loop for 9-11' and age_groups = '{9-11 Years Old}') >= 1, 'before the rename');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
set local role authenticated;
select public.save_age_group('9-11 Years Old', 'Kids 9-11', null, null);
reset role;
select pg_temp.ok((select age_group from public.classrooms where id = 9101) = 'Kids 9-11', 'a renamed age group follows on the class');
select pg_temp.ok(not exists (select 1 from public.questions where '9-11 Years Old' = any (age_groups))
  and exists (select 1 from public.questions where 'Kids 9-11' = any (age_groups)), 'and on the questions');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
set local role authenticated;
select pg_temp.fails($$select public.save_age_group('Kids 9-11', '6-8 Years Old', null, null)$$, 'already an age group', 'two age groups cannot share a name');
select pg_temp.ok(not (public.save_age_group('Primary 1-3', null, null, false)).is_active, 'admin hides an age group');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$select pg_temp.q('Gone age', null, '["9-11 Years Old"]')$$, 'unknown age group', 'the old name is no longer an age group');
reset role;
select pg_temp.fails($$update public.classrooms set age_group = 'Nursery' where id = 9101$$, 'foreign key', 'a class must use an age group from the list');

-- Class levels the school keeps itself (20261021190000) ----------------------
select pg_temp.ok((select count(*) from public.program_levels) = 6, 'the six usual levels are there');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select pg_temp.fails($$select public.save_program_level(null, 'Form 4', null, true)$$, 'only admin', 'a teacher cannot add a level');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((public.save_program_level(null, 'Form 4', null, true)).sort_order = 70, 'admin adds a level');
select public.save_program_level('Coder Foundation', 'Foundation', null, null);
reset role;
select pg_temp.ok((select count(*) from public.classrooms where program_level = 'Foundation') = 2, 'a renamed level follows on every class');
select pg_temp.fails($$update public.classrooms set program_level = 'Nope' where id = 9101$$, 'foreign key', 'a class must use a level from the list');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
set local role authenticated;
select pg_temp.fails($$select public.save_program_level('Foundation', 'Coder Pro', null, null)$$, 'already a class level', 'two levels cannot share a name');

-- Student app (20261021200000) ---------------------------------------------
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000b1');  -- parent Mdm Lim
insert into public.people (id, kind, full_name) overriding system value values (9501, 'parent', 'Mdm Lim');
-- Ali's own person row (made by the students trigger, or here) points at his parent.
insert into public.people (kind, full_name, student_id)
select 'student', 'Ali', 9301 where not exists (select 1 from public.people where student_id = 9301);
update public.people set parent_id = 9501 where student_id = 9301;
update public.people set auth_user_id = '00000000-0000-0000-0000-0000000000b1' where id = 9501;
insert into public.portal_accounts (auth_user_id, username, kind, student_id, parent_person_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'ali.tan', 'student', 9301, null),
  ('00000000-0000-0000-0000-0000000000b1', 'mdm.lim', 'parent', null, 9501);

select pg_temp.fails($$insert into public.portal_accounts (auth_user_id, username, kind, student_id) values ('00000000-0000-0000-0000-0000000000a2', 'Bad Name', 'student', 9302)$$,
  'check constraint', 'login names are lower-case letters, numbers, dots');
select pg_temp.fails($$update public.people set auth_user_id = '00000000-0000-0000-0000-0000000000a2' where id = 9501$$,
  'belongs to staff or a student', 'a parent login cannot be a student login');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select pg_temp.ok((select count(*) from public.portal_accounts) >= 1, 'class staff see login names');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails($$update public.people set auth_user_id = null where id = 9501$$, 'only an admin', 'staff who may edit students still cannot change a parent login');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$select public.set_portal_settings('{"school_name": "X", "accent_color": "#000000", "student_sees": {}, "parent_sees": {}}')$$,
  'only admin', 'a teacher cannot change the app settings');

-- The child
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok((select string_agg(full_name, ',') from public.portal_children()) = 'Ali', 'a child sees only themselves');
select pg_temp.ok((public.portal_home(9301) ->> 'viewer') = 'student', 'the home knows a child is looking');
select pg_temp.ok(jsonb_array_length(public.portal_home(9301) -> 'schedule') >= 2, 'the child sees the coming classes');
select pg_temp.ok((public.portal_home(9301) -> 'schedule' -> 0 ->> 'class') = 'Test Class A', 'with the class name');
select pg_temp.ok(jsonb_array_length(public.portal_home(9301) -> 'lessons') >= 3, 'and past lessons');
select pg_temp.ok(jsonb_array_length(public.portal_home(9301) -> 'lessons' -> 0 -> 'scores') >= 1
  or jsonb_array_length(public.portal_home(9301) -> 'lessons' -> 1 -> 'scores') >= 1, 'with the teacher''s ratings');
select pg_temp.ok(public.portal_home(9301)::text not like '%Built the menu screen%'
  and public.portal_home(9301)::text not like '%Shy today%'
  and public.portal_home(9301)::text not like '%remark%', 'never the teacher''s remarks');
select pg_temp.ok((public.portal_home(9301) -> 'points' ->> 'total')::int = 9, 'the points total');
select pg_temp.ok(not (public.portal_home(9301) ? 'package'), 'no package for a child by default');
select pg_temp.fails($$select public.portal_home(9302)$$, 'not found', 'a child cannot open another child');
select pg_temp.ok((select count(*) from public.students) = 0 and (select count(*) from public.people) = 0, 'a child still reads no CRM tables');

-- The parent
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.ok(public.current_parent_person_id() = 9501, 'the parent login resolves');
select pg_temp.ok((select string_agg(full_name, ',') from public.portal_children()) = 'Ali', 'a parent sees their children');
select pg_temp.ok((public.portal_home(9301) ->> 'viewer') = 'parent' and (public.portal_home(9301) -> 'package' ->> 'lessons_left')::int = 4,
  'a parent sees lessons left');
select pg_temp.fails($$select public.portal_home(9302)$$, 'not found', 'a parent cannot open a child that is not theirs');
select pg_temp.ok((select count(*) from public.students) = 0 and (select count(*) from public.leads) = 0, 'a parent reads no CRM tables');

-- Settings, branding, switching a login off
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.set_portal_settings('{"school_name": "Mirai AI School", "accent_color": "#123abc",
  "student_sees": {"schedule": true, "points": false, "scores": true, "package": true},
  "parent_sees": {"schedule": true, "points": true, "scores": true, "package": true}}');
select pg_temp.fails($$select public.set_portal_settings('{"school_name": "X", "accent_color": "pink", "student_sees": {}, "parent_sees": {}}')$$,
  'not valid', 'the colour must be #rrggbb');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(not (public.portal_home(9301) ? 'points') and (public.portal_home(9301) ? 'package'), 'the school decides what a child sees');
reset role;
set local role anon;
select pg_temp.ok((public.portal_branding() ->> 'school_name') = 'Mirai AI School', 'the sign-in screen gets the school name without a login');
reset role;
update public.portal_accounts set is_active = false where username = 'mdm.lim';
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select pg_temp.ok((select count(*) from public.portal_children()) = 0, 'a switched-off parent login sees nothing');

-- Live questions in class (20261022030000) -----------------------------------
reset role;
update public.portal_accounts set is_active = true where username = 'mdm.lim';
-- A class A lesson today, whatever day the checks run.
insert into public.schedules (id, teacher_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, classroom_id)
  overriding system value
  select 9203, 9002, 'Class A today', 'regular', 'weekly', extract(dow from timezone('Asia/Kuala_Lumpur', now()))::int, '08:00', '23:00', '2026-09-01', 9101;

select pg_temp.ok(public.answer_matches('  kuala   lumpor ', '[{"text": "Kuala Lumpur", "match": "close"}]', false), 'close answers allow a spelling slip');
select pg_temp.ok(not public.answer_matches('KL', '[{"text": "kl", "match": "exact"}]', true), 'case counts when the question says so');
select pg_temp.ok(public.answer_matches('it repeats the steps', '[{"text": "repeat", "match": "contains"}]', false), 'contains answers');
select pg_temp.ok(public.text_edit_distance('kitten', 'sitting') = 3, 'edit distance');
select pg_temp.ok(public.live_question_points(10, 0, 60, 'speed') = 10 and public.live_question_points(10, 30, 60, 'speed') = 8
  and public.live_question_points(10, 60, 60, 'speed') = 5 and public.live_question_points(10, 59, 60, 'fixed') = 10, 'speed and fixed points');

create temp table lq_ids (name text primary key, id bigint);
grant all on lq_ids to authenticated, service_role;
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
insert into lq_ids
select 'session', (public.open_class_session(9203, (timezone('Asia/Kuala_Lumpur', now()))::date)).id;
insert into lq_ids values
  ('q_choice', (public.save_question(null, '{"kind": "choice", "prompt": "Which loop repeats forever?", "options": [{"text": "repeat 10", "correct": false}, {"text": "forever", "correct": true}, {"text": "if", "correct": false}], "points": 10, "time_limit_seconds": 60, "explanation": "forever never stops"}')).id),
  ('q_fill', (public.save_question(null, '{"kind": "fill", "prompt": "Capital?", "accepted_answers": [{"text": "Kuala Lumpur", "match": "close"}], "points": 10}')).id),
  ('q_short', (public.save_question(null, '{"kind": "short", "prompt": "What does a loop do?", "accepted_answers": [{"text": "repeat", "match": "contains"}], "points": 20}')).id),
  ('q_shot', (public.save_question(null, '{"kind": "screenshot", "prompt": "Show your sprite"}')).id),
  ('q_link', (public.save_question(null, '{"kind": "link", "prompt": "Send your project"}')).id);

-- Pop the choice question
insert into lq_ids select 'live1', (public.push_live_question((select id from lq_ids where name = 'session'), (select id from lq_ids where name = 'q_choice'))).id;
select pg_temp.ok((select status from public.class_sessions where id = (select id from lq_ids where name = 'session')) = 'live', 'popping a question starts the lesson');
select pg_temp.ok((select options from public.live_questions where id = (select id from lq_ids where name = 'live1'))::text not like '%correct%', 'the popped question carries no answers');
select pg_temp.ok((select correct_options from public.live_question_keys where live_question_id = (select id from lq_ids where name = 'live1')) = '{1}', 'its key is kept apart');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.fails(format('select public.push_live_question(%s, %s)', (select id from lq_ids where name = 'session'), (select id from lq_ids where name = 'q_choice')),
  'only this class', 'another teacher cannot pop questions in this lesson');
select pg_temp.ok((select count(*) from public.live_questions) = 0, 'another teacher does not see this lesson''s questions');

-- The child answers
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok((select count(*) from public.live_questions) = 1, 'the child sees the popped question (for real time)');
select pg_temp.ok((select count(*) from public.live_question_keys) = 0 and (select count(*) from public.live_answers) = 0, 'but never the key or the answers');
select pg_temp.ok((public.portal_live_state(9301) ->> 'active')::boolean and (public.portal_live_state(9301) -> 'question' ->> 'open')::boolean,
  'the app shows the open question');
select pg_temp.ok(public.portal_live_state(9301) -> 'key' = 'null'::jsonb, 'no answer key before the reveal');
select pg_temp.fails(format('select public.submit_live_answer(%s, 9301, %L)', (select id from lq_ids where name = 'live1'), '{"choices": [7]}'), 'pick an answer', 'an option that does not exist is refused');
select pg_temp.fails(format('select public.submit_live_answer(%s, 9301, %L)', (select id from lq_ids where name = 'live1'), '{}'), 'pick an answer', 'an empty answer is refused');
select pg_temp.ok((public.submit_live_answer((select id from lq_ids where name = 'live1'), 9301, '{"choices": [1]}') ->> 'status') = 'received', 'the child answers');
select pg_temp.fails(format('select public.submit_live_answer(%s, 9301, %L)', (select id from lq_ids where name = 'live1'), '{"choices": [0]}'), 'already answered', 'one answer per question');
select pg_temp.ok((public.portal_live_state(9301) -> 'answer' -> 'result') = 'null'::jsonb, 'right or wrong stays hidden until the reveal');
select pg_temp.fails(format('select public.submit_live_answer(%s, 9302, %L)', (select id from lq_ids where name = 'live1'), '{"choices": [1]}'), 'not found', 'a child cannot answer for another child');
select pg_temp.fails($$select public.portal_live_state(9302)$$, 'not found', 'nor see another child''s question');
select pg_temp.fails(format('select public.reveal_live_question(%s)', (select id from lq_ids where name = 'live1')), 'not found', 'a child cannot reveal');

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select pg_temp.ok((select count(*) from public.live_questions) = 0, 'a child in another class does not see the question');

reset role;
select pg_temp.ok((select result = 'correct' and points = 10 and marked_by = 'auto' and answered_by = 'student' from public.live_answers where student_id = 9301),
  'a right choice is marked at once with full points');
select pg_temp.ok((select points from public.student_points where kind = 'question' and student_id = 9301) = 10, 'the points go into the ledger');
insert into lq_ids select 'pts_other', coalesce(sum(points), 0) from public.student_points where student_id = 9301 and kind <> 'question';
insert into lq_ids select 'pts_all', coalesce(sum(points), 0) from public.student_points where student_id = 9301;
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select pg_temp.ok((public.portal_home(9301) -> 'points' ->> 'total')::int = (select id from lq_ids where name = 'pts_other')
  and public.portal_home(9301)::text not like '%Question: Which loop%', 'question points stay out of the app until the answer is shown');

-- The teacher reveals
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select pg_temp.ok((select count(*) from public.live_answers) = 1, 'the teacher sees the answers');
select pg_temp.ok((public.reveal_live_question((select id from lq_ids where name = 'live1'))).status = 'closed', 'revealing closes the question');
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.ok((public.portal_live_state(9301) -> 'answer' ->> 'result') = 'correct'
  and (public.portal_live_state(9301) -> 'key' -> 'correct_options') = '[1]'::jsonb
  and (public.portal_live_state(9301) -> 'key' ->> 'explanation') = 'forever never stops', 'after the reveal the parent sees the result and the right answer');
select pg_temp.ok((public.portal_live_state(9301) -> 'leaderboard' -> 0 ->> 'name') = 'Ali' and (public.portal_live_state(9301) ->> 'my_place')::int = 1, 'the top places show');
select pg_temp.ok((public.portal_home(9301) -> 'points' ->> 'total')::int = (select id from lq_ids where name = 'pts_all'), 'and count once it is shown');
select pg_temp.fails(format('select public.submit_live_answer(%s, 9301, %L)', (select id from lq_ids where name = 'live1'), '{"choices": [1]}'), 'time is up', 'a closed question takes no answers');

-- Fill-in, from the parent's phone, half way through the time
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
insert into lq_ids select 'live2', (public.push_live_question((select id from lq_ids where name = 'session'), (select id from lq_ids where name = 'q_fill'), 60)).id;
reset role;
update public.live_questions set opened_at = timezone('utc', now()) - interval '30 seconds', closes_at = timezone('utc', now()) + interval '30 seconds'
where id = (select id from lq_ids where name = 'live2');
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select public.submit_live_answer((select id from lq_ids where name = 'live2'), 9301, '{"text": "kuala lumpor"}');
reset role;
select pg_temp.ok((select result = 'correct' and points = 8 and answered_by = 'parent' from public.live_answers where live_question_id = (select id from lq_ids where name = 'live2')),
  'speed scoring: half way through the time gives 80%');

-- The timer ran out
update public.live_questions set opened_at = timezone('utc', now()) - interval '2 minutes', closes_at = timezone('utc', now()) - interval '1 minute'
where id = (select id from lq_ids where name = 'live2');
update public.live_answers set result = 'wrong' where live_question_id = (select id from lq_ids where name = 'live2');
select public.sync_live_answer_points(id) from public.live_answers where live_question_id = (select id from lq_ids where name = 'live2');
delete from public.live_answers where live_question_id = (select id from lq_ids where name = 'live2');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select pg_temp.fails(format('select public.submit_live_answer(%s, 9301, %L)', (select id from lq_ids where name = 'live2'), '{"text": "KL"}'), 'time is up', 'no answers after the timer');

-- Short answer: no match waits for the teacher; the AI only suggests
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
insert into lq_ids select 'live3', (public.push_live_question((select id from lq_ids where name = 'session'), (select id from lq_ids where name = 'q_short'))).id;
select pg_temp.ok((select count(*) from public.live_questions where session_id = (select id from lq_ids where name = 'session') and status = 'live') = 1, 'popping closes the last question');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select public.submit_live_answer((select id from lq_ids where name = 'live3'), 9301, '{"text": "It does the same thing again and again"}');
reset role;
select pg_temp.ok((select result = 'pending' and points = 0 from public.live_answers where live_question_id = (select id from lq_ids where name = 'live3')), 'an unmatched short answer waits for the teacher');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select pg_temp.fails(format('select public.apply_live_ai_mark(%s, %L, %L, %L)', (select id from public.live_answers where live_question_id = (select id from lq_ids where name = 'live3')), 'right', 'x', 'y'),
  'permission denied', 'only the server records AI suggestions');
reset role;
set local role service_role;
select public.apply_live_ai_mark((select id from public.live_answers where live_question_id = (select id from lq_ids where name = 'live3')), 'right', 'Yes, a loop repeats.', 'Means repeat.');
reset role;
select pg_temp.ok((select result = 'pending' and ai_suggestion = 'right' from public.live_answers where live_question_id = (select id from lq_ids where name = 'live3')), 'the AI suggestion does not mark by itself');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select public.mark_live_answer((select id from public.live_answers where live_question_id = (select id from lq_ids where name = 'live3')), true, 'Yes, a loop repeats.');
reset role;
select pg_temp.ok((select points from public.live_answers where live_question_id = (select id from lq_ids where name = 'live3')) = 20
  and (select count(*) from public.student_points where kind = 'question' and student_id = 9301) = 2, 'the teacher marks it right and the points follow');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select public.mark_live_answer((select id from public.live_answers where live_question_id = (select id from lq_ids where name = 'live3')), false);
reset role;
select pg_temp.ok((select points from public.live_answers where live_question_id = (select id from lq_ids where name = 'live3')) = 0
  and (select count(*) from public.student_points where kind = 'question' and student_id = 9301) = 1, 'marking it wrong takes the points back');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select pg_temp.fails(format('select public.undo_points(%s)', (select min(id) from public.student_points where kind = 'question')), 'marked again', 'question points are not undone by hand');
reset role;
insert into lq_ids select 'ans3', id from public.live_answers where live_question_id = (select id from lq_ids where name = 'live3');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
set local role authenticated;
select pg_temp.fails(format('select public.mark_live_answer(%s, true)', (select id from lq_ids where name = 'ans3')),
  'not found', 'another teacher cannot mark');

-- Link and screenshot
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
insert into lq_ids select 'live4', (public.push_live_question((select id from lq_ids where name = 'session'), (select id from lq_ids where name = 'q_link'))).id;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.fails(format('select public.submit_live_answer(%s, 9301, %L)', (select id from lq_ids where name = 'live4'), '{"text": "my game"}'), 'link', 'a link must be a link');
select pg_temp.ok((public.submit_live_answer((select id from lq_ids where name = 'live4'), 9301, '{"text": "https://scratch.mit.edu/projects/1"}') ->> 'status') = 'received', 'a link answer');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
insert into lq_ids select 'live5', (public.push_live_question((select id from lq_ids where name = 'session'), (select id from lq_ids where name = 'q_shot'))).id;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(public.portal_may_upload_live_answer((select id from lq_ids where name = 'session') || '/9301/a.jpg'), 'the child may add a picture for this question');
select pg_temp.ok(not public.portal_may_upload_live_answer((select id from lq_ids where name = 'session') || '/9302/a.jpg'), 'but not into another child''s folder');
select pg_temp.fails(format('select public.submit_live_answer(%s, 9301, %L)', (select id from lq_ids where name = 'live5'), jsonb_build_object('file', (select id from lq_ids where name = 'session') || '/9301/missing.jpg')),
  'picture', 'the picture must be uploaded first');
reset role;
insert into storage.objects (bucket_id, name) values ('live-answers', (select id from lq_ids where name = 'session') || '/9301/a.jpg');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select pg_temp.ok((public.submit_live_answer((select id from lq_ids where name = 'live5'), 9301, jsonb_build_object('file', (select id from lq_ids where name = 'session') || '/9301/a.jpg')) ->> 'status') = 'received', 'a screenshot answer');
select pg_temp.ok(public.may_read_live_answer_file((select id from lq_ids where name = 'session') || '/9301/a.jpg'), 'the family reads its own picture');
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select pg_temp.ok(not public.may_read_live_answer_file((select id from lq_ids where name = 'session') || '/9301/a.jpg'), 'another child cannot');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok(public.may_read_live_answer_file((select id from lq_ids where name = 'session') || '/9301/a.jpg'), 'the teacher reads it');

-- Settings
select pg_temp.fails($$select public.set_live_question_settings('{"scoring": "fixed", "leaderboard_top": 3, "ai_marking": true}')$$, 'only an admin', 'a teacher cannot change the settings');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.fails($$select public.set_live_question_settings('{"scoring": "fixed", "leaderboard_top": 3}')$$, 'ai marking', 'every setting is needed');
select pg_temp.fails($$select public.set_live_question_settings('{"scoring": "slow", "leaderboard_top": 3, "ai_marking": true}')$$, 'speed or fixed', 'scoring is speed or fixed');
select public.set_live_question_settings('{"scoring": "fixed", "leaderboard_top": 0, "ai_marking": false}');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(jsonb_array_length(public.portal_live_state(9301) -> 'leaderboard') = 0, 'a school can hide the leaderboard');

-- Reports for parents and consent (20261022050000) ---------------------------
reset role;
with r as (insert into public.student_ai_reports (student_id, audience, report, language) values (9301, 'parent', '{"summary": "Ali is doing well"}', 'en') returning id)
insert into lq_ids select 'rep_parent', id from r;
with r as (insert into public.student_ai_reports (student_id, audience, report, language) values (9301, 'teacher', '{"summary": "Teacher only"}', 'en') returning id)
insert into lq_ids select 'rep_teacher', id from r;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
set local role authenticated;
select public.set_portal_settings('{"school_name": "Mirai AI School", "accent_color": "#123abc",
  "student_sees": {"schedule": true, "points": true, "scores": true, "package": false, "report": false},
  "parent_sees": {"schedule": true, "points": true, "scores": true, "package": true, "report": true}}');

select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select pg_temp.ok(public.portal_home(9301) -> 'report' = 'null'::jsonb, 'a report is not in the app until a teacher shares it');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
update public.student_ai_reports set shared_at = '2000-01-01' where id = (select id from lq_ids where name = 'rep_parent');
update public.student_ai_reports set shared_at = now() where id = (select id from lq_ids where name = 'rep_teacher');
reset role;
select pg_temp.ok((select shared_by = 9002 and shared_at > now() - interval '1 minute' from public.student_ai_reports where id = (select id from lq_ids where name = 'rep_parent')),
  'the teacher shares the parent report; the database stamps who and when');
select pg_temp.ok((select shared_at is null from public.student_ai_reports where id = (select id from lq_ids where name = 'rep_teacher')), 'a report written for teachers cannot be shared');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
set local role authenticated;
update public.student_ai_reports set shared_at = null where id = (select id from lq_ids where name = 'rep_parent');
reset role;
select pg_temp.ok((select shared_at is not null from public.student_ai_reports where id = (select id from lq_ids where name = 'rep_parent')), 'another teacher cannot unshare it');

select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select pg_temp.ok((public.portal_home(9301) -> 'report' -> 'report' ->> 'summary') = 'Ali is doing well', 'the parent sees the shared report');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(not (public.portal_home(9301) ? 'report'), 'a child does not, by default');
select pg_temp.ok(not (public.portal_home(9301) ? 'consents'), 'and a child gets no consent questions');

-- Consent
select pg_temp.fails($$select public.portal_set_consent(9301, 'ai_analysis', true)$$, 'only a parent', 'a child cannot give consent');
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.ok(jsonb_array_length(public.portal_home(9301) -> 'consents') = 2
  and (public.portal_home(9301) -> 'consents' -> 0 -> 'granted') = 'null'::jsonb, 'the parent sees the two consent questions, unanswered');
select public.portal_set_consent(9301, 'ai_analysis', true);
select pg_temp.ok((public.portal_home(9301) -> 'consents' -> 0 ->> 'granted')::boolean, 'the parent agrees');
select pg_temp.fails($$select public.portal_set_consent(9302, 'ai_analysis', true)$$, 'only a parent', 'not for a child that is not theirs');
select pg_temp.fails($$select public.portal_set_consent(9301, 'photos', true)$$, 'unknown consent', 'unknown consents are refused');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok(public.student_has_consent(9301, 'ai_analysis') and not public.student_has_consent(9301, 'class_recording'), 'the teacher can check the consent');
select pg_temp.ok((select count(*) from public.student_consents where student_id = 9301 and text_shown like 'I agree%') = 1, 'the wording shown is kept with the answer');
select pg_temp.fails($$insert into public.student_consents (student_id, kind, granted, text_shown) values (9301, 'ai_analysis', true, 'x')$$, 'permission denied', 'staff cannot write consents themselves');
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select public.portal_set_consent(9301, 'ai_analysis', false);
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok(not public.student_has_consent(9301, 'ai_analysis'), 'the parent can withdraw');

-- Settings
select pg_temp.fails($$select public.set_portal_consents('{}')$$, 'only admin', 'a teacher cannot change the consent wording');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.fails($$select public.set_portal_consents('{"ai_analysis": {"title": "AI", "text": "ok", "required": true}}')$$, 'needs a title', 'both consents are needed');
select public.set_portal_consents('{"ai_analysis": {"title": "AI", "text": "We use AI.", "required": true}, "class_recording": {"title": "Video", "text": "We record.", "required": false}}');
select public.set_portal_settings('{"school_name": "Mirai AI School", "accent_color": "#123abc",
  "student_sees": {"schedule": true, "points": true, "scores": true, "package": false, "report": true},
  "parent_sees": {"schedule": true, "points": true, "scores": true, "package": true, "report": true}}');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(public.portal_home(9301) ? 'report', 'a school can show the report to children too');
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.ok((public.portal_home(9301) -> 'consents' -> 0 ->> 'text') = 'We use AI.' and (public.portal_home(9301) -> 'consents' -> 0 ->> 'required')::boolean,
  'the school''s own wording shows in the app');

-- Zoom for each lesson (20261022060000) --------------------------------------
reset role;
-- The lesson of 2026-10-21 (class A, 15:00-16:00 KL) gets a meeting with sign-up.
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
insert into lq_ids select 'zsession', (public.open_class_session(9201, '2026-10-21')).id;
select pg_temp.ok((select count(*) from public.class_session_roster((select id from lq_ids where name = 'zsession'))) = 1
  and (select full_name from public.class_session_roster((select id from lq_ids where name = 'zsession'))) = 'Ali', 'the roster of the lesson, for signing up to Zoom');
reset role;
insert into public.class_session_zoom (session_id, meeting_id, join_url, uses_registration)
values ((select id from lq_ids where name = 'zsession'), '123456789', 'https://zoom.us/j/123456789', true);
insert into public.class_session_zoom_links (session_id, student_id, registrant_id, join_url)
values ((select id from lq_ids where name = 'zsession'), 9301, 'reg-ali', 'https://zoom.us/w/123456789?tk=ali');
-- Ali was in the meeting 14:55-15:20 and 15:25-15:50 KL (50 minutes inside the lesson).
insert into public.zoom_participation (session_id, student_id, participant_uuid, user_name, joined_at, left_at) values
  ((select id from lq_ids where name = 'zsession'), 9301, 'p1', 'Ali', '2026-10-21 14:55+08', '2026-10-21 15:20+08'),
  ((select id from lq_ids where name = 'zsession'), 9301, 'p2', 'Ali', '2026-10-21 15:25+08', '2026-10-21 15:50+08');
insert into public.class_session_recordings (session_id, zoom_recording_uuid, share_url, passcode, started_at)
values ((select id from lq_ids where name = 'zsession'), 'rec1', 'https://zoom.us/rec/share/abc', 'pw1', '2026-10-21 15:00+08');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select pg_temp.ok((select minutes from public.lesson_zoom_minutes(9201, '2026-10-21') where student_id = 9301) = 50
  and (select counts_as_present from public.lesson_zoom_minutes(9201, '2026-10-21') where student_id = 9301), 'minutes online inside the lesson, and they count as there');
select pg_temp.ok((select count(*) from public.class_session_zoom_links) = 1 and (select count(*) from public.zoom_participation) = 2, 'the teacher sees the links and who joined');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select count(*) from public.class_session_zoom_links) = 0 and (select count(*) from public.lesson_zoom_minutes(9201, '2026-10-21')) = 0
  and (select count(*) from public.class_session_roster((select id from lq_ids where name = 'zsession'))) = 0, 'another teacher sees none of it');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok((select count(*) from public.class_session_zoom_links) = 0 and (select count(*) from public.class_session_recordings) = 0, 'a child reads none of the tables');
select pg_temp.ok(exists (select 1 from jsonb_array_elements(public.portal_home(9301) -> 'schedule') e
  where e ->> 'date' = '2026-10-21' and e ->> 'zoom_link' = 'https://zoom.us/w/123456789?tk=ali') or (timezone('Asia/Kuala_Lumpur', now()))::date > '2026-10-21',
  'the app shows the child''s own link for that lesson');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.set_zoom_attendance(90);
select pg_temp.fails($$select public.set_zoom_attendance(0)$$, '1 to 100', 'the rule is 1 to 100 percent');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$select public.set_zoom_attendance(50)$$, 'only admin', 'a teacher cannot change the rule');
select pg_temp.ok(not (select counts_as_present from public.lesson_zoom_minutes(9201, '2026-10-21') where student_id = 9301), 'with 90% needed, 50 minutes is not enough');
-- Notes during a lesson (20261023110000) -----------------------------------------
reset role;
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
-- a child who is in the lesson that day, and one who is not
insert into lq_ids select 'nkid', (select student_id from public.class_session_roster((select id from lq_ids where name = 'zsession')) order by student_id limit 1);
insert into lq_ids select 'nout', (select id from public.students where id in (9301, 9302) and id <> (select id from lq_ids where name = 'nkid') order by id limit 1);
select pg_temp.ok((select id from lq_ids where name = 'nkid') is not null, 'the lesson has a child');
select public.save_class_session_note((select id from lq_ids where name = 'zsession'), (select id from lq_ids where name = 'nkid'), '  Helped Siti with loops  ');
select pg_temp.ok((select note from public.class_session_notes where student_id = (select id from lq_ids where name = 'nkid')) = 'Helped Siti with loops', 'the teacher writes a note, trimmed');
select public.save_class_session_note((select id from lq_ids where name = 'zsession'), (select id from lq_ids where name = 'nkid'), 'Great focus');
select pg_temp.ok((select count(*) from public.class_session_notes) = 1 and (select note from public.class_session_notes) = 'Great focus', 'one note per child per lesson');
select pg_temp.fails($$select public.save_class_session_note((select id from lq_ids where name = 'zsession'), (select id from lq_ids where name = 'nout'), 'x')$$, 'not in this lesson', 'only children in the lesson');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select count(*) from public.class_session_notes) = 0, 'another teacher does not see the notes');
select pg_temp.fails($$select public.save_class_session_note((select session_id from public.class_session_zoom where meeting_id = '123456789'), 9301, 'x')$$, 'only this class', 'another teacher cannot write');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok((select count(*) from public.class_session_notes) = 0, 'a child never sees the notes');
select pg_temp.fails($$insert into public.class_session_notes (session_id, student_id, note) values (1, 9301, 'x')$$, 'permission denied', 'nobody writes the table directly');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select public.save_class_session_note((select id from lq_ids where name = 'zsession'), (select id from lq_ids where name = 'nkid'), '   ');
select pg_temp.ok((select count(*) from public.class_session_notes) = 0, 'an empty note removes it');


-- Late reminders and the question plan (20261023120000) ---------------------------
reset role;
insert into public.questions (owner_id, kind, prompt) values (9002, 'short', 'Plan one'), (9002, 'short', 'Plan two');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select public.record_late_reminder((select id from lq_ids where name = 'zsession'), (select id from lq_ids where name = 'nkid'), 'phone');
select pg_temp.ok((select count(*) from public.lesson_late_reminders where sent_via = 'phone' and sent_by = 9002) = 1, 'the teacher records a reminder sent');
select pg_temp.fails($$select public.record_late_reminder((select id from lq_ids where name = 'zsession'), (select id from lq_ids where name = 'nkid'), 'sms')$$, 'how the reminder', 'only inbox or phone');
select pg_temp.fails($$select public.record_late_reminder((select id from lq_ids where name = 'zsession'), (select id from lq_ids where name = 'nout'), 'inbox')$$, 'not in this lesson', 'only children in the lesson');
select pg_temp.fails($$select public.set_late_reminder_settings(5, 'Hi')$$, 'only admin', 'a teacher cannot change the reminder words');
select public.set_class_session_plan((select id from lq_ids where name = 'zsession'), (select array_agg(id order by id desc) from public.questions where prompt in ('Plan one', 'Plan two')));
select pg_temp.ok((select array_agg(q.prompt order by p.position) from public.class_session_question_plan p join public.questions q on q.id = p.question_id) = array['Plan two', 'Plan one'], 'the plan keeps the order');
select pg_temp.fails($$select public.set_class_session_plan((select id from lq_ids where name = 'zsession'), array[1, 1]::bigint[])$$, 'twice', 'a question only once');
select pg_temp.fails($$select public.set_class_session_plan((select id from lq_ids where name = 'zsession'), array[-5]::bigint[])$$, 'not in the bank', 'only bank questions');
select public.set_class_session_plan((select id from lq_ids where name = 'zsession'), '{}');
select pg_temp.ok((select count(*) from public.class_session_question_plan) = 0, 'an empty plan clears it');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.fails($$select public.set_class_session_plan((select session_id from public.class_session_zoom where meeting_id = '123456789'), '{}')$$, 'only this class', 'another teacher cannot plan');
select pg_temp.ok((select count(*) from public.lesson_late_reminders) = 0, 'another teacher does not see the reminders');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok((select count(*) from public.lesson_late_reminders) = 0 and (select count(*) from public.class_session_question_plan) = 0, 'a child sees neither');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.fails($$select public.set_late_reminder_settings(121, 'Hi')$$, '0 to 120', 'the reminder waits at most 2 hours');
select public.set_late_reminder_settings(10, '  {child} is late  ');
select pg_temp.ok((select value from public.app_settings where key = 'lesson_late_reminder') = '{"after_minutes": 10, "text": "{child} is late"}'::jsonb, 'admin sets the reminder words');
-- Points at once, lesson summaries, Zoom check (20261024210000) ---------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select pg_temp.ok((select count(*) from public.student_points where student_id = 9301) > 0, 'the child reads their own points');
select pg_temp.ok((select count(*) from public.student_points where student_id <> 9301) = 0, 'and nobody else''s');
select pg_temp.ok(exists (select 1 from jsonb_array_elements(public.portal_lesson_summaries(9301)) e
  where e ->> 'date' = '2026-10-14' and (e ->> 'points')::int >= 1), 'the lesson summary has the lesson''s points');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.portal_lesson_summaries(9301)) e where e ->> 'date' > '2026-10-18'),
  'no summary for a lesson that has not happened');
select pg_temp.fails($$select public.portal_lesson_summaries(9302)$$, 'not found', 'no summary of another child');
select public.portal_record_zoom_check(9301, true, 'web');
select public.portal_record_zoom_check(9301, false, 'android');
select pg_temp.ok((select count(*) from public.student_zoom_checks) = 1 and (select not ok from public.student_zoom_checks), 'a second answer within a minute replaces the first');
select pg_temp.fails($$select public.portal_record_zoom_check(9302, true, 'web')$$, 'not found', 'only for one''s own child');
select pg_temp.fails($$select public.portal_record_zoom_check(9301, true, 'tv')$$, 'unknown device', 'only web, ios or android');
select pg_temp.fails($$insert into public.student_zoom_checks (student_id, ok) values (9301, true)$$, 'permission denied', 'nobody writes the checks directly');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((select count(*) from public.student_zoom_checks where student_id = 9301) = 1, 'the teacher sees the Zoom check');
reset role;
update public.app_settings set value = jsonb_set(value, '{student_sees,points}', 'false') where key = 'student_portal';
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select pg_temp.ok((select count(*) from public.student_points) = 0, 'no points when the school hides them from the child');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.portal_lesson_summaries(9301)) e where e ->> 'points' is not null),
  'and no points in the summaries');
reset role;
update public.app_settings set value = jsonb_set(value, '{student_sees,points}', 'true') where key = 'student_portal';
-- Lesson notes (20261024610000) ------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
insert into lq_ids select 'lnote', public.save_lesson_note(null, (select id from lq_ids where name = 'zsession'), ' Loops ', 'A loop repeats blocks.', false);
select pg_temp.ok((select count(*) from public.class_session_lesson_notes where published_at is null) = 1, 'the teacher saves a draft note');
select pg_temp.fails($$select public.save_lesson_note(null, (select id from lq_ids where name = 'zsession'), '', 'x', false)$$, 'title', 'a note needs a title');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(jsonb_array_length(public.portal_lesson_notes(9301)) = 0, 'a draft is not in the app');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select public.save_lesson_note((select id from lq_ids where name = 'lnote'), null, 'Loops', 'A loop repeats blocks again and again.', true);
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok((select (public.portal_lesson_notes(9301) -> 0 ->> 'title')) = 'Loops', 'the child reads a published note');
select pg_temp.fails($$select public.portal_lesson_notes(9302)$$, 'not found', 'not another child''s notes');
select pg_temp.fails($$select public.save_lesson_note(null, (select id from lq_ids where name = 'zsession'), 'x', 'y', true)$$, 'only this class', 'a child cannot write notes');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.fails($$select public.delete_lesson_note((select id from lq_ids where name = 'lnote'))$$, 'not found', 'another teacher cannot delete it');
select pg_temp.ok((select count(*) from public.class_session_lesson_notes) = 0, 'another teacher does not see it');
reset role;
update public.app_settings set value = jsonb_set(value, '{student_sees,notes}', 'false') where key = 'student_portal';
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select pg_temp.ok(jsonb_array_length(public.portal_lesson_notes(9301)) = 0, 'no notes when the school hides them');
reset role;
update public.app_settings set value = value #- '{student_sees,notes}' where key = 'student_portal';
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select public.delete_lesson_note((select id from lq_ids where name = 'lnote'));
select pg_temp.ok((select count(*) from public.class_session_lesson_notes) = 0, 'the teacher deletes the note');
reset role;
-- Recordings show under the lesson, when the school shows them
reset role;
insert into public.class_session_recordings (session_id, zoom_recording_uuid, share_url, passcode, started_at)
select id, 'rec14', 'https://zoom.us/rec/share/oct14', 'pw14', '2026-10-14 15:00+08' from public.class_sessions where schedule_id = 9201 and lesson_date = '2026-10-14';
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
set local role authenticated;
select public.set_portal_settings('{"school_name": "Mirai AI School", "accent_color": "#123abc",
  "student_sees": {"schedule": true, "points": true, "scores": true, "package": false, "report": false, "recordings": true},
  "parent_sees": {"schedule": true, "points": true, "scores": true, "package": true, "report": true, "recordings": false}}');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(exists (select 1 from jsonb_array_elements(public.portal_home(9301) -> 'lessons') e
  where e ->> 'date' = '2026-10-14' and e -> 'recording' ->> 'url' = 'https://zoom.us/rec/share/oct14'), 'the child sees the recording under that lesson');
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.portal_home(9301) -> 'lessons') e
  where e -> 'recording' <> 'null'::jsonb), 'a school can hide recordings from a login');

-- Terms at the first sign-in (20261022070000) ---------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select pg_temp.ok(not (public.portal_onboarding() ->> 'needs_terms')::boolean, 'a child''s login is not asked to agree');
select pg_temp.fails($$select public.portal_accept_terms(1, '{"ai_analysis": true, "class_recording": true}')$$, 'only a parent', 'a child cannot agree to the terms');

select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.ok((public.portal_onboarding() ->> 'needs_terms')::boolean
  and (public.portal_onboarding() -> 'terms' ->> 'version')::int = 1
  and jsonb_array_length(public.portal_onboarding() -> 'consents') = 2, 'a parent who has not agreed sees the terms and the consent questions');
-- AI consent was made required earlier in these checks.
select pg_temp.fails($$select public.portal_accept_terms(1, '{"ai_analysis": false, "class_recording": true}')$$, 'the school needs', 'a required consent must be yes');
select pg_temp.fails($$select public.portal_accept_terms(1, '{"ai_analysis": true}')$$, 'answer each', 'every consent needs an answer');
select pg_temp.fails($$select public.portal_accept_terms(7, '{"ai_analysis": true, "class_recording": true}')$$, 'have changed', 'only the terms shown can be agreed');
select public.portal_accept_terms(1, '{"ai_analysis": true, "class_recording": false}');
select pg_temp.ok(not (public.portal_onboarding() ->> 'needs_terms')::boolean, 'after agreeing the app opens');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok(public.student_has_consent(9301, 'ai_analysis') and not public.student_has_consent(9301, 'class_recording'), 'the answers count for the child');
select pg_temp.ok((select count(*) from public.portal_terms_acceptances where version = 1 and text_shown like 'This app shows%') = 1, 'the teacher sees the agreement, with the wording agreed to');
select pg_temp.fails($$select public.set_portal_terms('T', 'x')$$, 'only admin', 'a teacher cannot change the terms');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok(public.set_portal_terms('Our rules', 'This app shows your child''s classes, class links, points, the teacher''s ratings and the package. Keep your login to yourself. The school keeps your child''s records to run the classes and may contact you about them. You can ask the school to see or correct your child''s records at any time.') = 1,
  'a new title alone keeps the version');
select pg_temp.ok(public.set_portal_terms('Our rules', 'New wording.') = 2, 'new wording raises the version');
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.ok((public.portal_onboarding() ->> 'needs_terms')::boolean and (public.portal_onboarding() -> 'terms' ->> 'text') = 'New wording.', 'parents are asked again after a change');

-- Zoom accounts that host lessons (20261022080000) -----------------------------
reset role;
-- Class B also meets on Wednesdays 15:30-16:30 (overlaps class A's 15:00-16:00 on 2026-10-21).
insert into public.schedules (id, teacher_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, classroom_id)
  overriding system value values (9204, 9003, 'Class B extra', 'regular', 'weekly', 3, '15:30', '16:30', '2026-09-01', 9102);
update public.class_session_zoom set host_user = 'room1@school.my' where session_id = (select id from lq_ids where name = 'zsession');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select pg_temp.fails($$select public.set_zoom_hosts(array['room1@school.my'])$$, 'only admin', 'a teacher cannot change the Zoom accounts');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.fails($$select public.set_zoom_hosts(array['not an email'])$$, 'e-mail', 'each account is an e-mail');
select public.set_zoom_hosts(array[' Room1@School.my ', 'room2@school.my', 'room1@school.my', '']);
select pg_temp.ok((select value -> 'hosts' from public.app_settings where key = 'zoom_hosts') = '["room1@school.my", "room2@school.my"]'::jsonb, 'the list is cleaned: trimmed, lower case, no repeats');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
insert into lq_ids select 'bsession', (public.open_class_session(9204, '2026-10-21')).id;
select pg_temp.ok((select busy_with from public.zoom_hosts_for_session((select id from lq_ids where name = 'bsession')) where host_user = 'room1@school.my') like 'Class A weekly 15:00%'
  and (select busy_with from public.zoom_hosts_for_session((select id from lq_ids where name = 'bsession')) where host_user = 'room2@school.my') is null,
  'an account busy with an overlapping lesson is shown busy; the next one is free');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((select count(*) from public.zoom_hosts_for_session((select id from lq_ids where name = 'bsession'))) = 0, 'only the lesson''s own teacher sees its accounts');
select pg_temp.ok((select busy_with from public.zoom_hosts_for_session((select id from lq_ids where name = 'zsession')) where host_user = 'room1@school.my') is null,
  'a lesson does not count its own meeting as busy');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.fails($$select public.set_zoom_hosts(array['room1@school.my'], 0)$$, '1 to 10', 'an account runs 1 to 10 meetings at once');
select public.set_zoom_hosts(array['room1@school.my', 'room2@school.my'], 2);
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select busy_with is null and meetings = 1 from public.zoom_hosts_for_session((select id from lq_ids where name = 'bsession')) where host_user = 'room1@school.my'),
  'with 2 meetings per account, the busy account still has room for a second lesson');
select pg_temp.fails($$select public.set_teacher_zoom_host(9003, 'room3@school.my')$$, 'only admin', 'a teacher cannot set their Zoom account');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.fails($$select public.set_teacher_zoom_host(9003, 'room 3')$$, 'e-mail', 'the teacher''s account is an e-mail');
select public.set_teacher_zoom_host(9003, ' Room3@School.my ');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select host_user = 'room3@school.my' and preferred and busy_with is null
  from public.zoom_hosts_for_session((select id from lq_ids where name = 'bsession')) limit 1), 'the teacher''s own account comes first, marked preferred');
select pg_temp.ok((select count(*) from public.zoom_hosts_for_session((select id from lq_ids where name = 'bsession'))) = 3, 'the listed accounts follow as the fallback');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.set_teacher_zoom_host(9003, 'room1@school.my');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select count(*) from public.zoom_hosts_for_session((select id from lq_ids where name = 'bsession'))) = 2
  and (select preferred from public.zoom_hosts_for_session((select id from lq_ids where name = 'bsession')) where host_user = 'room1@school.my'),
  'a teacher''s account that is also listed shows once, preferred');

-- Recordings to Bunny (20261022090000) ---------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
set local role authenticated;
select pg_temp.fails($$select public.save_recording_library(null, 'Coding', '123456', '', null)$$, 'access key', 'a new library needs its key');
select pg_temp.fails($$select public.save_recording_library(null, 'Coding', 'abc', 'key-12345678', null)$$, 'check constraint', 'the library number is digits');
insert into lq_ids select 'lib', public.save_recording_library(null, 'Coding', '123456', 'key-12345678', null);
select public.save_recording_library((select id from lq_ids where name = 'lib'), 'Coding classes', '123456', '', 'col-1');
select public.set_classroom_recording_library(9101, (select id from lq_ids where name = 'lib'));
select pg_temp.ok((select has_key and classes = 1 and name = 'Coding classes' and collection_id = 'col-1' from public.recording_libraries_list()),
  'admin sees the library (not its key), and which classes use it');
select pg_temp.fails($$select public.set_recording_settings(null)$$, 'say whether', 'the delete setting needs an answer');
select public.set_recording_settings(true);

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$select count(*) from public.recording_libraries$$, 'permission denied', 'nobody signed in reads the libraries (they hold keys)');
select pg_temp.fails($$select * from public.recording_libraries_list()$$, 'only admin', 'a teacher cannot list the libraries');
select pg_temp.fails(format('select public.set_classroom_recording_library(9101, %s)', (select id from lq_ids where name = 'lib')), 'only admin', 'a teacher cannot change where recordings go');
reset role;
select pg_temp.ok((select api_key from public.recording_libraries where id = (select id from lq_ids where name = 'lib')) = 'key-12345678', 'an empty key on a change keeps the key');

-- The app plays Bunny's copy once it is ready
update public.class_session_recordings
set bunny_status = 'ready', bunny_library_id = '123456', bunny_video_id = 'vid-1', zoom_deleted_at = now()
where zoom_recording_uuid = 'rec14';
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select pg_temp.ok(exists (select 1 from jsonb_array_elements(public.portal_home(9301) -> 'lessons') e
  where e ->> 'date' = '2026-10-14' and e -> 'recording' ->> 'url' = 'https://iframe.mediadelivery.net/embed/123456/vid-1'), 'the app plays the Bunny copy');
reset role;
update public.class_session_recordings set bunny_status = 'sent' where zoom_recording_uuid = 'rec14';
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.portal_home(9301) -> 'lessons') e
  where e ->> 'date' = '2026-10-14' and e -> 'recording' <> 'null'::jsonb), 'nothing to play while Bunny is not ready and Zoom''s copy is gone');
reset role;
update public.class_session_recordings set zoom_deleted_at = null where zoom_recording_uuid = 'rec14';
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select pg_temp.ok(exists (select 1 from jsonb_array_elements(public.portal_home(9301) -> 'lessons') e
  where e ->> 'date' = '2026-10-14' and e -> 'recording' ->> 'url' = 'https://zoom.us/rec/share/oct14'), 'until then Zoom''s copy plays');

-- Several classes and class videos (20261022100000) ----------------------------
reset role;
with x as (insert into public.class_videos (classroom_id, teacher_id, title, year, month, bunny_library_id, bunny_video_id) values (9101, 9002, 'Loops June', 2026, 6, '123456', 'vid-june') returning id) insert into lq_ids select 'v1', id from x;
with x as (insert into public.class_videos (classroom_id, teacher_id, title, year, month, bunny_library_id, bunny_video_id) values (9101, 9002, 'Loops July', 2026, 7, '123456', 'vid-july') returning id) insert into lq_ids select 'v2', id from x;
insert into public.class_videos (classroom_id, title, year, month, bunny_library_id, bunny_video_id, is_archived) values (9101, 'Old', 2026, 6, '123456', 'vid-old', true);
with x as (insert into public.class_videos (classroom_id, teacher_id, title, year, month, bunny_library_id, bunny_video_id) values (9102, 9003, 'Class B June', 2026, 6, '123456', 'vid-b') returning id) insert into lq_ids select 'v4', id from x;
-- Ali is back in class A as his main class for these checks.
update public.students set classroom_id = 9101 where id = 9301;

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select pg_temp.ok((select count(*) from public.class_videos) = 0, 'a child reads no video rows directly');
select pg_temp.ok(jsonb_array_length(public.portal_class_videos(9301)) = 1
  and jsonb_array_length(public.portal_class_videos(9301) -> 0 -> 'videos') = 2, 'without month access the child sees the class''s shown videos (not archived ones)');
select pg_temp.fails($$select public.portal_class_videos(9302)$$, 'not found', 'not another child''s videos');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$select public.set_class_video_settings(true)$$, 'only admin', 'a teacher cannot turn on month access');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.set_class_video_settings(true);
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(jsonb_array_length(public.portal_class_videos(9301) -> 0 -> 'videos') = 0
  and jsonb_array_length(public.portal_class_videos(9301) -> 0 -> 'closed_months') = 2, 'with month access on, closed months show as closed');

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select public.set_student_video_access(9301, 9101, 2026, 6, true);
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok((public.portal_class_videos(9301) -> 0 -> 'videos' -> 0 ->> 'title') = 'Loops June'
  and jsonb_array_length(public.portal_class_videos(9301) -> 0 -> 'videos') = 1, 'an opened month shows its videos');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select public.set_student_video_access(9301, 9101, 2026, 6, true, '2020-01-01', '2020-01-31');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(jsonb_array_length(public.portal_class_videos(9301) -> 0 -> 'videos') = 0, 'access that ended is closed again');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select public.set_student_video_access(9301, 9101, 2026, 6, true);
select pg_temp.fails($$select public.set_student_video_access(9301, 9101, 2026, 6, true, '2026-02-01', '2026-01-01')$$, 'end after', 'access must end after it starts');

-- Progress
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select public.portal_save_video_progress(9301, (select id from lq_ids where name = 'v1'), 30, 100, true);
select public.portal_save_video_progress(9301, (select id from lq_ids where name = 'v1'), 95, 400, false);
select public.portal_save_video_progress(9301, (select id from lq_ids where name = 'v1'), 10, 20, true);
select pg_temp.fails(format('select public.portal_save_video_progress(9301, %s, 10, 10, true)', (select id from lq_ids where name = 'v2')), 'not found', 'no progress on a closed month');
select pg_temp.ok((public.portal_class_videos(9301) -> 0 -> 'videos' -> 0 ->> 'completed')::boolean, 'the app sees the video as finished');
reset role;
select pg_temp.ok((select watch_percentage = 95 and watch_seconds = 400 and rewatch_count = 1 and completed_at is not null from public.class_video_progress where video_id = (select id from lq_ids where name = 'v1'))
  and (select views from public.class_videos where id = (select id from lq_ids where name = 'v1')) = 2, 'progress keeps the furthest point; views and re-watches count');

-- Who manages a class's videos
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select pg_temp.ok((public.update_class_video((select id from lq_ids where name = 'v1'), 'Loops (June)', 'Repeat blocks', 2026, 6, '2026-06-10')).title = 'Loops (June)', 'the class teacher edits a video');
select pg_temp.ok((select count(*) from public.class_video_progress) >= 1, 'the class teacher sees who watched');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.fails(format('select public.set_class_video_archived(%s, true)', (select id from lq_ids where name = 'v1')), 'not found', 'another teacher cannot manage it');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.set_classroom_teacher_library(9101, 9003, (select id from lq_ids where name = 'lib'));
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select public.set_class_video_archived((select id from lq_ids where name = 'v2'), true);
reset role;
select pg_temp.ok((select is_archived from public.class_videos where id = (select id from lq_ids where name = 'v2')), 'a teacher with their own library for the class manages its videos');

-- Several classes
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select pg_temp.fails($$select public.add_student_to_classroom(9301, 9102)$$, 'may edit students', 'a plain teacher cannot change classes');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select public.add_student_to_classroom(9301, 9102);
select pg_temp.fails($$select public.add_student_to_classroom(9301, 9102)$$, 'already in this class', 'not twice in one class');
reset role;
select pg_temp.ok((select classroom_id from public.students where id = 9301) = 9101
  and public.is_in_classroom_on(9301, 9101, (timezone('Asia/Kuala_Lumpur', now()))::date)
  and public.is_in_classroom_on(9301, 9102, (timezone('Asia/Kuala_Lumpur', now()))::date), 'the student is in both classes; the main class stays');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select pg_temp.ok(jsonb_array_length(public.portal_class_videos(9301)) = 2, 'the app lists both classes');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok(exists (select 1 from public.students where id = 9301), 'the other class''s teacher sees the student');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select public.remove_student_from_classroom(9301, 9102);
reset role;
select pg_temp.ok(not public.is_in_classroom_on(9301, 9102, (timezone('Asia/Kuala_Lumpur', now()))::date), 'taking the student out of the extra class');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
set local role authenticated;
select public.add_student_to_classroom(9301, 9102);
select public.remove_student_from_classroom(9301, 9101);
reset role;
select pg_temp.ok((select classroom_id from public.students where id = 9301) = 9102
  and not public.is_in_classroom_on(9301, 9101, (timezone('Asia/Kuala_Lumpur', now()))::date)
  and (select count(*) from public.student_classroom_periods where student_id = 9301 and classroom_id = 9102 and end_date is null) = 1,
  'leaving the main class makes the other class the main one, without a second stay');

reset role;

-- One Bunny video in several classes (20261022110000) ----------------------------
reset role;
insert into public.classrooms (id, name, age_group, program_level, status) select 9199, 'Shared video class', age_group, program_level, 'active' from public.classrooms where id = 9101;
insert into public.class_videos (classroom_id, title, year, month, bunny_library_id, bunny_video_id) values (9199, 'Shared', 2026, 6, '123456', 'vid-june');
select pg_temp.fails($$insert into public.class_videos (classroom_id, title, year, month, bunny_library_id, bunny_video_id) values (9199, 'Twice', 2026, 6, '123456', 'vid-june')$$, 'duplicate key', 'a video is in a class once');
select pg_temp.ok((select count(*) from public.class_videos where bunny_video_id = 'vid-june') = 2, 'the same Bunny video in two classes');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
set local role authenticated;
select pg_temp.fails($$select * from public.legacy_ids$$, 'permission denied', 'nobody signed in reads the import ids');
reset role;

-- Who is in the lesson, strangers, waiting room, late leaves (20261023100000) ---
reset role;
insert into public.zoom_participation (session_id, student_id, participant_uuid, user_name, joined_at, left_at, is_host) values
  ((select id from lq_ids where name = 'zsession'), null, 'host1', 'Teacher', '2026-10-21 14:50+08', null, true),
  ((select id from lq_ids where name = 'zsession'), null, 'x1', 'Uncle Lim', '2026-10-21 15:05+08', null, false);
insert into public.zoom_waiting (session_id, student_id, participant_uuid, user_name, entered_at)
values ((select id from lq_ids where name = 'zsession'), 9301, 'w1', 'Ali', '2026-10-21 15:24+08');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select pg_temp.ok((select count(*) from public.zoom_waiting) = 1, 'the teacher sees the waiting room');
select pg_temp.ok((select minutes from public.lesson_zoom_minutes(9201, '2026-10-21') where student_id = 9301) = 50, 'a normal leave counts as reported');
select pg_temp.fails($$select public.clear_zoom_stranger((select id from public.zoom_participation where participant_uuid = 'p1'))$$, 'not found', 'a child''s own join is not a stranger');
select pg_temp.fails($$select public.clear_zoom_stranger((select id from public.zoom_participation where participant_uuid = 'host1'))$$, 'not found', 'the host is not a stranger');
select pg_temp.fails($$select public.set_zoom_room_rules(240, 5)$$, 'only admin', 'a teacher cannot change the late rules');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select count(*) from public.zoom_waiting) = 0, 'another teacher does not see the waiting room');
select pg_temp.fails($$select public.clear_zoom_stranger(1)$$, 'not found', 'another teacher cannot clear the notice');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok((select count(*) from public.zoom_waiting) = 0, 'a child does not see the waiting room');
reset role;
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
-- the id is read as postgres-visible data through the teacher's own policy
select public.clear_zoom_stranger((select id from public.zoom_participation where participant_uuid = 'x1'));
select pg_temp.ok((select stranger_cleared_at is not null from public.zoom_participation where participant_uuid = 'x1'), 'the teacher clears a stranger notice');
-- Ali's second stay ended by a dropped connection, reported at 15:50
reset role;
update public.zoom_participation set dropped = true, leave_reason = 'Network connection error' where participant_uuid = 'p2';
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
set local role authenticated;
select pg_temp.fails($$select public.set_zoom_room_rules(901, 5)$$, '0 to 900', 'grace is at most 15 minutes');
select pg_temp.fails($$select public.set_zoom_room_rules(0, 121)$$, '0 to 120', 'late is at most 2 hours');
select pg_temp.ok((select minutes from public.lesson_zoom_minutes(9201, '2026-10-21') where student_id = 9301) = 50, 'no grace until the school sets it');
select public.set_zoom_room_rules(600, 7);
select pg_temp.ok((select minutes from public.lesson_zoom_minutes(9201, '2026-10-21') where student_id = 9301) = 40, 'a dropped leave ends the grace earlier');
select pg_temp.ok((select (value ->> 'present_percent')::int = 90 and (value ->> 'late_minutes')::int = 7 from public.app_settings where key = 'zoom_attendance'), 'the late rules keep the percent');
select public.set_zoom_attendance(80);
select pg_temp.ok((select (value ->> 'drop_grace_seconds')::int = 600 from public.app_settings where key = 'zoom_attendance'), 'the percent keeps the late rules');
select public.set_zoom_room_rules(3600 / 4, 5);
select pg_temp.ok((select minutes from public.lesson_zoom_minutes(9201, '2026-10-21') where student_id = 9301) = 35, 'the most grace still counts the rest of the stay');

-- A class's teachers (20261023200000) -------------------------------------------
reset role;
-- Ali's main class is now 9102 (Ben's); Ben also has his own library for 9101 (above).
select pg_temp.ok(exists (select 1 from public.classroom_teachers where classroom_id = 9101 and teacher_id = 9003), 'a teacher given a library for a class teaches it');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
set local role authenticated;
select pg_temp.ok(exists (select 1 from public.classrooms where id = 9101), 'Ben sees the class he teaches without being its main teacher');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok(not exists (select 1 from public.classrooms where id = 9102), 'Amy does not see a class she does not teach');
select pg_temp.fails($$select public.set_classroom_teachers(9102, array[9003, 9002]::bigint[])$$, 'may edit classes', 'a teacher cannot change a class''s teachers');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.set_classroom_teachers(9102, array[9003, 9002]::bigint[]);
select pg_temp.fails($$select public.set_classroom_teachers(9102, array[9004]::bigint[])$$, 'teaching accounts', 'a staff account cannot teach');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok(exists (select 1 from public.classrooms where id = 9102)
  and exists (select 1 from public.students where id = 9301), 'a second teacher sees the class and its students');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.set_classroom_teachers(9102, array[9002]::bigint[]);
reset role;
select pg_temp.ok((select teacher_id from public.classrooms where id = 9102) = 9002, 'when the main teacher is taken off, the first one listed becomes main');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
set local role authenticated;
select pg_temp.ok(not exists (select 1 from public.classrooms where id = 9102), 'a teacher taken off a class no longer sees it');
reset role;
update public.classrooms set teacher_id = 9003 where id = 9102;
select pg_temp.ok((select array_agg(teacher_id order by teacher_id) from public.classroom_teachers where classroom_id = 9102) = array[9003]::bigint[],
  'a new main teacher replaces the old one');

-- Enrolment flows by class level (20261023300000) -------------------------------
reset role;
with x as (insert into public.programmes (name, outcome) values ('Regular sign-up', 'enrol') returning id) insert into lq_ids select 'flow', id from x;
with x as (insert into public.programmes (name, outcome) values ('Exam class sign-up', 'enrol') returning id) insert into lq_ids select 'flow2', id from x;
select pg_temp.ok(public.classroom_enrol_flow(9101) is null, 'a class with no flow of its own or of its level has none');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select pg_temp.fails(format('select public.set_program_level_flow(%L, %s)', (select program_level from public.classrooms where id = 9101), (select id from lq_ids where name = 'flow')), 'Only admin', 'a teacher cannot set a level''s flow');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.set_program_level_flow((select program_level from public.classrooms where id = 9101), (select id from lq_ids where name = 'flow'));
select pg_temp.ok(public.classroom_enrol_flow(9101) = (select id from lq_ids where name = 'flow'), 'a class follows its level''s flow');
select pg_temp.fails($$select public.set_program_level_flow('No such level', null)$$, 'not found', 'only a level that exists');
reset role;
update public.classrooms set programme_id = (select id from lq_ids where name = 'flow2') where id = 9101;
select pg_temp.ok(public.classroom_enrol_flow(9101) = (select id from lq_ids where name = 'flow2'), 'a class''s own flow comes before its level''s');

-- Videos a month (20261023400000) ------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select pg_temp.fails($$select public.set_class_videos_per_month(6)$$, 'Only admin', 'a teacher cannot change videos a month');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.set_class_videos_per_month(6);
select public.set_class_video_settings(true);
select pg_temp.fails($$select public.set_class_videos_per_month(0)$$, '1 to 31', 'videos a month is 1 to 31');
reset role;
select pg_temp.ok((select (value ->> 'per_month')::int = 6 and (value ->> 'month_access')::boolean from public.app_settings where key = 'class_videos'),
  'saving month access keeps videos a month');

rollback;
