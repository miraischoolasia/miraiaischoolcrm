-- FAKE data for the local test environment only. No real names, numbers or passwords.
-- Every date is relative to today, so the data stays "current" whenever you reset.
-- The auth users with these fixed ids are made by local-test/run.mjs before this file runs.
\set ON_ERROR_STOP on
begin;

-- ---------------------------------------------------------------- accounts (CRM staff)
-- id 1 already exists (the bootstrap admin of the migrations): it becomes admin_test.
update public.teachers set username = 'admin_test', full_name = 'Admin Test', email = 'admin_test@example.test',
  auth_user_id = 'a0000000-0000-4000-8000-000000000001' where id = 1;

insert into public.teachers (id, auth_user_id, username, full_name, email, role, is_active, permissions) values
  (2, 'a0000000-0000-4000-8000-000000000002', 'teacher_test',  'Teacher Lina (test)',   'teacher_test@example.test',  'teacher', true, '{}'),
  (3, 'a0000000-0000-4000-8000-000000000003', 'teacher2_test', 'Teacher Omar (test)',   'teacher2_test@example.test', 'teacher', true, '{}'),
  (4, 'a0000000-0000-4000-8000-000000000004', 'staff_test',    'Staff View (test)',     'staff_test@example.test',    'staff',   true,
     '{"leads":{"level":"view"},"inbox":{"level":"view"},"automations":{"level":"view"},"ai_knowledge":{"level":"view"}}'),
  (5, 'a0000000-0000-4000-8000-000000000005', 'staff2_test',   'Staff Front Desk (test)','staff2_test@example.test',   'staff',   true,
     '{"leads":{"level":"edit","delete":true},"inbox":{"level":"edit","delete":true},"calendar":{"level":"view"},"students":{"level":"view"},"videos":{"level":"view"}}');
select setval(pg_get_serial_sequence('public.teachers', 'id'), 10);

-- ---------------------------------------------------------------- subjects, packages
insert into public.subjects (name, sort_order) values ('Math', 1), ('English', 2), ('Coding', 3);

-- ---------------------------------------------------------------- classes + weekly timetable
-- dow: 0 = Sunday ... 6 = Saturday. "Today's class" meets on today's weekday so the Calendar / student app show it.
insert into public.classrooms (id, name, age_group, program_level, teacher_id, status, category, zoom_link, subject_id) values
  (1, 'F1 Math (test)',        '12-14 Years Old', 'Coder Foundation', 2, 'active', 'regular', 'https://example.test/zoom/f1-math',   (select id from public.subjects where name = 'Math')),
  (2, 'F2 English (test)',     '12-14 Years Old', 'Coder Pro', 2, 'active', 'regular', 'https://example.test/zoom/f2-english',(select id from public.subjects where name = 'English')),
  (3, 'Kids Coding (test)',    '9-11 Years Old',  'VibeTech Innovator', 3, 'active', 'regular', 'https://example.test/zoom/kids-coding',(select id from public.subjects where name = 'Coding')),
  (4, 'HOA Trial Mon (test)',  '6-8 Years Old',   'Coder Foundation', 2, 'active', 'trial',   'https://example.test/zoom/hoa-mon',   null),
  (5, 'Holiday Camp (test)',   '9-11 Years Old',  'Coder Pro', 3, 'active', 'camp',    'https://example.test/zoom/camp',      null);
select setval(pg_get_serial_sequence('public.classrooms', 'id'), 10);

insert into public.schedules (id, teacher_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, status, classroom_id, zoom_link) values
  (1, 2, 'F1 Math (test)',       'regular', 'weekly', 1, '19:00', '20:15', current_date - 70, 'active', 1, 'https://example.test/zoom/f1-math'),
  (2, 2, 'F2 English (test)',    'regular', 'weekly', 3, '19:00', '20:15', current_date - 70, 'active', 2, 'https://example.test/zoom/f2-english'),
  (3, 3, 'Kids Coding (test)',   'regular', 'weekly', extract(dow from current_date)::int, '20:30', '21:30', current_date - 70, 'active', 3, 'https://example.test/zoom/kids-coding'),
  (4, 2, 'HOA Trial Mon (test)', 'regular', 'weekly', 1, '16:00', '17:00', current_date - 70, 'active', 4, 'https://example.test/zoom/hoa-mon'),
  (5, 3, 'Holiday Camp (test)',  'regular', 'weekly', 6, '10:00', '12:00', current_date - 14, 'active', 5, 'https://example.test/zoom/camp');
select setval(pg_get_serial_sequence('public.schedules', 'id'), 20);

commit;
