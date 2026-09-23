-- Follow-up hardening for 20260921090000_schedule_occurrence_cancellation.sql.
--
-- 1. Race: cancel_schedule_occurrence checked "no attendance yet" and then
--    inserted the exception without any lock, while the attendance trigger
--    could not see an uncommitted exception. A teacher submitting attendance
--    at the same moment an admin cancelled that day could leave a day that is
--    both cancelled and has a lesson log. Both sides now take a lock on the
--    parent schedules row (FOR UPDATE when cancelling, FOR SHARE when a lesson
--    log is inserted), so whichever runs second sees the other's committed
--    result and refuses.
-- 2. The trigger function had no fixed search_path. It is now SECURITY DEFINER
--    with search_path pinned to public, like every other function here (this
--    also lets it take the schedules row lock regardless of the caller).

create or replace function public.cancel_schedule_occurrence(
  p_schedule_id bigint,
  p_occurrence_date date,
  p_reason text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.schedules%rowtype;
  v_exception_id bigint;
begin
  if not public.is_admin() then
    raise exception 'Only admins can cancel a class occurrence.';
  end if;

  -- Lock the schedule first so a concurrent attendance insert (which takes a
  -- FOR SHARE lock on this row in its trigger) is serialised with this call.
  select * into v_schedule
  from public.schedules
  where id = p_schedule_id
  for update;

  if not found then
    raise exception 'Schedule not found.';
  end if;

  if v_schedule.event_type <> 'regular' then
    raise exception 'Only regular weekly classes can skip a single day. Cancel the replacement class instead.';
  end if;

  if v_schedule.status <> 'active' then
    raise exception 'This schedule is already cancelled.';
  end if;

  if extract(dow from p_occurrence_date)::int <> v_schedule.day_of_week
    or p_occurrence_date < v_schedule.start_recur
    or (v_schedule.end_recur is not null and p_occurrence_date > v_schedule.end_recur) then
    raise exception 'This schedule does not run on that date.';
  end if;

  if exists (
    select 1 from public.lesson_logs
    where schedule_id = p_schedule_id
      and lesson_date = p_occurrence_date
  ) then
    raise exception 'Attendance was already submitted for this day, so it cannot be cancelled.';
  end if;

  insert into public.schedule_exceptions (schedule_id, exception_date, reason, created_by)
  values (
    p_schedule_id,
    p_occurrence_date,
    nullif(trim(coalesce(p_reason, '')), ''),
    public.current_teacher_id()
  )
  on conflict (schedule_id, exception_date) do nothing
  returning id into v_exception_id;

  if v_exception_id is not null then
    perform public.record_admin_activity(
      'schedule_occurrence_cancelled',
      'schedule',
      p_schedule_id,
      v_schedule.title,
      jsonb_build_object('occurrence_date', p_occurrence_date)
    );
  end if;

  return v_exception_id;
end;
$$;

create or replace function public.block_lesson_log_on_cancelled_occurrence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Wait for any in-flight cancel_schedule_occurrence on this schedule to
  -- commit, so the check below sees its exception row.
  perform 1 from public.schedules where id = new.schedule_id for share;

  if exists (
    select 1 from public.schedule_exceptions
    where schedule_id = new.schedule_id
      and exception_date = new.lesson_date
  ) then
    raise exception 'This class was cancelled for that day, so attendance cannot be submitted.';
  end if;

  return new;
end;
$$;
