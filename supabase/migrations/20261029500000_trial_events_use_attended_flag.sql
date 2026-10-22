-- The trial attended / absent triggers follow the school's own attendance statuses.
--
-- 20261029400000 wrote present / absent / leave into automation.trial_result_events, so a status a school added itself
-- (for example "Late") was never an event. Now every status counts by its own flag in public.attendance_statuses:
--   attended = true   -> trial_attended        attended = false  -> trial_absent
-- (Present is attended, Absent and Leave are not, as before; a school's "Late" is attended, a "No-show" is not.)
-- Same columns as before, so automation.rule_events is unchanged; only the lines that decide the event differ.

create or replace view automation.trial_result_events as
select
  case when s.attended then 'trial_attended' else 'trial_absent' end as trigger_type,
  case when s.attended then 'trial_attended:' else 'trial_absent:' end || t.id as event_key,
  t.phone,
  ld.full_name as parent_name,
  t.child_name,
  t.student_id,
  t.lead_id,
  r.submitted_at as starts_at,
  to_char(r.submitted_at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI am') as start_label,
  t.booking_date as class_date,
  coalesce(t.classroom_name, t.class_title) as class_label,
  t.classroom_id,
  t.child_age as age,
  null::numeric as hours_left,
  ld.status as lead_status,
  case when s.attended then 'trial_attended:' else 'trial_absent:' end || t.id as group_key
from automation.trials t
join public.trial_bookings tb on tb.id = t.id
join lateral (
  select ll.submitted_at, lls.attendance_status
  from public.lesson_logs ll
  join public.lesson_log_students lls on lls.lesson_log_id = ll.id and lls.student_id = t.student_id
  where ll.schedule_id = tb.schedule_id and ll.lesson_date = t.booking_date
  order by ll.revision_number desc
  limit 1
) r on true
join public.attendance_statuses s on s.key = r.attendance_status
left join automation.leads ld on ld.id = t.lead_id
where t.student_id is not null
  and r.submitted_at > now() - interval '62 days';

revoke all on automation.trial_result_events from public, anon, authenticated;
