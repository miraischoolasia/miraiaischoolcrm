-- Moving a trial by drag can now also change its time, like a regular class.
--
-- reschedule_trial_bookings moves every child booked on one trial slot/day
-- to another date and time. If an active trial slot of the same classroom
-- already runs then (same start and end time), the children join it;
-- otherwise a one-off trial slot is created for that single date: a weekly
-- schedule whose start_recur = end_recur, so booking, attendance and the
-- calendar all treat it like any other trial slot. A one-off slot left
-- empty by a move (and with no attendance) is removed.
--
-- move_trial_bookings (slot-to-slot only) is kept so a browser still on the
-- previous frontend keeps working; nothing new calls it.

create or replace function public.reschedule_trial_bookings(
  p_from_schedule_id bigint,
  p_from_date date,
  p_to_date date,
  p_start_time time,
  p_end_time time
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from public.schedules%rowtype;
  v_classroom public.classrooms%rowtype;
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_to_id bigint;
  v_moved integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins can move a trial booking.';
  end if;

  if p_to_date is null or p_to_date <= v_today then
    raise exception 'A trial can only be moved to a date after today.';
  end if;

  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'The trial must end after it starts.';
  end if;

  select * into v_from
  from public.schedules
  where id = p_from_schedule_id
  for update;

  if not found then
    raise exception 'Schedule not found.';
  end if;

  select * into v_classroom from public.classrooms where id = v_from.classroom_id;

  if not found or v_classroom.category <> 'trial' then
    raise exception 'This is not a trial slot.';
  end if;

  if v_classroom.status <> 'active' then
    raise exception 'This trial classroom is not active.';
  end if;

  if not exists (
    select 1 from public.trial_bookings
    where schedule_id = p_from_schedule_id
      and booking_date = p_from_date
  ) then
    raise exception 'Nobody is booked on this trial slot.';
  end if;

  if exists (
    select 1 from public.lesson_logs
    where schedule_id = p_from_schedule_id
      and lesson_date = p_from_date
  ) then
    raise exception 'Attendance was already taken for this trial, so it cannot be moved.';
  end if;

  -- An existing slot of this trial classroom at exactly that time, if any;
  -- the slot's own teacher first.
  select s.id into v_to_id
  from public.schedules s
  where s.classroom_id = v_classroom.id
    and s.status = 'active'
    and s.event_type = 'regular'
    and s.start_time = p_start_time
    and s.end_time = p_end_time
    and s.day_of_week = extract(dow from p_to_date)::int
    and p_to_date >= s.start_recur
    and (s.end_recur is null or p_to_date <= s.end_recur)
    and not exists (
      select 1 from public.schedule_exceptions e
      where e.schedule_id = s.id
        and e.exception_date = p_to_date
    )
  order by (s.teacher_id = v_from.teacher_id) desc, s.id
  limit 1
  for update;

  if v_to_id = p_from_schedule_id and p_to_date = p_from_date then
    raise exception 'The trial is already at that time.';
  end if;

  if v_to_id is not null and exists (
    select 1
    from public.trial_bookings moving
    join public.trial_bookings existing
      on existing.schedule_id = v_to_id
     and existing.booking_date = p_to_date
     and lower(existing.child_name) = lower(moving.child_name)
     and coalesce(existing.phone, '') = coalesce(moving.phone, '')
    where moving.schedule_id = p_from_schedule_id
      and moving.booking_date = p_from_date
  ) then
    raise exception 'A child being moved is already booked at that time.';
  end if;

  if v_to_id is null then
    insert into public.schedules (
      teacher_id, student_id, classroom_id, title, event_type, recurrence_type,
      day_of_week, scheduled_date, start_time, end_time, start_recur, end_recur,
      status, notes
    )
    values (
      v_from.teacher_id,
      null,
      v_classroom.id,
      v_classroom.name,
      'regular',
      'weekly',
      extract(dow from p_to_date)::int,
      null,
      p_start_time,
      p_end_time,
      p_to_date,
      p_to_date,
      'active',
      'One-off trial slot.'
    )
    returning id into v_to_id;
  end if;

  -- The trial students follow the slot's teacher so they show in its roster.
  update public.students
  set teacher_id = (select teacher_id from public.schedules where id = v_to_id)
  where id in (
    select student_id from public.trial_bookings
    where schedule_id = p_from_schedule_id
      and booking_date = p_from_date
      and student_id is not null
  );

  update public.trial_bookings
  set schedule_id = v_to_id,
      booking_date = p_to_date
  where schedule_id = p_from_schedule_id
    and booking_date = p_from_date;

  get diagnostics v_moved = row_count;

  -- A one-off slot that is now empty has nothing left to show.
  if v_from.start_recur = v_from.end_recur
    and v_from.id <> v_to_id
    and not exists (select 1 from public.trial_bookings where schedule_id = v_from.id)
    and not exists (select 1 from public.lesson_logs where schedule_id = v_from.id) then
    delete from public.schedules where id = v_from.id;
  end if;

  perform public.record_admin_activity(
    'trial_moved',
    'schedule',
    v_to_id,
    v_classroom.name,
    jsonb_build_object(
      'from_schedule_id', p_from_schedule_id,
      'from_date', p_from_date,
      'to_date', p_to_date,
      'start_time', p_start_time,
      'children', v_moved
    )
  );

  return v_to_id;
end;
$$;

revoke all on function public.reschedule_trial_bookings(bigint, date, date, time, time) from public, anon;
grant execute on function public.reschedule_trial_bookings(bigint, date, date, time, time) to authenticated;
