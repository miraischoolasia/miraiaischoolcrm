-- Who should be reminded about a class today or tomorrow, for the automation tool (n8n).
--
-- One row for each student expected at a regular class, or at a replacement class made for them.
-- It follows the same rules as the calendar and the rosters:
--   * a weekly class meets on its weekday, inside its start / end dates, never on the 29th to 31st,
--     and not on a day that was cancelled (schedule_exceptions);
--   * a student is in the class on a day when one of their stays in that classroom covers it
--     (first day included, last day not), and only while the student is active;
--   * times are Malaysia time.
-- The number to write to is the student's own number when there is one, otherwise the parent's.
-- A student with neither has no row, because there is nobody to send to.
--
-- Whether to send, the wording and the hour are decided in n8n. This view only says what is true.
-- dedupe_key is one reminder for one student for one class on one day, so a reminder is never
-- queued twice however often n8n looks.

create or replace view automation.class_reminders as
with days as (
  select (series.d)::date as class_date
  from generate_series(
    (now() at time zone 'Asia/Kuala_Lumpur')::date,
    (now() at time zone 'Asia/Kuala_Lumpur')::date + 1,
    interval '1 day'
  ) as series(d)
),
weekly as (
  select
    sc.id as schedule_id,
    sc.classroom_id,
    c.name as classroom_name,
    sc.title,
    sc.start_time,
    days.class_date
  from days
  join public.schedules sc
    on sc.event_type = 'regular'
   and sc.status = 'active'
   and sc.day_of_week = extract(dow from days.class_date)::int
   and sc.start_recur is not null
   and sc.start_recur <= days.class_date
   and (sc.end_recur is null or days.class_date <= sc.end_recur)
  join public.classrooms c
    on c.id = sc.classroom_id
   and c.category = 'regular'
   and c.status = 'active'
  where extract(day from days.class_date) < 29
    and not exists (
      select 1
      from public.schedule_exceptions e
      where e.schedule_id = sc.id
        and e.exception_date = days.class_date
    )
),
people_in_class as (
  select
    'regular'::text as kind,
    w.schedule_id,
    w.classroom_name,
    w.title as class_title,
    w.start_time,
    w.class_date,
    p.student_id
  from weekly w
  join public.student_classroom_periods p
    on p.classroom_id = w.classroom_id
   and (p.start_date is null or p.start_date <= w.class_date)
   and (p.end_date is null or w.class_date < p.end_date)
  union all
  select
    'replacement'::text,
    sc.id,
    null::text,
    sc.title,
    sc.start_time,
    sc.scheduled_date,
    sc.student_id
  from public.schedules sc
  join days on days.class_date = sc.scheduled_date
  where sc.event_type = 'replacement'
    and sc.status = 'active'
    and sc.student_id is not null
)
select
  'class1h:' || s.id || ':' || x.schedule_id || ':' || to_char(x.class_date, 'YYYY-MM-DD') as dedupe_key,
  x.kind,
  s.id as student_id,
  s.full_name as child_name,
  contact.parent_name,
  coalesce(contact.child_phone, contact.parent_phone) as phone,
  (contact.child_phone is not null) as phone_is_childs,
  x.classroom_name,
  x.class_title,
  x.class_date,
  ((x.class_date + x.start_time) at time zone 'Asia/Kuala_Lumpur') as starts_at,
  to_char(x.start_time, 'FMHH12:MI am') as start_label
from people_in_class x
join public.students s on s.id = x.student_id and s.is_active
left join automation.student_contacts contact on contact.student_id = s.id
where coalesce(contact.child_phone, contact.parent_phone) ~ '^[0-9]{8,15}$';

revoke all on automation.class_reminders from public, anon, authenticated;
grant select on automation.class_reminders to n8n_automation;
