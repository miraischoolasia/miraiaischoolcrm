-- Checks for 20261102100000_grade_instead_of_age.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/grade_instead_of_age.sql

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

-- The grade goes up by one each 1 January and stops at 12 (left school).
select pg_temp.ok(public.grade_now(4::smallint, 2026::smallint, date '2026-10-23') = 4, 'same year: unchanged');
select pg_temp.ok(public.grade_now(4::smallint, 2026::smallint, date '2026-12-31') = 4, '31 December: still the same');
select pg_temp.ok(public.grade_now(4::smallint, 2026::smallint, date '2027-01-01') = 5, '1 January: one more');
select pg_temp.ok(public.grade_now(6::smallint, 2026::smallint, date '2027-01-01') = 7, 'Year 6 becomes Form 1');
select pg_temp.ok(public.grade_now(11::smallint, 2026::smallint, date '2027-06-01') = 12, 'Form 5 becomes left school');
select pg_temp.ok(public.grade_now(11::smallint, 2026::smallint, date '2030-06-01') = 12, 'it stops at left school');
select pg_temp.ok(public.grade_now(4::smallint, 2026::smallint, date '2025-06-01') = 4, 'a date before the year does not go down');
select pg_temp.ok(public.grade_now(null, null) is null, 'no grade: null');
select pg_temp.ok(public.grade_now(3::smallint, 2026::smallint) is not null, 'today by default');

-- The setting.
select pg_temp.ok((select value ->> 'mode' from public.app_settings where key = 'age_display') = 'age', 'the default is age');

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2');
insert into public.teachers (id, auth_user_id, username, full_name, role) overriding system value
values (99971, '00000000-0000-0000-0000-0000000000d1', 'grade_admin', 'Grade Admin', 'admin'),
       (99972, '00000000-0000-0000-0000-0000000000d2', 'grade_teacher', 'Grade Teacher', 'teacher');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select public.set_age_display('grade');
select pg_temp.ok((select value ->> 'mode' from public.app_settings where key = 'age_display') = 'grade', 'an admin switches to grade');
select public.set_age_display('age');
select pg_temp.ok((select value ->> 'mode' from public.app_settings where key = 'age_display') = 'age', '...and back');

do $$
begin
  begin
    perform public.set_age_display('years');
    raise exception 'FAIL a wrong mode was accepted';
  exception when others then
    if sqlerrm = 'Choose age or grade.' then null; else raise; end if;
  end;
end;
$$;
select pg_temp.ok(true, 'a wrong mode is refused');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.set_age_display('grade');
    raise exception 'FAIL a teacher changed the setting';
  exception when others then
    if sqlerrm = 'Only admin can change how ages are shown.' then null; else raise; end if;
  end;
end;
$$;
select pg_temp.ok((select value ->> 'mode' from public.app_settings where key = 'age_display') = 'age', 'a teacher cannot change it');

-- The columns: both or none, within range.
insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, grade_level, grade_year)
  overriding system value values (99901, 'Grade Kid', 0, '2099-12-31', '2099-12-31', '2099-12-31', 4, 2026);
select pg_temp.ok((select grade_level from public.students where id = 99901) = 4, 'a student keeps a grade');
do $$
begin
  begin
    insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, grade_level)
      overriding system value values (99902, 'Half Grade', 0, '2099-12-31', '2099-12-31', '2099-12-31', 4);
    raise exception 'FAIL a grade without its year was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, grade_level, grade_year)
      overriding system value values (99903, 'Big Grade', 0, '2099-12-31', '2099-12-31', '2099-12-31', 13, 2026);
    raise exception 'FAIL grade 13 was accepted';
  exception when check_violation then null;
  end;
end;
$$;
select pg_temp.ok(true, 'a grade needs its year, and stays within 1 to 12');

-- A trial booking keeps a grade too, written after book_trial_slot (admin only).
insert into public.classrooms (id, name, age_group, program_level, teacher_id, category)
overriding system value values (99951, 'Grade Trial', '9-11 Years Old', 'Coder Foundation', 99972, 'trial');
insert into public.schedules (id, teacher_id, classroom_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, end_recur, status)
overriding system value values (99951, 99972, 99951, 'Grade slot', 'regular', 'weekly', 4, '17:00', '19:00', current_date - 20, null, 'active');
insert into public.trial_bookings (id, schedule_id, booking_date, child_name, child_age)
overriding system value values (99951, 99951, current_date + 10, 'Grade Booked', 7);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select public.set_trial_booking_grade(99951, 3::smallint, 2026::smallint);
select pg_temp.ok((select grade_level from public.trial_bookings where id = 99951) = 3
  and (select grade_year from public.trial_bookings where id = 99951) = 2026, 'an admin sets the grade on a trial booking');
select public.set_trial_booking_grade(99951, null, null);
select pg_temp.ok((select grade_level is null and grade_year is null from public.trial_bookings where id = 99951), '...and clears it');
do $$
begin
  begin
    perform public.set_trial_booking_grade(99951, 13::smallint, 2026::smallint);
    raise exception 'FAIL grade 13 on a booking';
  exception when others then
    if sqlerrm = 'A grade is 1 to 12 and needs its year.' then null; else raise; end if;
  end;
  begin
    perform public.set_trial_booking_grade(99951, 3::smallint, null);
    raise exception 'FAIL a booking grade without a year';
  exception when others then
    if sqlerrm = 'A grade is 1 to 12 and needs its year.' then null; else raise; end if;
  end;
end;
$$;
select pg_temp.ok(true, 'a booking grade needs 1 to 12 and its year');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.set_trial_booking_grade(99951, 3::smallint, 2026::smallint);
    raise exception 'FAIL a teacher set a booking grade';
  exception when others then
    if sqlerrm = 'Only admins can book a trial class.' then null; else raise; end if;
  end;
end;
$$;
select pg_temp.ok(true, 'a teacher cannot set a booking grade');

rollback;
