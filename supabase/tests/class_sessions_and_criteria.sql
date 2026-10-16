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

reset role;
rollback;
