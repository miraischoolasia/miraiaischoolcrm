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

reset role;
rollback;
