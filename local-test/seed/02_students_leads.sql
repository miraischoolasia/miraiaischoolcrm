-- FAKE students, parents, leads, trial bookings. Phones are made-up (601000000xx), names start with "Demo".
\set ON_ERROR_STOP on
begin;

-- ---------------------------------------------------------------- parents first (leads), so the family sync ties each student to a parent
-- One converted lead per family; the child names match the students below, so the sync links them.
insert into public.leads (id, full_name, phone, source, status, notes, children, added_date, follow_ups) values
  (7,  'Demo Parent Aiden', '60100000011', 'referral',     'converted', 'Family of Aiden and Bella (fake).', '[{"name":"Demo Aiden","age":13},{"name":"Demo Bella","age":12}]', current_date - 60, '[]'),
  (8,  'Demo Parent Caleb', '60100000012', 'social_media', 'converted', 'Fake family.', '[{"name":"Demo Caleb","age":13}]', current_date - 80, '[]'),
  (9,  'Demo Parent Daisy', '60100000013', 'walk_in',      'converted', 'Fake family.', '[{"name":"Demo Daisy","age":14}]', current_date - 70, '[]'),
  (10, 'Demo Parent Ethan', '60100000014', 'advertisement','converted', 'Fake family.', '[{"name":"Demo Ethan","age":12}]', current_date - 50, '[]'),
  (11, 'Demo Parent Farah', '60100000015', 'other',        'converted', 'Fake family.', '[{"name":"Demo Farah","age":13}]', current_date - 95, '[]'),
  (12, 'Demo Parent Gavin', '60100000016', 'referral',     'converted', 'Fake family.', '[{"name":"Demo Gavin","age":10}]', current_date - 65, '[]'),
  (13, 'Demo Parent Hana',  '60100000017', 'social_media', 'converted', 'Fake family.', '[{"name":"Demo Hana","age":11}]', current_date - 40, '[]'),
  (14, 'Demo Parent Ivan',  '60100000018', 'walk_in',      'converted', 'Fake family.', '[{"name":"Demo Ivan","age":9}]', current_date - 55, '[]'),
  (15, 'Demo Parent Jade',  '60100000019', 'other',        'converted', 'Fake family.', '[{"name":"Demo Jade","age":10}]', current_date - 120, '[]'),
  (16, 'Demo Parent Kai',   '60100000021', 'social_media', 'trial_scheduled', 'Fake HOA family.', '[{"name":"Demo Kai","age":7}]', current_date - 10, '[]'),
  (17, 'Demo Parent Lily',  '60100000022', 'advertisement','trial_scheduled', 'Fake HOA family.', '[{"name":"Demo Lily","age":8}]', current_date - 9, '[]');

-- ---------------------------------------------------------------- regular students (in a class, with a package)
-- Siblings Aiden and Bella share the parent number 60100000011 (the family sync makes one parent for both).
insert into public.students (id, teacher_id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date,
  is_active, classroom_id, student_type, phone, age, package_id, date_of_birth) values
  (1,  2, 'Demo Aiden',   8, current_date + 90,  current_date + 300, current_date + 300, true, 1, 'regular', '60100000011', 13, (select id from public.packages where name = '6 Months'),  current_date - 13*365),
  (2,  2, 'Demo Bella',   3, current_date + 20,  current_date + 300, current_date + 300, true, 1, 'regular', '60100000011', 12, (select id from public.packages where name = '3 Months'),  current_date - 12*365),
  (3,  2, 'Demo Caleb',  20, current_date + 200, current_date + 150, current_date + 150, true, 1, 'regular', '60100000012', 13, (select id from public.packages where name = '12 Months'), current_date - 13*365),
  (4,  2, 'Demo Daisy',   1, current_date + 6,   current_date + 90,  current_date + 90,  true, 2, 'regular', '60100000013', 14, (select id from public.packages where name = '3 Months'),  current_date - 14*365),
  (5,  2, 'Demo Ethan',  10, current_date + 120, current_date + 200, current_date + 200, true, 2, 'regular', '60100000014', 12, (select id from public.packages where name = '6 Months'),  current_date - 12*365),
  (6,  2, 'Demo Farah',   0, current_date - 5,   current_date - 5,   current_date - 5,   true, 2, 'regular', '60100000015', 13, (select id from public.packages where name = '3 Months'),  current_date - 13*365),
  (7,  3, 'Demo Gavin',   6, current_date + 60,  current_date + 200, current_date + 200, true, 3, 'regular', '60100000016', 10, (select id from public.packages where name = '6 Months'),  current_date - 10*365),
  (8,  3, 'Demo Hana',   12, current_date + 150, current_date + 250, current_date + 250, true, 3, 'regular', '60100000017', 11, (select id from public.packages where name = '12 Months'), current_date - 11*365),
  (9,  3, 'Demo Ivan',    4, current_date + 40,  current_date + 100, current_date + 100, true, 3, 'regular', '60100000018', 9,  (select id from public.packages where name = '3 Months'),  current_date - 9*365),
  (10, 3, 'Demo Jade',    0, current_date - 60,  current_date - 60,  current_date - 60,  false,3, 'regular', '60100000019', 10, (select id from public.packages where name = '3 Months'),  current_date - 10*365);

