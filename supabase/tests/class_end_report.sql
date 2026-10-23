-- Checks for 20261030600000_class_end_report.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/class_end_report.sql

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

-- Seed: Amy teaches class A; Crystal is Ali's Learning Consultant; Ben is the
-- PIC of the lead that became Siti; Kai comes but never answers; Lily is absent.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000e1'),  -- admin
  ('00000000-0000-0000-0000-0000000000e2'),  -- teacher Amy
  ('00000000-0000-0000-0000-0000000000e3'),  -- consultant Crystal
  ('00000000-0000-0000-0000-0000000000e4'),  -- staff Ben (no ticks)
  ('00000000-0000-0000-0000-0000000000f1'),  -- student Ali
  ('00000000-0000-0000-0000-0000000000f2');  -- student Siti

insert into public.teachers (id, auth_user_id, username, full_name, role) overriding system value values
  (9871, '00000000-0000-0000-0000-0000000000e1', 'cr_admin', 'Admin', 'admin'),
  (9872, '00000000-0000-0000-0000-0000000000e2', 'cr_amy', 'Amy', 'teacher'),
  (9873, '00000000-0000-0000-0000-0000000000e3', 'cr_crystal', 'Crystal', 'staff'),
  (9874, '00000000-0000-0000-0000-0000000000e4', 'cr_ben', 'Ben', 'staff'),
  (9875, null, 'cr_joe', 'Joe', 'teacher');

insert into public.classrooms (id, name, age_group, program_level, teacher_id) overriding system value values
  (9881, 'Y5 BM', '9-11 Years Old', 'Coder Foundation', 9872);

insert into public.schedules (id, teacher_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, classroom_id)
  overriding system value values
  (9891, 9872, 'Y5 BM weekly', 'regular', 'weekly', 2, '19:00', '20:00', '2026-09-01', 9881);

insert into public.students (id, full_name, student_code, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, classroom_id, teacher_id, consultant_id)
  overriding system value values
  (9901, 'Ali', 'S9901', 8, '2030-01-01', '2030-01-01', '2030-01-01', 9881, 9872, 9873),
  (9902, 'Siti', 'S9902', 8, '2030-01-01', '2030-01-01', '2030-01-01', 9881, 9872, null),
  (9903, 'Kai', 'S9903', 8, '2030-01-01', '2030-01-01', '2030-01-01', 9881, 9872, null),
  (9904, 'Lily', 'S9904', 8, '2030-01-01', '2030-01-01', '2030-01-01', 9881, 9872, null);
update public.student_classroom_periods set start_date = '2026-09-01' where student_id between 9901 and 9904;

update public.students set auth_user_id = '00000000-0000-0000-0000-0000000000f1' where id = 9901;
update public.students set auth_user_id = '00000000-0000-0000-0000-0000000000f2' where id = 9902;
insert into public.portal_accounts (auth_user_id, username, kind, student_id, parent_person_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'cr.ali', 'student', 9901, null),
  ('00000000-0000-0000-0000-0000000000f2', 'cr.siti', 'student', 9902, null);

-- Siti came from a lead whose PIC is Ben.
insert into public.lead_options (id, kind, label, teacher_id) overriding system value values (9921, 'pic', 'Ben', 9874);
insert into public.leads (id, full_name, phone, status, pic_id, converted_student_id) overriding system value values
  (9931, 'Siti mum', '60100009931', 'converted', 9921, 9902);

-- The lesson: 2026-10-20 19:00-20:00 Malaysia (11:00-12:00 UTC), started and ended on time.
insert into public.class_sessions (id, schedule_id, lesson_date, classroom_id, teacher_id, starts_at, ends_at, status, started_at, ended_at)
  overriding system value values
  (9941, 9891, '2026-10-20', 9881, 9872, '2026-10-20 11:00+00', '2026-10-20 12:00+00', 'ended', '2026-10-20 11:00+00', '2026-10-20 12:00+00'),
  (9942, 9891, '2026-10-27', 9881, 9872, '2026-10-27 11:00+00', '2026-10-27 12:00+00', 'live', '2026-10-27 11:00+00', null);
insert into public.class_session_zoom (session_id, meeting_id, join_url) values (9941, '99410', 'https://zoom.example/j/99410');

insert into public.zoom_participation (session_id, student_id, participant_uuid, user_name, joined_at, left_at) values
  -- Ali: 5 min late, away 11:20-11:30, back to the end (two joins overlap once).
  (9941, 9901, 'ali-1', 'Ali', '2026-10-20 11:05+00', '2026-10-20 11:20+00'),
  (9941, 9901, 'ali-2', 'Ali', '2026-10-20 11:30+00', '2026-10-20 12:00+00'),
  (9941, 9901, 'ali-3', 'Ali', '2026-10-20 11:40+00', '2026-10-20 11:50+00'),
  -- Siti: on time, leaves 10 minutes early.
  (9941, 9902, 'siti-1', 'Siti', '2026-10-20 11:00+00', '2026-10-20 11:50+00'),
  -- Kai: early and to the end, but silent.
  (9941, 9903, 'kai-1', 'Kai', '2026-10-20 10:55+00', '2026-10-20 12:00+00');

