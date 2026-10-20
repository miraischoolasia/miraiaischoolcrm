-- Checks for 20261027600000_teacher_time_clash.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/teacher_time_clash.sql
-- The checks run at the end of a change, so each step ends with "set constraints all immediate".

begin;

create function pg_temp.fails(p_sql text, p_pattern text, p_name text) returns void language plpgsql as $$
begin
  begin
    execute 'set constraints all deferred';
    execute p_sql;
    execute 'set constraints all immediate';
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

create function pg_temp.works(p_sql text, p_name text) returns void language plpgsql as $$
begin
  execute 'set constraints all deferred';
  begin
    execute p_sql;
    execute 'set constraints all immediate';
  exception when others then
    raise exception 'FAIL % (%)', p_name, sqlerrm;
  end;
  execute 'set constraints all deferred';
  raise notice 'PASS %', p_name;
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

-- d: a Monday from tomorrow on, early enough in the month that the two Mondays after it are before the 29th.
create temp table d as
select g.day::date as mon, g.day::date + 1 as tue, g.day::date + 7 as mon2, g.day::date + 14 as mon3
from generate_series((timezone('Asia/Kuala_Lumpur', now()))::date + 1, (timezone('Asia/Kuala_Lumpur', now()))::date + 70, interval '1 day') as g(day)
where extract(dow from g.day) = 1 and extract(day from g.day) <= 14
order by g.day
limit 1;

create function pg_temp.d(p text) returns date language sql as $$
  select case p when 'mon' then mon when 'tue' then tue when 'mon2' then mon2 when 'mon3' then mon3 end from d;
$$;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000e1');
insert into public.teachers (id, auth_user_id, username, full_name, role) overriding system value values
  (9901, null, 'tc_joey', 'Ms Joey', 'teacher'),
  (9902, null, 'tc_danny', 'Mr Danny', 'teacher'),
  (9903, null, 'tc_kim', 'Ms Kim', 'teacher'),
  (9904, '00000000-0000-0000-0000-0000000000e1', 'tc_admin', 'Admin', 'admin');

insert into public.classrooms (id, name, age_group, program_level, teacher_id) overriding system value values
  (9911, 'SCI Year 5 · Ms Joey', '9-11 Years Old', 'Coder Foundation', 9901),
  (9912, 'MM Year 6 · Ms Joey', '12-14 Years Old', 'Coder Foundation', 9901),
  (9913, 'BM Year 5 · Mr Danny', '9-11 Years Old', 'Coder Foundation', 9902);

-- The lesson everything is compared with: Ms Joey, Mondays 7:00pm-8:15pm.
select pg_temp.works($q$
  insert into public.schedules (id, teacher_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, classroom_id)
  overriding system value values (99001, 9901, 'SCI Year 5', 'regular', 'weekly', 1, '19:00', '20:15', current_date - 30, 9911)
$q$, 'a weekly lesson with nothing in the way is saved');

-- 1. Weekly against weekly.
select pg_temp.fails($q$
  insert into public.schedules (teacher_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, classroom_id)
  values (9901, 'MM Year 6', 'regular', 'weekly', 1, '19:30', '20:30', current_date, 9912)
$q$, 'Time clash: Ms Joey already teaches SCI Year 5 · Ms Joey on Mon .*7:00pm-8:15pm', 'a second weekly lesson at the same time is refused, saying who, which class, which day and time');

select pg_temp.works($q$
  insert into public.schedules (id, teacher_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, classroom_id)
  overriding system value values (99002, 9901, 'MM Year 6', 'regular', 'weekly', 1, '20:15', '21:00', current_date, 9912)
$q$, 'a lesson that starts when the other ends is fine');

select pg_temp.works($q$
  insert into public.schedules (id, teacher_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, classroom_id)
  overriding system value values (99005, 9901, 'MM Year 6 Tue', 'regular', 'weekly', 2, '19:00', '20:15', current_date, 9912)
$q$, 'the same time on another weekday is fine');

-- 2. Terms: a lesson that ends before the other starts does not clash.
select pg_temp.works($q$
  insert into public.schedules (teacher_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, end_recur, classroom_id)
  values (9902, 'Term 1', 'regular', 'weekly', 3, '10:00', '11:00', current_date, current_date + 20, 9913);
  insert into public.schedules (teacher_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, classroom_id)
  values (9902, 'Term 2', 'regular', 'weekly', 3, '10:00', '11:00', current_date + 21, 9913)
$q$, 'two terms at the same time one after the other are fine');

select pg_temp.fails($q$
  insert into public.schedules (teacher_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, classroom_id)
  values (9902, 'Term 2b', 'regular', 'weekly', 3, '10:30', '11:30', current_date + 7, 9913)
$q$, 'Mr Danny already teaches', 'a term that starts while the other still runs is refused');

-- 3. One-off (added) lessons.
select pg_temp.fails(format($q$
  insert into public.schedules (teacher_id, title, event_type, recurrence_type, scheduled_date, start_time, end_time)
  values (9901, 'Extra class', 'replacement', 'none', %L, '19:30', '20:00')
$q$, pg_temp.d('mon')), 'Ms Joey already teaches SCI Year 5', 'a one-off lesson on top of a weekly one is refused');

select pg_temp.works(format($q$
  insert into public.schedule_exceptions (schedule_id, exception_date) values (99001, %L);
  insert into public.schedules (id, teacher_id, title, event_type, recurrence_type, scheduled_date, start_time, end_time)
  overriding system value values (99010, 9901, 'Extra class', 'replacement', 'none', %L, '19:30', '20:00')
$q$, pg_temp.d('mon2'), pg_temp.d('mon2')), 'a one-off lesson on a day the weekly lesson is cancelled is fine');

