-- Checks for 20261102200000_lesson_seats.sql: Change Class and Replacement.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/lesson_seats.sql

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

create function pg_temp.on_roster(p_classroom bigint, p_date date, p_student bigint) returns boolean language sql as $$
  select exists (select 1 from public.classroom_roster_on(p_classroom, p_date) r where r = p_student);
$$;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2');
insert into public.teachers (id, auth_user_id, username, full_name, role) overriding system value
values (99981, '00000000-0000-0000-0000-0000000000d1', 'seat_admin', 'Seat Admin', 'admin'),
       (99982, '00000000-0000-0000-0000-0000000000d2', 'seat_teacher', 'Seat Teacher', 'teacher');

insert into public.classrooms (id, name, age_group, program_level, teacher_id, status, category) overriding system value
values (99991, 'Seat Class A', '6-8 Years Old', 'Coder Foundation', 99981, 'active', 'regular'),
       (99992, 'Seat Class B', '6-8 Years Old', 'Coder Foundation', 99981, 'active', 'regular');

-- Days: the next Monday and Tuesday at least a week away (days 1 to 28 of a month, so the 29th-31st rule stays out of it),
-- and a Monday in the past; the class A lesson that meets today.
select (current_date + 8 + ((8 - extract(dow from current_date + 8)::int) % 7)) as mon \gset
select (current_date + 9 + ((9 - extract(dow from current_date + 9)::int) % 7)) as tue \gset
select (current_date - 7 - ((extract(dow from current_date - 7)::int + 6) % 7)) as pastmon \gset
select extract(dow from current_date)::smallint as today_dow \gset

-- A meets on Mondays; B on Tuesdays; C (class A, a second schedule) meets today's weekday.
insert into public.schedules (id, teacher_id, classroom_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, status)
overriding system value
values (99991, 99981, 99991, 'Seat A Monday', 'regular', 'weekly', 1, '10:00', '11:00', current_date - 90, 'active'),
       (99992, 99981, 99992, 'Seat B Tuesday', 'regular', 'weekly', 2, '12:00', '13:00', current_date - 90, 'active'),
       (99993, 99981, 99991, 'Seat A today', 'regular', 'weekly', :today_dow, '15:00', '16:00', current_date - 90, 'active');

insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, student_type, classroom_id)
overriding system value values
  (99961, 'Seat Kid', 12, '2099-12-31', '2099-12-31', '2099-12-31', 'regular', 99991),
  (99962, 'Seat Friend', 12, '2099-12-31', '2099-12-31', '2099-12-31', 'regular', 99992);
update public.student_classroom_periods set start_date = current_date - 80 where student_id in (99961, 99962);

-- ---------------------------------------------------------------------------------------------
-- Before any seat: the class history as it was
-- ---------------------------------------------------------------------------------------------
select pg_temp.ok(pg_temp.on_roster(99991, :'mon'::date, 99961), 'in his own class on its day');
select pg_temp.ok(not pg_temp.on_roster(99992, :'tue'::date, 99961), 'not in the other class');
select pg_temp.ok(public.is_in_classroom_on(99961, 99991, :'mon'::date), 'is_in_classroom_on agrees');

-- ---------------------------------------------------------------------------------------------
-- Change class (before the lesson)
-- ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select public.book_lesson_seat(99961, 'change', 99991, :'mon'::date, 99992, :'tue'::date, 'swim meet') as seat1 \gset
select pg_temp.ok(:seat1 > 0, 'a change is booked');
select pg_temp.ok(not pg_temp.on_roster(99991, :'mon'::date, 99961), 'change: out of the old lesson that day');
select pg_temp.ok(pg_temp.on_roster(99992, :'tue'::date, 99961), 'change: in the new lesson');
select pg_temp.ok(not public.is_in_classroom_on(99961, 99991, :'mon'::date) and public.is_in_classroom_on(99961, 99992, :'tue'::date),
  'change: is_in_classroom_on agrees');
select pg_temp.ok(pg_temp.on_roster(99991, :'mon'::date + 7, 99961), 'change: the next Monday is unaffected');
select pg_temp.ok(not pg_temp.on_roster(99992, :'tue'::date + 7, 99961), 'change: the next Tuesday is unaffected');
select pg_temp.ok(pg_temp.on_roster(99992, :'tue'::date, 99962), 'change: the other class keeps its own child');
select pg_temp.ok((select count(*) from public.admin_activity_logs where action_type = 'lesson_seat_booked' and entity_id = 99961) = 1, 'an activity line');

select pg_temp.fails(format($$select public.book_lesson_seat(99961, 'change', 99991, %L, 99992, %L)$$, :'mon'::date, :'tue'::date + 7),
  'not in that class|already|unique|duplicate', 'the same old lesson cannot be changed twice');
select pg_temp.fails(format($$select public.book_lesson_seat(99961, 'change', 99991, %L, 99992, %L)$$, :'mon'::date + 7, :'tue'::date),
  'already in that lesson', 'cannot sit twice in one lesson');
select pg_temp.fails(format($$select public.book_lesson_seat(99961, 'change', 99991, %L, 99992, %L)$$, :'mon'::date + 7, :'mon'::date + 2),
  'no lesson on that day', 'the other class must have a lesson that day');
select pg_temp.fails(format($$select public.book_lesson_seat(99961, 'change', 99991, %L, 99992, %L)$$, :'pastmon'::date, :'tue'::date),
  'has passed', 'a lesson that has passed cannot be changed');