-- HOA (trial) students: a one-month trial, in the HOA class (no fees).
insert into public.students (id, teacher_id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date,
  is_active, classroom_id, student_type, phone, age, package_id, date_of_birth) values
  (11, 2, 'Demo Kai',   4, current_date + 25, current_date + 25, current_date + 25, true, 4, 'trial', '60100000021', 7, (select id from public.packages where name = 'Trial 1 Month'), current_date - 7*365),
  (12, 2, 'Demo Lily',  4, current_date + 25, current_date + 25, current_date + 25, true, 4, 'trial', '60100000022', 8, (select id from public.packages where name = 'Trial 1 Month'), current_date - 8*365);
select setval(pg_get_serial_sequence('public.students', 'id'), 100);

update public.leads l set converted_student_id = st.id from public.students st where l.status = 'converted' and st.phone = l.phone and (l.children -> 0 ->> 'name') = st.full_name;

-- A package history for the regular students (what "Package" on the student page reads).
insert into public.student_enrollments (student_id, package_id, start_date, end_date, class_count, remark)
select s.id, s.package_id, s.lesson_expiry_date - 90, s.lesson_expiry_date, greatest(s.remaining_hours, 4), 'Demo enrolment'
from public.students s where s.student_type = 'regular' and s.package_id is not null;

-- ---------------------------------------------------------------- leads (one per stage) + trial bookings
insert into public.leads (id, full_name, phone, source, status, notes, children, added_date, follow_ups) values
  (1, 'Demo Parent One',   '60100000031', 'social_media',  'new',             'Asked about HOA on a message.',            '[{"name":"Demo Mia","age":7}]',  current_date - 1, '[]'),
  (2, 'Demo Parent Two',   '60100000032', 'referral',      'contacted',       'Called once; will reply tonight.',         '[{"name":"Demo Noah","age":9}]', current_date - 3, '[]'),
  (3, 'Demo Parent Three', '60100000033', 'advertisement', 'trial_scheduled', 'Booked an HOA slot next Monday.',          '[{"name":"Demo Owen","age":8}]', current_date - 5, '[]'),
  (4, 'Demo Parent Four',  '60100000034', 'walk_in',       'trial_completed', 'Had the trial; thinking about 6 months.',  '[{"name":"Demo Piper","age":10}]', current_date - 12, '[]'),
  (5, 'Demo Parent Five',  '60100000035', 'other',         'lost',            'Chose another school.',                    '[{"name":"Demo Quinn","age":11}]', current_date - 30, '[]'),
  (6, 'Demo Parent Six',   '60100000036', 'social_media',  'new',             'No phone name yet.',                       '[]',                              current_date,     '[]');
select setval(pg_get_serial_sequence('public.leads', 'id'), 100);

-- the HOA students' own leads (already converted), and one future booking for lead 3
insert into public.trial_bookings (schedule_id, booking_date, lead_id, child_name, child_age, phone, notes) values
  (4, (current_date + ((8 - extract(dow from current_date)::int) % 7 + case when extract(dow from current_date)::int = 1 then 7 else 0 end))::date, 3, 'Demo Owen', 8, '60100000033', 'Fake booking');

commit;
