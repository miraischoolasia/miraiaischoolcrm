-- Changing a class's main teacher moves only the lessons that teacher was
-- teaching. A class can now hold other teachers' weekly lessons too (EduHero:
-- SCI Form 1 has Ms Angeline's SCI and Ms Joey's SAINS), and those stay with
-- their own teacher. A split series also keeps its FB group and fixed Zoom
-- link (schedules.fb_group_url / zoom_link, 20261025200000).
--
-- Same function as the live one (20261003000000_account_permissions.sql: who
-- may call it is the 'classrooms' edit tick) apart from the three marked changes.

create or replace function public.reassign_classroom_teacher(
  p_classroom_id bigint,
  p_new_teacher_id bigint,
  p_effective_date date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_classroom public.classrooms%rowtype;
  v_new_teacher public.teachers%rowtype;
  v_effective date := coalesce(
    p_effective_date,
    (timezone('Asia/Kuala_Lumpur', now()))::date
  );
  v_last_logged date;
  v_schedule public.schedules%rowtype;
  v_new_schedule_id bigint;
begin
  if not public.has_permission('classrooms', 'edit') then
    raise exception 'Your account is not allowed to change a classroom teacher.';
  end if;

  select * into v_classroom
  from public.classrooms
  where id = p_classroom_id
  for update;

  if not found then
    raise exception 'Classroom not found.';
  end if;

  select * into v_new_teacher
  from public.teachers
  where id = p_new_teacher_id;

  if not found or not v_new_teacher.is_active or v_new_teacher.role <> 'teacher' then
    raise exception 'The new teacher must be an active teacher account.';
  end if;

  if v_classroom.teacher_id is not distinct from p_new_teacher_id then
    return;
  end if;

  -- A class already logged on or after the effective date belongs to the
  -- old teacher's series; moving it would orphan that attendance record.
  select max(ll.lesson_date) into v_last_logged
  from public.lesson_logs ll
  join public.schedules s on s.id = ll.schedule_id
  where s.classroom_id = p_classroom_id
    and s.event_type = 'regular'
    -- Changed: only lessons that move (other teachers' lessons stay).
    and s.teacher_id is not distinct from v_classroom.teacher_id;

  if v_last_logged is not null and v_last_logged >= v_effective then
    raise exception 'Attendance was already taken on %, so the change must start after that date.', v_last_logged;
  end if;

  update public.classrooms
  set teacher_id = p_new_teacher_id
  where id = p_classroom_id;

  update public.students
  set teacher_id = p_new_teacher_id
  where classroom_id = p_classroom_id;

  for v_schedule in
    select * from public.schedules
    where classroom_id = p_classroom_id
      and event_type = 'regular'
      and status = 'active'
      -- Changed: only the outgoing main teacher's lessons.
      and teacher_id is not distinct from v_classroom.teacher_id
    for update
  loop
    if v_schedule.end_recur is not null and v_schedule.end_recur < v_effective then
      -- Already ended before the change: history only, leave it alone.
      continue;
    end if;

    if v_schedule.start_recur >= v_effective then
      -- Hasn't started yet: nothing to split.
      update public.schedules
      set teacher_id = p_new_teacher_id
      where id = v_schedule.id;

      update public.students st
      set teacher_id = p_new_teacher_id
      from public.trial_bookings tb
      where tb.schedule_id = v_schedule.id
        and tb.student_id = st.id;

      continue;
    end if;

    insert into public.schedules (
      teacher_id, student_id, classroom_id, title, event_type, recurrence_type,
      day_of_week, scheduled_date, start_time, end_time, start_recur, end_recur,
      status, notes, fb_group_url, zoom_link
    )
    values (
      p_new_teacher_id, v_schedule.student_id, v_schedule.classroom_id,
      v_schedule.title, v_schedule.event_type, v_schedule.recurrence_type,
      v_schedule.day_of_week, v_schedule.scheduled_date, v_schedule.start_time,
      v_schedule.end_time, v_effective, v_schedule.end_recur,
      -- Changed: the new series keeps the lesson's links.
      'active', v_schedule.notes, v_schedule.fb_group_url, v_schedule.zoom_link
    )
    returning id into v_new_schedule_id;

    update public.schedules
    set end_recur = v_effective - 1
    where id = v_schedule.id;

    update public.schedule_exceptions
    set schedule_id = v_new_schedule_id
    where schedule_id = v_schedule.id
      and exception_date >= v_effective;

    -- Upcoming trial bookings (and their placeholder students) move to the
    -- new series and teacher.
    update public.students st
    set teacher_id = p_new_teacher_id
    from public.trial_bookings tb
    where tb.schedule_id = v_schedule.id
      and tb.booking_date >= v_effective
      and tb.student_id = st.id;

    update public.trial_bookings
    set schedule_id = v_new_schedule_id
    where schedule_id = v_schedule.id
      and booking_date >= v_effective;
  end loop;

  perform public.record_admin_activity(
    'classroom_teacher_changed',
    'classroom',
    p_classroom_id,
    v_classroom.name,
    jsonb_build_object(
      'from_teacher_id', v_classroom.teacher_id,
      'to_teacher_id', p_new_teacher_id,
      'effective_date', v_effective
    )
  );
end;
$$;

revoke all on function public.reassign_classroom_teacher(bigint, bigint, date) from public, anon;
grant execute on function public.reassign_classroom_teacher(bigint, bigint, date) to authenticated;
