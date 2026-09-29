-- Drag-and-drop on the calendar.
--
-- 1. move_class_occurrence: dragging one day of a regular class to a later
--    date cancels that day (reason "Moved to ...") and creates a one-off
--    replacement class on the new date with the same teacher and the
--    classroom's active students. Dragging a replacement class just changes
--    its date/time. Both refuse once attendance exists.
-- 2. move_trial_bookings: dragging a booked trial slot onto another trial
--    slot moves every child booked on that day to the new slot/date.
-- 3. restore_schedule_occurrence on a moved day now undoes the move: the
--    replacement it created is removed (only while it has no attendance).

alter table public.schedule_exceptions
add column if not exists moved_to_schedule_id bigint
  references public.schedules (id) on delete set null;

create or replace function public.move_class_occurrence(
  p_schedule_id bigint,
  p_from_date date,
  p_to_date date,
  p_start_time time,
  p_end_time time,
  p_reason text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.schedules%rowtype;
  v_classroom public.classrooms%rowtype;
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_student_ids bigint[];
  v_new_id bigint;
begin
  if not public.is_admin() then
    raise exception 'Only admins can move a class.';
  end if;

  if p_to_date is null or p_to_date <= v_today then
    raise exception 'A class can only be moved to a date after today.';
  end if;

  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'The class must end after it starts.';
  end if;

  -- FOR UPDATE serialises with attendance submission (FOR SHARE in its
  -- trigger) and with cancelling/booking on this schedule.
  select * into v_schedule
  from public.schedules
  where id = p_schedule_id
  for update;

  if not found then
    raise exception 'Schedule not found.';
  end if;

  if v_schedule.status <> 'active' then
    raise exception 'This class is cancelled.';
  end if;

  if exists (
    select 1 from public.lesson_logs
    where schedule_id = p_schedule_id
      and lesson_date = p_from_date
  ) then
    raise exception 'Attendance was already taken for this class, so it cannot be moved.';
  end if;

  if v_schedule.event_type = 'replacement' then
    if p_from_date is distinct from v_schedule.scheduled_date then
      raise exception 'This class does not run on that date.';
    end if;

    update public.schedules
    set scheduled_date = p_to_date,
        start_time = p_start_time,
        end_time = p_end_time
    where id = p_schedule_id;

    perform public.record_admin_activity(
      'schedule_moved',
      'schedule',
      p_schedule_id,
      v_schedule.title,
      jsonb_build_object('from_date', p_from_date, 'to_date', p_to_date)
    );

    return p_schedule_id;
  end if;

  select * into v_classroom
  from public.classrooms
  where id = v_schedule.classroom_id;

  if not found or v_classroom.status <> 'active' then
    raise exception 'This classroom is not active.';
  end if;

  if v_classroom.category = 'trial' then
    raise exception 'Trial slots move with their bookings. Drag a booked trial onto another trial slot.';
  end if;

  -- Same meeting-day rule the calendar and attendance use: weekday, date
  -- range, never the 29th-31st, and not already cancelled.
  if p_from_date is null
    or extract(dow from p_from_date)::int <> v_schedule.day_of_week
    or p_from_date < v_schedule.start_recur
    or (v_schedule.end_recur is not null and p_from_date > v_schedule.end_recur)
    or extract(day from p_from_date)::int >= 29 then
    raise exception 'This class does not run on that date.';
  end if;

  if exists (
    select 1 from public.schedule_exceptions
    where schedule_id = p_schedule_id
      and exception_date = p_from_date
  ) then
    raise exception 'This class is already cancelled on that date.';
  end if;

  if exists (
    select 1
    from public.makeup_sessions ms
    join public.makeup_plans mp on mp.id = ms.plan_id
    where mp.classroom_id = v_classroom.id
      and ms.session_date = p_from_date
  ) then
    raise exception 'This class carries make-up minutes that day. Change the make-up plan first, then move the class.';
  end if;

  select coalesce(array_agg(id order by full_name), '{}'::bigint[])
  into v_student_ids
  from public.students
  where classroom_id = v_classroom.id
    and is_active;

  if cardinality(v_student_ids) = 0 then
    raise exception 'This class has no active students to move.';
  end if;

  insert into public.schedules (
    teacher_id, student_id, classroom_id, title, event_type, recurrence_type,
    day_of_week, scheduled_date, start_time, end_time, start_recur, end_recur,
    status, notes
  )
  values (
    v_schedule.teacher_id,
    v_student_ids[1],
    null,
    v_classroom.name,
    'replacement',
    'none',
    null,
    p_to_date,
    p_start_time,
    p_end_time,
    null,
    null,
    'active',
    'Moved from ' || to_char(p_from_date, 'DD Mon YYYY') || '.'
      || coalesce(' ' || v_reason, '')
  )
  returning id into v_new_id;

  insert into public.schedule_students (schedule_id, student_id)
  select v_new_id, unnest(v_student_ids);

  insert into public.schedule_exceptions (
    schedule_id, exception_date, reason, created_by, moved_to_schedule_id
  )
  values (
    p_schedule_id,
    p_from_date,
    'Moved to ' || to_char(p_to_date, 'DD Mon YYYY') || coalesce(' - ' || v_reason, ''),
    public.current_teacher_id(),
    v_new_id
  );

  perform public.record_admin_activity(
    'schedule_moved',
    'schedule',
    p_schedule_id,
    v_classroom.name,
    jsonb_build_object(
      'from_date', p_from_date,
      'to_date', p_to_date,
      'replacement_schedule_id', v_new_id
    )
  );

  return v_new_id;
end;
$$;

create or replace function public.move_trial_bookings(
  p_from_schedule_id bigint,
  p_from_date date,
  p_to_schedule_id bigint,
  p_to_date date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_to public.schedules%rowtype;
  v_to_classroom public.classrooms%rowtype;
  v_from_label text;
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_moved integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins can move a trial booking.';
  end if;

  if p_to_date is null or p_to_date <= v_today then
    raise exception 'A trial can only be moved to a date after today.';
  end if;

  if p_from_schedule_id = p_to_schedule_id and p_from_date = p_to_date then
    raise exception 'The trial is already on that slot.';
  end if;

  -- Lock both slots in id order so two opposite moves cannot deadlock.
  perform 1 from public.schedules
  where id in (p_from_schedule_id, p_to_schedule_id)
  order by id
  for update;

  select c.name into v_from_label
  from public.schedules s
  join public.classrooms c on c.id = s.classroom_id
  where s.id = p_from_schedule_id
    and c.category = 'trial';

  if not found then
    raise exception 'This is not a trial slot.';
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

  select * into v_to from public.schedules where id = p_to_schedule_id;

  if not found or v_to.status <> 'active' or v_to.event_type <> 'regular' then
    raise exception 'The target is not an active trial slot.';
  end if;

  select * into v_to_classroom from public.classrooms where id = v_to.classroom_id;

  if not found or v_to_classroom.category <> 'trial' or v_to_classroom.status <> 'active' then
    raise exception 'The target is not an active trial slot.';
  end if;

  if extract(dow from p_to_date)::int <> v_to.day_of_week
    or p_to_date < v_to.start_recur
    or (v_to.end_recur is not null and p_to_date > v_to.end_recur) then
    raise exception 'That trial slot does not run on that date.';
  end if;

  if exists (
    select 1 from public.schedule_exceptions
    where schedule_id = p_to_schedule_id
      and exception_date = p_to_date
  ) then
    raise exception 'That trial slot is cancelled on that date.';
  end if;

  if exists (
    select 1
    from public.trial_bookings moving
    join public.trial_bookings existing
      on existing.schedule_id = p_to_schedule_id
     and existing.booking_date = p_to_date
     and lower(existing.child_name) = lower(moving.child_name)
     and coalesce(existing.phone, '') = coalesce(moving.phone, '')
    where moving.schedule_id = p_from_schedule_id
      and moving.booking_date = p_from_date
  ) then
    raise exception 'A child being moved is already booked on that slot.';
  end if;

  -- The trial student follows the slot's teacher so it shows in their roster.
  update public.students
  set teacher_id = v_to.teacher_id
  where id in (
    select student_id from public.trial_bookings
    where schedule_id = p_from_schedule_id
      and booking_date = p_from_date
      and student_id is not null
  );

  update public.trial_bookings
  set schedule_id = p_to_schedule_id,
      booking_date = p_to_date
  where schedule_id = p_from_schedule_id
    and booking_date = p_from_date;

  get diagnostics v_moved = row_count;

  perform public.record_admin_activity(
    'trial_moved',
    'schedule',
    p_to_schedule_id,
    v_to_classroom.name,
    jsonb_build_object(
      'from_schedule_id', p_from_schedule_id,
      'from_date', p_from_date,
      'to_date', p_to_date,
      'children', v_moved
    )
  );

  return v_moved;
end;
$$;

-- Restoring a moved day undoes the move: the replacement it created goes
-- away, as long as nobody has taken attendance on it yet.
create or replace function public.restore_schedule_occurrence(
  p_schedule_id bigint,
  p_occurrence_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.schedules%rowtype;
  v_exception public.schedule_exceptions%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can restore a class occurrence.';
  end if;

  select * into v_schedule from public.schedules where id = p_schedule_id;

  if not found then
    raise exception 'Schedule not found.';
  end if;

  if v_schedule.classroom_id is not null and exists (
    select 1 from public.makeup_plans
    where classroom_id = v_schedule.classroom_id
      and missed_date = p_occurrence_date
      and student_id is null
  ) then
    raise exception 'This day has a make-up plan. Delete the make-up plan first, then restore the class.';
  end if;

  select * into v_exception
  from public.schedule_exceptions
  where schedule_id = p_schedule_id
    and exception_date = p_occurrence_date;

  if not found then
    return;
  end if;

  if v_exception.moved_to_schedule_id is not null then
    if exists (
      select 1 from public.lesson_logs
      where schedule_id = v_exception.moved_to_schedule_id
    ) then
      raise exception 'The moved class already has attendance, so this day cannot be restored.';
    end if;

    delete from public.schedules where id = v_exception.moved_to_schedule_id;
  end if;

  delete from public.schedule_exceptions where id = v_exception.id;

  perform public.record_admin_activity(
    'schedule_occurrence_restored',
    'schedule',
    p_schedule_id,
    v_schedule.title,
    jsonb_build_object(
      'occurrence_date', p_occurrence_date,
      'removed_replacement_schedule_id', v_exception.moved_to_schedule_id
    )
  );
end;
$$;

revoke all on function public.move_class_occurrence(bigint, date, date, time, time, text) from public, anon;
grant execute on function public.move_class_occurrence(bigint, date, date, time, time, text) to authenticated;
revoke all on function public.move_trial_bookings(bigint, date, bigint, date) from public, anon;
grant execute on function public.move_trial_bookings(bigint, date, bigint, date) to authenticated;
revoke all on function public.restore_schedule_occurrence(bigint, date) from public, anon;
grant execute on function public.restore_schedule_occurrence(bigint, date) to authenticated;
