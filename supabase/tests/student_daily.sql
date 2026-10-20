-- Checks for 20261027100000_student_daily.sql (daily check-in, tasks, practice).
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/student_daily.sql
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
  ('00000000-0000-0000-0000-00000000000b'),  -- teacher Amy
  ('00000000-0000-0000-0000-0000000000a1'),  -- student Ali (in the class)
  ('00000000-0000-0000-0000-0000000000a2');  -- student Siti (other class)

insert into public.teachers (id, auth_user_id, username, full_name, role) overriding system value values
  (9001, '00000000-0000-0000-0000-00000000000a', 't_admin', 'Admin', 'admin'),
  (9002, '00000000-0000-0000-0000-00000000000b', 't_amy', 'Amy', 'teacher');

insert into public.classrooms (id, name, age_group, program_level, teacher_id) overriding system value values
  (9101, 'Test Class A', '9-11 Years Old', 'Coder Foundation', 9002),
  (9102, 'Test Class B', '9-11 Years Old', 'Coder Foundation', 9002);

insert into public.schedules (id, teacher_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, classroom_id)
  overriding system value values
  (9201, 9002, 'Class A weekly', 'regular', 'weekly', extract(dow from public.daily_today() - 7)::integer, '15:00', '16:00', public.daily_today() - 60, 9101);

insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, classroom_id, teacher_id)
  overriding system value values
  (9301, 'Ali', 8, '2030-01-01', '2030-01-01', '2030-01-01', 9101, 9002),
  (9302, 'Siti', 8, '2030-01-01', '2030-01-01', '2030-01-01', 9102, 9002);
update public.student_classroom_periods set start_date = public.daily_today() - 60 where student_id in (9301, 9302);
insert into public.student_classroom_periods (student_id, classroom_id, start_date)
select v.s, v.c, public.daily_today() - 60 from (values (9301, 9101), (9302, 9102)) v(s, c)
where not exists (select 1 from public.student_classroom_periods p where p.student_id = v.s);

update public.students set auth_user_id = '00000000-0000-0000-0000-0000000000a1' where id = 9301;
update public.students set auth_user_id = '00000000-0000-0000-0000-0000000000a2' where id = 9302;
insert into public.portal_accounts (auth_user_id, username, kind, student_id, parent_person_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'ali.tan', 'student', 9301, null),
  ('00000000-0000-0000-0000-0000000000a2', 'siti.lim', 'student', 9302, null);

-- Last week's lesson with its questions: a choice and a fill-in (closed, with
-- answers), a short answer (not for practice) and a question still live.
insert into public.class_sessions (id, schedule_id, lesson_date, classroom_id, teacher_id, starts_at, ends_at, status)
  overriding system value values
  (9401, 9201, public.daily_today() - 7, 9101, 9002, now() - interval '7 days', now() - interval '7 days' + interval '1 hour', 'ended');
insert into public.live_questions (id, session_id, position, kind, prompt, options, points, time_limit_seconds, scoring, status, opened_at, closes_at, closed_at)
  overriding system value values
  (9501, 9401, 1, 'choice', 'Apa warna langit?', '[{"text":"Merah"},{"text":"Biru"},{"text":"Hijau"}]', 5, 30, 'fixed', 'closed', now() - interval '7 days', now() - interval '7 days' + interval '30 seconds', now() - interval '7 days'),
  (9502, 9401, 2, 'fill', 'Red in Malay is ___', '[]', 5, 30, 'fixed', 'closed', now() - interval '7 days', now() - interval '7 days' + interval '30 seconds', now() - interval '7 days'),
  (9503, 9401, 3, 'short', 'Write a sentence', '[]', 5, 30, 'fixed', 'closed', now() - interval '7 days', now() - interval '7 days' + interval '30 seconds', now() - interval '7 days'),
  (9504, 9401, 4, 'choice', 'Still open', '[{"text":"A"},{"text":"B"}]', 5, 30, 'fixed', 'live', now() - interval '10 seconds', now() + interval '20 seconds', null);
insert into public.live_question_keys (live_question_id, correct_options, accepted_answers, explanation) values
  (9501, '{1}', '[]', 'The sky is blue.'),
  (9502, '{}', '[{"text":"merah","match":"exact"}]', null),
  (9503, '{}', '[]', null),
  (9504, '{0}', '[]', null);

-- The practice task's id, for the checks run as the child (who cannot read the table).
create temp table practice_task as select id from public.daily_tasks where kind = 'practice';
grant select on practice_task to authenticated;

-- Ali today --------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;