insert into public.live_questions (id, session_id, position, kind, prompt, options, points, time_limit_seconds, scoring, status, opened_at, closes_at, closed_at, revealed_at)
  overriding system value values
  (9951, 9941, 1, 'choice', 'Apa warna langit?', '[{"text":"Merah"},{"text":"Biru"}]', 5, 30, 'fixed', 'closed', '2026-10-20 11:10+00', '2026-10-20 11:10:30+00', '2026-10-20 11:10:30+00', '2026-10-20 11:11+00'),
  (9952, 9941, 2, 'choice', 'Merah means?', '[{"text":"Red"},{"text":"Blue"}]', 5, 30, 'fixed', 'closed', '2026-10-20 11:40+00', '2026-10-20 11:40:30+00', '2026-10-20 11:40:30+00', '2026-10-20 11:41+00');
insert into public.live_question_keys (live_question_id, correct_options) values (9951, '{1}'), (9952, '{0}');
insert into public.live_answers (live_question_id, session_id, student_id, answered_by, answer_choices, seconds_taken, points_if_correct, result, points) values
  (9951, 9941, 9901, 'student', '{1}', 4, 5, 'correct', 5),
  (9952, 9941, 9901, 'student', '{1}', 6, 5, 'wrong', 0),
  (9951, 9941, 9902, 'student', '{0}', 5, 5, 'wrong', 0),
  (9952, 9941, 9902, 'student', '{0}', 7, 5, 'correct', 5);
insert into public.student_points (student_id, points, kind, reason, schedule_id, lesson_date) values
  (9901, 7, 'award', 'Great answer', 9891, '2026-10-20'),
  (9902, 3, 'award', 'Helping others', 9891, '2026-10-20');

-- 1. The teacher picks Siti in class ------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e4');
set local role authenticated;
select pg_temp.fails($$select public.record_class_pick(9941, 9902)$$, 'only the class', 'staff without the class cannot record a pick');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select pg_temp.ok(public.record_class_pick(9941, 9902) is not null, 'the teacher records a pick');

-- 2. Each child's record -------------------------------------------------------
select pg_temp.ok((select count(*) from public.lesson_student_records(9941)) = 4, 'the whole roster: Ali, Siti, Kai and absent Lily');
select pg_temp.ok((
  select zoom_minutes = 45 and participation_percent = 75 and late_minutes = 5 and left_early_minutes = 0
  from public.lesson_student_records(9941, 9901)), 'Ali: 45 minutes (overlap counted once), 75%, 5 late');
select pg_temp.ok((
  select jsonb_path_exists(left_periods, '$[*] ? (@.kind == "away")') and jsonb_path_exists(left_periods, '$[*] ? (@.kind == "late")')
    and jsonb_array_length(online_spans) = 2
  from public.lesson_student_records(9941, 9901)), 'Ali: late and away periods, two online spans');
select pg_temp.ok((
  select left_early_minutes = 10 and picked_count = 1 and correct = 1 and wrong = 1 and not is_silent and points = 3
  from public.lesson_student_records(9941, 9902)), 'Siti: left 10 early, picked once, 1 right 1 wrong, 3 award points');
select pg_temp.ok((select is_silent and zoom_minutes = 60 and answered = 0 from public.lesson_student_records(9941, 9903)),
  'Kai: in Zoom all lesson, no answer, never picked = silent');
select pg_temp.ok((select zoom_minutes = 0 and not is_silent and participation_percent = 0 from public.lesson_student_records(9941, 9904)),
  'Lily: absent, not silent');
select pg_temp.ok((select count(*) from public.student_lesson_answers where student_id = 9903 and result = 'unanswered') = 2,
  'the answers view gives Kai two unanswered rows');
select pg_temp.ok((select count(*) from public.student_lesson_history(9901)) >= 1, 'the student history lists the lesson');
reset role;

-- 3. Who sees what -------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e4');
set local role authenticated;
select pg_temp.ok((select count(*) from public.student_lesson_records where session_id = 9941) = 0, 'staff without the class sees nothing');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e3');
set local role authenticated;
select pg_temp.ok((select array_agg(student_id) from public.student_lesson_records where session_id = 9941) = array[9901]::bigint[],
  'the Learning Consultant sees only her own student');
reset role;

-- 4. Handled by and "needs care" notes ----------------------------------------
select pg_temp.ok(public.student_handled_by(9901) = 9873, 'Ali: his Learning Consultant');
select pg_temp.ok(public.student_handled_by(9902) = 9874, 'Siti: no consultant, so the PIC of her lead');
select pg_temp.ok(public.student_handled_by(9903) is null, 'Kai: nobody');

