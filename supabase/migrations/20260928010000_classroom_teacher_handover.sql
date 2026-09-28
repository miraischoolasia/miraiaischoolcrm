-- Classroom teacher handover with an effective date.
--
-- Changing a classroom's teacher used to rewrite teacher_id on the whole
-- weekly series, past included, so:
--   - the calendar showed the new teacher on classes the old one taught;
--   - the new teacher saw past (already logged) classes as not taken, since
--     lesson_logs are only visible to the teacher who logged them;
--   - students.teacher_id was never updated, so under RLS the old teacher
--     could still read those students.
-- reassign_classroom_teacher() now splits each weekly series at the
-- effective date: the part before stays with the old teacher, a new series
-- from that date belongs to the new one, and skipped days / trial bookings
-- from that date move with it. Students follow the classroom.
--
-- delete_teacher_account() gains an optional successor who takes over the
-- departing teacher's classrooms (from today) and upcoming replacement
-- classes. Either way, a series with history is now ended (end_recur) rather
-- than cancelled, so past classes stay on the calendar.

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
  if not public.is_admin() then
    raise exception 'Only admins can change a classroom teacher.';
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
    and s.event_type = 'regular';

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
      status, notes
    )
    values (
      p_new_teacher_id, v_schedule.student_id, v_schedule.classroom_id,
      v_schedule.title, v_schedule.event_type, v_schedule.recurrence_type,
      v_schedule.day_of_week, v_schedule.scheduled_date, v_schedule.start_time,
      v_schedule.end_time, v_effective, v_schedule.end_recur,
      'active', v_schedule.notes
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

drop function if exists public.delete_teacher_account(bigint);

create or replace function public.delete_teacher_account(
  p_teacher_id bigint,
  p_successor_teacher_id bigint default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher public.teachers%rowtype;
  v_successor public.teachers%rowtype;
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_classroom_id bigint;
  v_last_logged date;
  v_schedule public.schedules%rowtype;
  v_retained boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete teacher accounts.';
  end if;

  select * into v_teacher
  from public.teachers
  where id = p_teacher_id
  for update;

  if not found then
    raise exception 'Teacher not found.';
  end if;

  if v_teacher.username = 'admin_demo' or v_teacher.id = public.current_teacher_id() then
    raise exception 'This teacher account is protected and cannot be deleted.';
  end if;

  if p_successor_teacher_id is not null then
    select * into v_successor
    from public.teachers
    where id = p_successor_teacher_id;

    if not found
      or p_successor_teacher_id = p_teacher_id
      or not v_successor.is_active
      or v_successor.role <> 'teacher' then
      raise exception 'The successor must be another active teacher account.';
    end if;

    for v_classroom_id in
      select id from public.classrooms
      where teacher_id = p_teacher_id
        and status = 'active'
    loop
      -- Hand over from today, or from the day after a class already logged
      -- today, so no logged class changes owner.
      select max(ll.lesson_date) into v_last_logged
      from public.lesson_logs ll
      join public.schedules s on s.id = ll.schedule_id
      where s.classroom_id = v_classroom_id
        and s.event_type = 'regular';

      perform public.reassign_classroom_teacher(
        v_classroom_id,
        p_successor_teacher_id,
        greatest(v_today, coalesce(v_last_logged + 1, v_today))
      );
    end loop;

    update public.schedules
    set teacher_id = p_successor_teacher_id
    where teacher_id = p_teacher_id
      and event_type = 'replacement'
      and status = 'active'
      and scheduled_date >= v_today
      and not exists (
        select 1 from public.lesson_logs ll where ll.schedule_id = schedules.id
      );
  end if;

  update public.classrooms
  set teacher_id = null
  where teacher_id = p_teacher_id;

  for v_schedule in
    select * from public.schedules
    where teacher_id = p_teacher_id
    for update
  loop
    if not exists (select 1 from public.lesson_logs where schedule_id = v_schedule.id)
      and not exists (select 1 from public.trial_bookings where schedule_id = v_schedule.id) then
      -- No history at all. (trial_bookings would cascade away with it, so a
      -- schedule with bookings is never deleted.)
      delete from public.schedules where id = v_schedule.id;
    elsif v_schedule.status <> 'active' then
      continue;
    elsif v_schedule.event_type = 'regular' then
      if v_schedule.start_recur >= v_today then
        update public.schedules set status = 'cancelled' where id = v_schedule.id;
      elsif v_schedule.end_recur is null or v_schedule.end_recur >= v_today then
        -- End the series instead of cancelling it, so its past classes stay
        -- on the calendar. Keep any class already logged today.
        select max(lesson_date) into v_last_logged
        from public.lesson_logs
        where schedule_id = v_schedule.id;

        update public.schedules
        set end_recur = greatest(v_today - 1, coalesce(v_last_logged, v_today - 1))
        where id = v_schedule.id;
      end if;
    elsif v_schedule.scheduled_date > v_today then
      update public.schedules set status = 'cancelled' where id = v_schedule.id;
    end if;
  end loop;

  begin
    delete from public.teachers where id = p_teacher_id;
  exception
    when foreign_key_violation then
      update public.teachers
      set is_active = false, email = null, phone = null
      where id = p_teacher_id;
      v_retained := true;
  end;

  perform public.record_admin_activity(
    'teacher_deleted',
    'teacher',
    p_teacher_id,
    v_teacher.full_name,
    jsonb_build_object(
      'retained_for_history', v_retained,
      'successor_teacher_id', p_successor_teacher_id
    )
  );

  return v_retained;
end;
$$;

revoke all on function public.reassign_classroom_teacher(bigint, bigint, date) from public, anon;
grant execute on function public.reassign_classroom_teacher(bigint, bigint, date) to authenticated;
revoke all on function public.delete_teacher_account(bigint, bigint) from public, anon;
grant execute on function public.delete_teacher_account(bigint, bigint) to authenticated;