select pg_temp.fails(format($$select public.book_lesson_seat(99961, 'change', 99992, %L, 99991, %L)$$, :'tue'::date, :'mon'::date),
  'not in that class', 'only a lesson of his own class');

-- Attendance already taken today in his own class: cannot be changed.
insert into public.lesson_logs (id, schedule_id, teacher_id, lesson_date, revision_number) overriding system value
values (99971, 99993, 99981, current_date, 1);
insert into public.lesson_log_students (lesson_log_id, student_id, attendance_status) values (99971, 99961, 'present');
select pg_temp.fails(format($$select public.book_lesson_seat(99961, 'change', 99991, %L, 99992, %L)$$, current_date, :'tue'::date + 7),
  'attendance is already taken', 'attendance taken: cannot be changed');

-- Undo.
select public.cancel_lesson_seat(:seat1);
select pg_temp.ok(pg_temp.on_roster(99991, :'mon'::date, 99961) and not pg_temp.on_roster(99992, :'tue'::date, 99961), 'undo: back as it was');
select pg_temp.ok((select count(*) from public.admin_activity_logs where action_type = 'lesson_seat_cancelled' and entity_id = 99961) = 1, '...with an activity line');

-- ---------------------------------------------------------------------------------------------
-- Replacement (after the lesson)
-- ---------------------------------------------------------------------------------------------
select public.book_lesson_seat(99961, 'replacement', 99991, :'pastmon'::date, 99992, :'tue'::date) as seat2 \gset
select pg_temp.ok(pg_temp.on_roster(99991, :'pastmon'::date, 99961), 'replacement: the old lesson keeps him');
select pg_temp.ok(pg_temp.on_roster(99992, :'tue'::date, 99961), 'replacement: he sits in the new lesson');
select pg_temp.fails(format($$select public.book_lesson_seat(99961, 'replacement', 99991, %L, 99992, %L)$$, :'pastmon'::date, :'tue'::date + 7),
  'duplicate|unique', 'a missed lesson is replaced once');
select pg_temp.fails(format($$select public.book_lesson_seat(99961, 'replacement', 99991, %L, 99992, %L)$$, :'mon'::date, :'tue'::date + 7),
  'already passed', 'a replacement is for a lesson that has passed');
select pg_temp.fails(format($$select public.book_lesson_seat(99961, 'replacement', 99991, %L, 99992, %L)$$, :'pastmon'::date - 7, :'tue'::date - 14),
  'cannot be in the past', 'the new lesson cannot be in the past');
select pg_temp.fails(format($$select public.book_lesson_seat(99961, 'bogus', 99991, %L, 99992, %L)$$, :'pastmon'::date, :'tue'::date),
  'Change class or Replacement', 'only the two kinds');
select public.cancel_lesson_seat(:seat2);
select pg_temp.ok(not pg_temp.on_roster(99992, :'tue'::date, 99961), 'replacement undone');

-- ---------------------------------------------------------------------------------------------
-- Hours: a replacement lesson takes no lesson from the package; a changed lesson is taken as usual (owner 2026-10-23)
-- ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, student_type, classroom_id)
overriding system value values
  (99963, 'Seat Replaced', 12, '2099-12-31', '2099-12-31', '2099-12-31', 'regular', 99992),
  (99964, 'Seat Changed', 12, '2099-12-31', '2099-12-31', '2099-12-31', 'regular', 99992);
update public.student_classroom_periods set start_date = current_date - 80 where student_id in (99963, 99964);
select (current_date - 6 - ((extract(dow from current_date - 6)::int + 5) % 7)) as pasttue \gset
select public.book_lesson_seat(99963, 'replacement', 99992, :'pasttue'::date, 99991, current_date) as seat3 \gset
select public.book_lesson_seat(99964, 'change', 99992, :'tue'::date, 99991, current_date) as seat4 \gset
delete from public.lesson_log_students where lesson_log_id = 99971;
delete from public.lesson_logs where id = 99971;
select * from public.submit_lesson_attendance(
  99993, current_date, null,
  '[{"student_id": 99961, "status": "present"}, {"student_id": 99963, "status": "present"}, {"student_id": 99964, "status": "present"}]'::jsonb,
  '[{"student_id": 99961, "logicalThinkingScore": 4, "codingCreativityScore": 4, "problemSolvingScore": 4, "expressivenessScore": 4, "sustainedFocusScore": 4}, {"student_id": 99963, "logicalThinkingScore": 4, "codingCreativityScore": 4, "problemSolvingScore": 4, "expressivenessScore": 4, "sustainedFocusScore": 4}, {"student_id": 99964, "logicalThinkingScore": 4, "codingCreativityScore": 4, "problemSolvingScore": 4, "expressivenessScore": 4, "sustainedFocusScore": 4}]'::jsonb
);
select pg_temp.ok((select remaining_hours from public.students where id = 99963) = 12, 'replacement: present takes no lesson');
select pg_temp.ok((select remaining_hours from public.students where id = 99964) = 11, 'change class: present takes one lesson as usual');
select pg_temp.fails(format($$select public.cancel_lesson_seat(%s)$$, :seat3), 'Attendance is already taken', 'a seat with attendance cannot be undone');

-- ---------------------------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
select pg_temp.fails(format($$select public.book_lesson_seat(99961, 'change', 99991, %L, 99992, %L)$$, :'mon'::date, :'tue'::date),
  'not allowed', 'a teacher without Students edit cannot book');

rollback;