select pg_temp.login('00000000-0000-0000-0000-0000000000e4');
set local role authenticated;
select pg_temp.fails($$select public.send_lesson_care_notes(9941, '[{"student_id": 9901, "note": "x"}]')$$, 'only the class', 'others cannot send notes');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select pg_temp.ok((
  select r = '{"sent": 2, "no_handler": [9903]}'::jsonb
  from (select public.send_lesson_care_notes(9941, '[{"student_id": 9901, "note": "Away 10 minutes"}, {"student_id": 9902, "note": "Left early"}, {"student_id": 9903, "note": "Silent"}]') as r) x
), 'two notes sent; Kai has no Handled by');
reset role;
select pg_temp.ok((select class_session_id = 9941 and body = 'Away 10 minutes' and title like 'S9901 · Ali needs care%' from public.staff_notifications where teacher_id = 9873),
  'the note reaches Crystal with the lesson');

-- 5. The core for the automations, and who taught ----------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select pg_temp.fails($$select * from automation.lesson_student_records_core(9941)$$, 'permission denied', 'a login cannot call the unfiltered core');
reset role;
select pg_temp.login(null);
select pg_temp.ok((select count(*) from automation.lesson_student_records_core(9941)) = 4, 'the database itself reads all four children with nobody signed in');
select pg_temp.ok((select bool_and(teacher_id = 9872 and class_teacher_id = 9872) from automation.lesson_student_records_core(9941)), 'the teacher who taught is the lesson''s teacher');
insert into public.lesson_substitutes (schedule_id, lesson_date, teacher_id) values (9891, '2026-10-20', 9875);
select pg_temp.ok((select bool_and(teacher_id = 9875 and class_teacher_id = 9872) from automation.lesson_student_records_core(9941)), 'with a substitute, teacher_id is the substitute');
delete from public.lesson_substitutes where schedule_id = 9891;

-- 6. The student app -------------------------------------------------------------
update public.app_settings set value = jsonb_set(jsonb_set(coalesce(value, '{}'::jsonb), '{student_sees}', '{"points": true, "scores": true}'), '{parent_sees}', '{"points": true, "scores": true}')
where key = 'student_portal';
insert into public.app_settings (key, value) values ('student_portal', '{"student_sees": {"points": true, "scores": true}, "parent_sees": {"points": true, "scores": true}}')
on conflict (key) do nothing;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
set local role authenticated;
select pg_temp.ok((
  select (r ->> 'right')::integer = 1 and (r ->> 'questions')::integer = 2
    and (r ->> 'points')::integer = 7 and (r ->> 'place')::integer = 1 and (r ->> 'late_minutes')::integer = 5
    and (r ->> 'attendance_sent')::boolean = false
  from (select public.portal_lesson_report(9901, 9941) as r) x
), 'Ali''s report: 1 of 2 right, 7 points, first place, 5 late, attendance not sent yet');
select pg_temp.ok(public.portal_lesson_report(9901, 9942) is null, 'no report while the lesson is still live');
select pg_temp.fails($$select public.portal_lesson_report(9902, 9941)$$, 'not found', 'Ali cannot read Siti''s report');

select pg_temp.ok((select jsonb_agg(x -> 'session_id') from jsonb_array_elements(public.portal_unseen_lesson_reports(9901)) x) = '[9941]'::jsonb,
  'the ended lesson waits to be shown');
select public.portal_mark_report_seen(9901, 9941);
select pg_temp.ok(public.portal_unseen_lesson_reports(9901) = '[]'::jsonb, 'shown once');

select pg_temp.ok((
  select jsonb_array_length(h) = 1 and jsonb_array_length(h -> 0 -> 'questions') = 2
    and h -> 0 -> 'questions' -> 1 ->> 'result' = 'wrong' and h -> 0 -> 'questions' -> 0 -> 'correct_options' = '[1]'::jsonb
  from (select public.portal_class_question_history(9901, 9881) as h) x
), 'the Room lists the lesson''s questions with Ali''s answers');
reset role;

-- The teacher sends the attendance later: the report comes back once, marked updated.
update public.class_report_seen set seen_at = seen_at - interval '1 minute' where student_id = 9901;
insert into public.lesson_logs (schedule_id, teacher_id, lesson_date, lesson_remark) values (9891, 9872, '2026-10-20', 'Good work today');
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
set local role authenticated;
select pg_temp.ok((select (x ->> 'updated')::boolean from jsonb_array_elements(public.portal_unseen_lesson_reports(9901)) x) = true,
  'after the attendance the report shows again, marked updated');
select pg_temp.ok((public.portal_lesson_report(9901, 9941) -> 'teacher_words') = '["Good work today"]'::jsonb,
  'the teacher''s words appear');
reset role;

rollback;