-- 4. Bringing the cancelled day back now clashes with the one-off lesson.
select pg_temp.fails(format($q$
  delete from public.schedule_exceptions where schedule_id = 99001 and exception_date = %L
$q$, pg_temp.d('mon2')), 'Ms Joey already teaches Extra class', 'bringing back a cancelled day that now clashes is refused');

-- 5. Dragging a lesson: the new day is added before the old one is cancelled.
select pg_temp.works(format($q$
  insert into public.schedules (teacher_id, title, event_type, recurrence_type, scheduled_date, start_time, end_time)
  values (9901, 'SCI Year 5', 'replacement', 'none', %L, '19:15', '20:15');
  insert into public.schedule_exceptions (schedule_id, exception_date) values (99001, %L)
$q$, pg_temp.d('mon'), pg_temp.d('mon')), 'moving a lesson a little later the same day is judged after the old time is cancelled');

select pg_temp.fails(format($q$
  insert into public.schedules (teacher_id, title, event_type, recurrence_type, scheduled_date, start_time, end_time)
  values (9901, 'SCI Year 5', 'replacement', 'none', %L, '19:30', '20:30');
  insert into public.schedule_exceptions (schedule_id, exception_date) values (99001, %L)
$q$, pg_temp.d('tue'), pg_temp.d('mon3')), 'Ms Joey already teaches MM Year 6 · Ms Joey on Tue', 'moving a lesson onto another of the teacher''s lessons is refused');

-- 6. Changing the time or the teacher.
select pg_temp.fails($q$ update public.schedules set start_time = '20:00' where id = 99002 $q$,
  'Ms Joey already teaches SCI Year 5', 'moving a lesson earlier into another one is refused');

select pg_temp.works($q$
  insert into public.schedules (id, teacher_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, classroom_id)
  overriding system value values (99003, 9902, 'BM Year 5', 'regular', 'weekly', 1, '19:30', '20:30', current_date, 9913)
$q$, 'another teacher at the same time is fine');

select pg_temp.fails($q$ update public.schedules set teacher_id = 9901 where id = 99003 $q$,
  'Ms Joey already teaches', 'giving a lesson to a teacher who is busy then is refused');

-- 7. Substitutes.
select pg_temp.fails(format($q$
  insert into public.lesson_substitutes (schedule_id, lesson_date, teacher_id) values (99002, %L, 9902)
$q$, pg_temp.d('mon2')), 'Mr Danny already teaches BM Year 5', 'a substitute who has their own class then is refused');

select pg_temp.works(format($q$
  insert into public.lesson_substitutes (schedule_id, lesson_date, teacher_id) values (99005, %L, 9903)
$q$, pg_temp.d('tue')), 'a free substitute is fine');

select pg_temp.works(format($q$
  insert into public.schedules (teacher_id, title, event_type, recurrence_type, scheduled_date, start_time, end_time)
  values (9901, 'Parent meeting', 'replacement', 'none', %L, '19:00', '19:30')
$q$, pg_temp.d('tue')), 'the teacher is free on a day someone else covers their lesson');

-- 8. Make-up minutes.
insert into public.makeup_plans (id, classroom_id, missed_date, missed_minutes) overriding system value
values (99050, 9911, current_date - 3, 30);

select pg_temp.fails(format($q$
  insert into public.makeup_sessions (plan_id, session_date, extra_minutes) values (99050, %L, 30)
$q$, pg_temp.d('mon3')), 'make-up minutes run into another class. .*Ms Joey already teaches MM Year 6', 'make-up minutes that run into the next lesson are refused');

-- 9. Cancelled lessons and days that are over do not count.
select pg_temp.works($q$
  insert into public.schedules (teacher_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, classroom_id, status)
  values (9901, 'Old class', 'regular', 'weekly', 1, '19:00', '20:00', current_date, 9912, 'cancelled')
$q$, 'a cancelled lesson does not clash');

select pg_temp.works($q$
  insert into public.schedules (teacher_id, title, event_type, recurrence_type, scheduled_date, start_time, end_time)
  values (9902, 'Past A', 'replacement', 'none', current_date - 2, '09:00', '10:00'),
         (9902, 'Past B', 'replacement', 'none', current_date - 2, '09:00', '10:00')
$q$, 'days that are over are not checked');

-- 10. A clash that was there before keeps working.
alter table public.schedules disable trigger schedules_teacher_clash;
insert into public.schedules (id, teacher_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, classroom_id)
overriding system value values (99004, 9901, 'Old clash', 'regular', 'weekly', 1, '19:00', '20:00', current_date, 9912);
alter table public.schedules enable trigger schedules_teacher_clash;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
select pg_temp.ok(exists (select 1 from public.current_teacher_clashes() where schedule_id = 99001 and other_schedule_id = 99004),
  'the list of clashes shows the old clash');
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.ok(not exists (select 1 from public.current_teacher_clashes()), 'the list is empty for someone who may not see the calendar');

select pg_temp.works($q$ update public.schedules set title = 'Old clash renamed', notes = 'x' where id = 99004 $q$,
  'a lesson that already clashed can still be renamed');
select pg_temp.works($q$ update public.schedules set end_time = '20:10' where id = 99004 $q$,
  'a lesson that already clashed can change its time without a new clash');
select pg_temp.works($q$ update public.schedules set end_recur = current_date + 60 where id = 99004 $q$,
  'a lesson that already clashed can be ended');
select pg_temp.fails($q$ update public.schedules set end_time = '20:30' where id = 99004 $q$,
  'Ms Joey already teaches MM Year 6', 'a lesson that already clashed cannot take on a new clash');

rollback;
