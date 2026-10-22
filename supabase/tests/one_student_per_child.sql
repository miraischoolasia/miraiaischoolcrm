-- Checks for 20261030200000_one_student_per_child.sql: booking the same child for HOA trials more than once
-- makes only one student, and cancelling one of several bookings never removes the student the others use.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/one_student_per_child.sql

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

-- An admin who is signed in, an HOA classroom with a weekly slot, a regular classroom.
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000e1');
insert into public.teachers (id, auth_user_id, username, full_name, role) overriding system value
values (99961, '00000000-0000-0000-0000-0000000000e1', 'one_student_admin', 'One Student Admin', 'admin');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

insert into public.classrooms (id, name, age_group, program_level, teacher_id, status, category) overriding system value
values (99971, 'One Student HOA', '6-8 Years Old', 'Coder Foundation', 99961, 'active', 'trial'),
       (99972, 'One Student Class', '6-8 Years Old', 'Coder Foundation', 99961, 'active', 'regular');
-- The next Monday after tomorrow.
select (current_date + 2 + ((8 - extract(dow from current_date + 2)::int) % 7)) as monday \gset
insert into public.schedules (id, teacher_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, status, classroom_id)
overriding system value
values (99981, 99961, 'One Student HOA slot', 'regular', 'weekly', 1, '10:00', '11:00', current_date - 30, 'active', 99971);

insert into public.leads (id, full_name, phone, status, children) overriding system value
values (99941, 'Parent One', '60123450941', 'new', '[]'),
       (99942, 'Parent Two', '60123450942', 'new', '[]');

-- The same child twice, on two Mondays, from the same lead.
select public.book_trial_slot(99981, :'monday'::date, 'Twice Kid', 8, '60123450941', 99941);
select public.book_trial_slot(99981, (:'monday'::date + 7), 'Twice Kid', 8, '60123450941', 99941);
select pg_temp.ok((select count(*) from public.students where full_name = 'Twice Kid') = 1, 'the same child booked twice: one student');
select pg_temp.ok((select count(distinct student_id) from public.trial_bookings where lead_id = 99941) = 1
  and (select count(*) from public.trial_bookings where lead_id = 99941) = 2, '...both bookings belong to that student');

-- Name typed with other capitals and spaces, the same lead.
select public.book_trial_slot(99981, (:'monday'::date + 14), '  TWICE   kid ', 8, '60123450941', 99941);
select pg_temp.ok((select count(*) from public.students where lower(full_name) like 'twice%kid') = 1, 'the name typed with other capitals and spaces: still one student');

-- A student that no booking points to yet (made another way) is found by name and phone.
insert into public.leads (id, full_name, phone, status, children) overriding system value values (99945, 'Parent Five', '60123450945', 'new', '[]');
insert into public.students (id, full_name, phone, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, is_active, student_type)
overriding system value values (99945, 'Phone Kid', '+60 12-345 0945', 0, current_date, current_date, current_date, true, 'trial');
select public.book_trial_slot(99981, :'monday'::date, 'phone kid', 8, '60123450945', 99945);
select pg_temp.ok((select count(*) from public.students where lower(full_name) = 'phone kid') = 1
  and (select student_id from public.trial_bookings where lead_id = 99945) = 99945, 'the same phone and name: the student already there is used');

-- Another child of the same family, and the same name from another family, are new students.
select public.book_trial_slot(99981, :'monday'::date, 'Sibling Kid', 6, '60123450941', 99941);
select pg_temp.ok((select count(*) from public.students where full_name = 'Sibling Kid') = 1
  and (select count(*) from public.students where phone = '60123450941') = 2, 'a brother or sister is a new student');
select public.book_trial_slot(99981, :'monday'::date, 'Twice Kid', 8, '60123450942', 99942);
select pg_temp.ok((select count(*) from public.students where full_name = 'Twice Kid') = 2, 'the same name from another family is a new student');

-- The child becomes regular, then books another trial: the regular student is used, no new HOA student.
select id as twice_id from public.students where full_name = 'Twice Kid' and phone = '60123450941' \gset
select public.convert_hoa_student(:twice_id, 99972, current_date, null, 0, null, null, null, null, 99941);
select public.book_trial_slot(99981, (:'monday'::date + 21), 'Twice Kid', 8, '60123450941', 99941);
select pg_temp.ok((select count(*) from public.students where full_name = 'Twice Kid' and phone = '60123450941') = 1
  and (select student_type from public.students where id = :twice_id) = 'regular', 'a regular student booking another trial stays the one student');
select pg_temp.ok((select count(*) from public.trial_bookings where student_id = :twice_id) = 4, '...with all four bookings');

-- Cancelling a booking never removes a regular student, or a student another booking still uses.
select id as b1 from public.trial_bookings where student_id = :twice_id order by id limit 1 \gset
select public.cancel_trial_booking(:b1);
select pg_temp.ok(exists (select 1 from public.students where id = :twice_id), 'cancelling one of several bookings keeps the student');

select public.book_trial_slot(99981, :'monday'::date, 'Cancel Kid', 7, '60123450943', 99942);
select public.book_trial_slot(99981, (:'monday'::date + 7), 'Cancel Kid', 7, '60123450943', 99942);
select id as cancel_id from public.students where full_name = 'Cancel Kid' \gset
select id as c1 from public.trial_bookings where student_id = :cancel_id order by id limit 1 \gset
select id as c2 from public.trial_bookings where student_id = :cancel_id order by id desc limit 1 \gset
select public.cancel_trial_booking(:c1);
select pg_temp.ok(exists (select 1 from public.students where id = :cancel_id), 'an HOA student with a booking left stays');
select public.cancel_trial_booking(:c2);
select pg_temp.ok(not exists (select 1 from public.students where id = :cancel_id), 'cancelling the last booking removes the HOA student, as before');

-- A converted student whose only booking is cancelled stays.
select id as conv_id from public.students where full_name = 'Sibling Kid' \gset
select public.convert_hoa_student(:conv_id, 99972, current_date, null, 0, null, null, null, null, null);
select id as s1 from public.trial_bookings where student_id = :conv_id \gset
select public.cancel_trial_booking(:s1);
select pg_temp.ok(exists (select 1 from public.students where id = :conv_id and student_type = 'regular'), 'a regular student is never removed by cancelling a booking');

rollback;
