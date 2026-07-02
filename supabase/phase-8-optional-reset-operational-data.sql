-- Optional manual reset for operational teaching data.
-- Run this only when you intentionally want a clean classroom/calendar system.
-- It keeps the bootstrap admin_demo teacher and removes operational data in dependency order.

delete from public.lesson_log_student_reviews;
delete from public.lesson_log_students;
delete from public.lesson_logs;
delete from public.student_lesson_ledger;
delete from public.student_admin_ledger;
delete from public.schedule_students;
delete from public.schedules;
delete from public.students;
delete from public.classrooms;
delete from public.teachers
where username <> 'admin_demo';
