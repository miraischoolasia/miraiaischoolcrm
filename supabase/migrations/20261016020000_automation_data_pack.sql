-- The read-only "data pack" for the automation tool (n8n).
--
-- Each view below is a small read-only window onto the CRM: only the columns an automation
-- (reminders, follow-ups, make-up and renewal notices) needs. They live in their own schema,
-- `automation`, which the app's API does not expose, and only the n8n_automation login can read
-- them. The login still cannot read the real tables.
--
-- Left out on purpose, so n8n can never see them: fees and ledgers, receipts, lead and student
-- notes, lesson remarks, teacher accounts and permissions, form submissions, email addresses.
-- If a rule ever needs one of those, it is added deliberately, one view at a time.
--
-- Views run with their owner's rights, so they work although n8n_automation has no access to
-- the underlying tables.

create schema if not exists automation;

create or replace view automation.leads as
select
  l.id,
  l.full_name,
  l.phone,
  l.status,
  l.state,
  l.pic_id,
  l.children,
  l.follow_ups,
  l.tasks,
  l.added_date,
  l.converted_student_id,
  l.created_at
from public.leads l;

create or replace view automation.trials as
select
  tb.id,
  tb.booking_date,
  sc.start_time,
  sc.end_time,
  sc.title as class_title,
  c.name as classroom_name,
  t.full_name as teacher_name,
  tb.lead_id,
  tb.student_id,
  tb.child_name,
  tb.child_age,
  tb.phone,
  tb.created_at
from public.trial_bookings tb
left join public.schedules sc on sc.id = tb.schedule_id
left join public.classrooms c on c.id = sc.classroom_id
left join public.teachers t on t.id = sc.teacher_id;

create or replace view automation.zoom_meetings as
select z.id, z.lead_id, z.starts_at, z.link, z.created_at
from public.lead_zoom_meetings z;

create or replace view automation.students as
select
  s.id,
  s.full_name,
  s.phone,
  s.age,
  s.is_active,
  s.student_type,
  s.classroom_id,
  c.name as classroom_name,
  s.package_id,
  p.name as package_name,
  s.remaining_hours,
  s.lesson_expiry_date,
  s.account_fee_expiry_date,
  s.mirai_club_expiry_date
from public.students s
left join public.classrooms c on c.id = s.classroom_id
left join public.packages p on p.id = s.package_id;

create or replace view automation.student_contacts as
select
  child.student_id,
  child.full_name as child_name,
  child.phone as child_phone,
  parent.id as parent_person_id,
  parent.full_name as parent_name,
  parent.phone as parent_phone,
  parent.lead_id as parent_lead_id
from public.people child
left join public.people parent on parent.id = child.parent_id
where child.kind = 'student' and child.student_id is not null;

create or replace view automation.classes as
select
  sc.id as schedule_id,
  sc.title,
  sc.event_type,
  sc.recurrence_type,
  sc.day_of_week,
  sc.scheduled_date,
  sc.start_time,
  sc.end_time,
  sc.start_recur,
  sc.end_recur,
  sc.status,
  sc.classroom_id,
  c.name as classroom_name,
  c.category,
  c.age_group,
  c.program_level,
  sc.teacher_id,
  t.full_name as teacher_name,
  sc.student_id
from public.schedules sc
left join public.classrooms c on c.id = sc.classroom_id
left join public.teachers t on t.id = sc.teacher_id;

create or replace view automation.class_exceptions as
select e.id, e.schedule_id, e.exception_date, e.moved_to_schedule_id
from public.schedule_exceptions e;

create or replace view automation.schedule_students as
select ss.schedule_id, ss.student_id, ss.is_active
from public.schedule_students ss;

create or replace view automation.classroom_periods as
select
  scp.student_id,
  scp.classroom_id,
  c.name as classroom_name,
  scp.start_date,
  scp.end_date
from public.student_classroom_periods scp
left join public.classrooms c on c.id = scp.classroom_id;

create or replace view automation.attendance as
select
  lls.student_id,
  ll.lesson_date,
  lls.attendance_status,
  ll.schedule_id,
  sc.classroom_id,
  ll.id as lesson_log_id,
  ll.revision_number,
  ll.parent_log_id
from public.lesson_log_students lls
join public.lesson_logs ll on ll.id = lls.lesson_log_id
left join public.schedules sc on sc.id = ll.schedule_id;

create or replace view automation.makeups as
select
  mp.id as plan_id,
  mp.student_id,
  mp.classroom_id,
  mp.missed_date,
  mp.missed_minutes,
  ms.session_date,
  ms.extra_minutes
from public.makeup_plans mp
left join public.makeup_sessions ms on ms.plan_id = mp.id;

revoke all on schema automation from public, anon, authenticated;
revoke all on all tables in schema automation from public, anon, authenticated;

grant usage on schema automation to n8n_automation;
grant select on all tables in schema automation to n8n_automation;