select pg_temp.ok((public.portal_daily(9301) -> 'checkin' ->> 'done')::boolean = false, 'not checked in yet');
select pg_temp.ok(jsonb_array_length(public.portal_daily(9301) -> 'tasks') = 3, 'three default tasks');
select pg_temp.ok((public.portal_daily(9301) -> 'practice' ->> 'has_questions')::boolean, 'practice has questions');
select pg_temp.fails($$select * from public.practice_pool(9301)$$, 'permission denied', 'the app cannot read the question pool directly');
reset role;
select pg_temp.ok((select count(*) from public.practice_pool(9301)) = 2, 'only the closed choice and fill-in questions are practice');
set local role authenticated;
select pg_temp.fails($$select public.portal_daily(9302)$$, 'not found', 'a child cannot read another child');

select pg_temp.ok((public.portal_check_in(9301) ->> 'coins')::integer = 2, 'check-in pays the default 2 coins');
select pg_temp.fails($$select public.portal_check_in(9301)$$, 'already checked in', 'only once a day');
select pg_temp.ok((public.portal_daily(9301) -> 'checkin' ->> 'streak')::integer = 1, 'a one-day streak');

select pg_temp.fails(
  $$select public.portal_claim_task(9301, (select id from pg_temp.practice_task))$$,
  'finish the task first', 'a task pays only when done');

select pg_temp.ok(((public.portal_practice_next(9301) -> 'question' ->> 'id')::bigint) in (9501, 9502), 'next practice question is one of the two');
select pg_temp.ok((public.portal_practice_answer(9301, 9501, '{"choices":[0]}') ->> 'correct')::boolean = false, 'a wrong choice is wrong');
select pg_temp.ok((public.portal_practice_answer(9301, 9502, '{"text":"  Merah "}') ->> 'coins')::integer = 1, 'a right fill-in pays 1 coin');
select pg_temp.fails($$select public.portal_practice_answer(9301, 9501, '{"choices":[1]}')$$, 'already did', 'a question once a day');
select pg_temp.fails($$select public.portal_practice_answer(9301, 9503, '{"text":"x"}')$$, 'not found', 'a short answer is not practice');
select pg_temp.fails($$select public.portal_practice_answer(9301, 9504, '{"choices":[0]}')$$, 'not found', 'a live question is not practice yet');
select pg_temp.ok((public.portal_practice_next(9301) -> 'question') = 'null'::jsonb, 'no more practice today when all are done');
select pg_temp.fails($$select public.set_student_daily_settings('{}')$$, 'only staff', 'a child cannot change the settings');

-- The admin lowers the practice task to 2 questions.
reset role;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
set local role authenticated;
select pg_temp.ok(
  public.save_daily_task((select id from pg_temp.practice_task), 'Do 2 practice questions', 'practice', 2, 4, true, null) is not null,
  'admin changes a task');
select pg_temp.fails($$select public.save_daily_task(null, '', 'video', 1, 1)$$, 'give the task a name', 'a task needs a name');
select pg_temp.fails($$select public.save_daily_task(null, 'x', 'homework', 1, 1)$$, 'what the task counts', 'only known kinds');
select pg_temp.fails($$select public.set_student_daily_settings('{"checkin_enabled": true}')$$, 'not valid', 'settings must be complete');
select public.set_student_daily_settings('{"checkin_enabled": true, "checkin_coins": 5, "tasks_enabled": true, "practice_enabled": true, "practice_per_day": 5, "practice_coins": 2}');
select pg_temp.ok((public.student_daily_settings() -> 'settings' ->> 'checkin_coins')::integer = 5, 'admin saves the settings');

reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select pg_temp.ok(
  (public.portal_claim_task(9301, (select id from pg_temp.practice_task)) ->> 'coins')::integer = 4,
  'the finished practice task pays its coins');
select pg_temp.fails(
  $$select public.portal_claim_task(9301, (select id from pg_temp.practice_task))$$,
  'already got', 'a task pays once a day');

reset role;
-- A live question answered right today counts for the live task.
insert into public.live_answers (live_question_id, session_id, student_id, answered_by, answer_choices, seconds_taken, points_if_correct, result)
values (9501, 9401, 9301, 'student', '{1}', 3, 5, 'correct');
select pg_temp.ok(public.daily_task_progress(9301, 'live_right', public.daily_today()) = 1, 'a right live answer counts today');
select pg_temp.ok(
  (select array_agg(kind order by kind) from public.student_points where student_id = 9301) = array['checkin', 'practice', 'task'],
  'the coins are points: check-in, practice, task');
select pg_temp.ok((select sum(points) from public.student_points where student_id = 9301) = 2 + 1 + 4, 'the points add up');
select pg_temp.ok(not exists (select 1 from public.student_points where student_id = 9302), 'nothing for the other child');

rollback;
