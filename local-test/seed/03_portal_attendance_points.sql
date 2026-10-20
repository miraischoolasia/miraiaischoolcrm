-- FAKE logins for the student app, past attendance, points and today's live class. Fixed ids match test-accounts.json.
\set ON_ERROR_STOP on
begin;

-- Students joined their class 60 days ago (so earlier lessons have a roster).
update public.student_classroom_periods set start_date = current_date - 60 where end_date is null;
update public.student_classroom_periods set end_date = current_date - 30 where student_id = 10;

-- ---------------------------------------------------------------- student + parent logins
-- parent: the family sync made one parent (person) for 60100000011 (Aiden + Bella's number).
insert into public.portal_accounts (auth_user_id, username, kind, student_id, created_by) values
  ('a0000000-0000-4000-8000-000000000101', 'student_test',  'student', 1, 1),
  ('a0000000-0000-4000-8000-000000000102', 'student2_test', 'student', 2, 1);
insert into public.portal_accounts (auth_user_id, username, kind, parent_person_id, created_by)
select 'a0000000-0000-4000-8000-000000000201', 'parent_test', 'parent', p.id, 1
from public.people p where p.kind = 'parent' and p.phone = '60100000011';
update public.students set auth_user_id = 'a0000000-0000-4000-8000-000000000101' where id = 1;
update public.students set auth_user_id = 'a0000000-0000-4000-8000-000000000102' where id = 2;
update public.people set auth_user_id = 'a0000000-0000-4000-8000-000000000201' where kind = 'parent' and phone = '60100000011';

-- ---------------------------------------------------------------- past lessons with attendance (last 3 weeks, classes 1-3)
with days as (
  select s.id as schedule_id, s.teacher_id, s.classroom_id, d::date as lesson_date
  from public.schedules s
  cross join generate_series(current_date - 21, current_date - 1, interval '1 day') d
  where s.id in (1, 2, 3) and extract(dow from d) = s.day_of_week
), logs as (
  insert into public.lesson_logs (schedule_id, teacher_id, lesson_date, lesson_remark, submitted_by)
  select schedule_id, teacher_id, lesson_date, 'Demo lesson: fractions and loops (fake remark).', teacher_id from days
  returning id, schedule_id, lesson_date
)
insert into public.lesson_log_students (lesson_log_id, student_id, attendance_status)
select l.id, st.id,
  case when (st.id + extract(day from l.lesson_date)::int) % 7 = 0 then 'absent'
       when (st.id + extract(day from l.lesson_date)::int) % 5 = 0 then 'leave' else 'present' end
from logs l
join public.schedules s on s.id = l.schedule_id
join public.students st on st.classroom_id = s.classroom_id and st.is_active;

-- ---------------------------------------------------------------- points (a few awards for the logged-in students and others)
insert into public.student_points (student_id, points, kind, reason, lesson_date, created_by) values
  (1, 10, 'attendance', 'Present', current_date - 7, 2), (1, 10, 'attendance', 'Present', current_date - 14, 2), (1, 5, 'award', 'Great teamwork', current_date - 7, 2),
  (2, 10, 'attendance', 'Present', current_date - 7, 2), (2, 3, 'award', 'Helped a classmate', current_date - 7, 2),
  (3, 10, 'attendance', 'Present', current_date - 7, 2), (3, 20, 'award', 'Top of the class', current_date - 7, 2),
  (4, 10, 'attendance', 'Present', current_date - 5, 2), (5, 10, 'attendance', 'Present', current_date - 5, 2),
  (7, 10, 'attendance', 'Present', current_date - 7, 3), (8, 10, 'attendance', 'Present', current_date - 7, 3);

-- ---------------------------------------------------------------- today's class: a scheduled live session
insert into public.class_sessions (schedule_id, lesson_date, classroom_id, teacher_id, starts_at, ends_at, status, created_by)
select 3, current_date, 3, 3, (current_date + time '20:30') at time zone 'Asia/Kuala_Lumpur', (current_date + time '21:30') at time zone 'Asia/Kuala_Lumpur', 'scheduled', 3
where not exists (select 1 from public.class_sessions where schedule_id = 3 and lesson_date = current_date);

commit;
