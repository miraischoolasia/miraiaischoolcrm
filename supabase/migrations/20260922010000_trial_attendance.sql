-- Wire trial bookings into the existing regular-course point-name
-- (attendance) system per product decision: reuse lesson_logs /
-- lesson_log_students / lesson_log_student_reviews exactly as-is (same UI,
-- same scores/remarks, same 24-hour edit window) rather than build a
-- parallel system. A separate decision keeps bookings non-continuous: a
-- child booked this week is not automatically carried into next week.
--
-- Every attendance-taking path keys off students.id, and a trial-booked
-- child was never a students row. To reuse the same tables/UI untouched,
-- each booking now gets its own lightweight students row:
--   - student_type = 'trial' (an existing type, already understood by the
--     Students dashboard and by getStudentStatus)
--   - classroom_id = null, so it never appears as an ongoing enrollee under
--     My Classroom - the booking, not classroom membership, is the record
--   - remaining_hours = 0, since trial classes are not billed by lesson count
-- One row per booking, not one shared row per child across weeks - matching
-- "no cross-week linking": the same child booked again next week gets a new
-- trial student row with its own, separate attendance record.

alter table public.trial_bookings
  add column if not exists student_id bigint references public.students(id) on delete set null;

create or replace function public.book_trial_slot(
  p_schedule_id bigint,
  p_booking_date date,
  p_child_name text,
  p_child_age integer default null,
  p_phone text default null,
  p_lead_id bigint default null,
  p_notes text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.schedules%rowtype;
  v_classroom public.classrooms%rowtype;
  v_lead public.leads%rowtype;
  v_child_name text := trim(coalesce(p_child_name, ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_lead_id bigint;
  v_children jsonb;
  v_student_id bigint;
  v_booking_id bigint;
begin
  if not public.is_admin() then
    raise exception 'Only admins can book a trial class.';
  end if;

  if v_child_name = '' then
    raise exception 'Child name is required.';
  end if;

  if p_child_age is not null and (p_child_age < 1 or p_child_age > 25) then
    raise exception 'Child age must be between 1 and 25.';
  end if;

  -- FOR SHARE serialises with cancel_schedule_occurrence (FOR UPDATE), so a
  -- day cannot be cancelled and booked at the same moment.
  select * into v_schedule
  from public.schedules
  where id = p_schedule_id
  for share;

  if not found then
    raise exception 'Schedule not found.';
  end if;

  if v_schedule.status <> 'active' or v_schedule.event_type <> 'regular' then
    raise exception 'This is not an active weekly trial slot.';
  end if;

  select * into v_classroom
  from public.classrooms
  where id = v_schedule.classroom_id;

  if not found or v_classroom.category <> 'trial' or v_classroom.status <> 'active' then
    raise exception 'This schedule is not an active trial classroom slot.';
  end if;

  if p_booking_date is null
    or extract(dow from p_booking_date)::int <> v_schedule.day_of_week
    or p_booking_date < v_schedule.start_recur
    or (v_schedule.end_recur is not null and p_booking_date > v_schedule.end_recur) then
    raise exception 'This trial slot does not run on that date.';
  end if;

  if exists (
    select 1 from public.schedule_exceptions
    where schedule_id = p_schedule_id
      and exception_date = p_booking_date
  ) then
    raise exception 'This trial slot is cancelled on that date.';
  end if;

  if exists (
    select 1 from public.trial_bookings
    where schedule_id = p_schedule_id
      and booking_date = p_booking_date
      and lower(child_name) = lower(v_child_name)
      and coalesce(phone, '') = coalesce(v_phone, '')
  ) then
    raise exception 'This child is already booked for that trial slot.';
  end if;

  if p_lead_id is not null then
    select * into v_lead
    from public.leads
    where id = p_lead_id
    for update;

    if not found then
      raise exception 'Lead not found.';
    end if;

    v_lead_id := v_lead.id;
    v_children := v_lead.children;

    -- Attach the child to the lead when it is not on it yet (a lead holds at
    -- most 3 children, and a child needs an age to be stored on a lead).
    if p_child_age is not null
      and jsonb_array_length(v_children) < 3
      and not exists (
        select 1 from jsonb_array_elements(v_children) child
        where lower(trim(coalesce(child ->> 'name', ''))) = lower(v_child_name)
      ) then
      v_children := v_children || jsonb_build_array(
        jsonb_build_object('name', v_child_name, 'age', p_child_age, 'phone', v_phone)
      );
    end if;

    update public.leads
    set
      children = v_children,
      phone = coalesce(phone, v_phone),
      status = case when status in ('new', 'contacted') then 'trial_scheduled' else status end
    where id = v_lead.id;
  else
    -- Not in Leads yet: booking creates the lead so the pipeline stays in sync.
    if p_child_age is null then
      raise exception 'Child age is required to add a new lead.';
    end if;

    insert into public.leads (full_name, phone, source, status, children, notes, added_date)
    values (
      null,
      v_phone,
      'other',
      'trial_scheduled',
      jsonb_build_array(
        jsonb_build_object('name', v_child_name, 'age', p_child_age, 'phone', v_phone)
      ),
      v_notes,
      (timezone('Asia/Kuala_Lumpur', now()))::date
    )
    returning id into v_lead_id;

    perform public.record_admin_activity(
      'lead_created',
      'lead',
      v_lead_id,
      v_child_name,
      jsonb_build_object('source', 'trial_booking')
    );
  end if;

  insert into public.students (
    teacher_id, classroom_id, full_name, phone, remaining_hours,
    lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date,
    notes, is_active, student_type
  )
  values (
    v_schedule.teacher_id, null, v_child_name, v_phone, 0,
    current_date, current_date, current_date,
    v_notes, true, 'trial'
  )
  returning id into v_student_id;

  insert into public.trial_bookings (
    schedule_id, booking_date, lead_id, child_name, child_age, phone, notes, created_by, student_id
  )
  values (
    p_schedule_id,
    p_booking_date,
    v_lead_id,
    v_child_name,
    p_child_age,
    v_phone,
    v_notes,
    public.current_teacher_id(),
    v_student_id
  )
  returning id into v_booking_id;

  perform public.record_admin_activity(
    'trial_booked',
    'schedule',
    p_schedule_id,
    v_classroom.name,
    jsonb_build_object(
      'booking_date', p_booking_date,
      'child_name', v_child_name,
      'lead_id', v_lead_id,
      'student_id', v_student_id
    )
  );

  return v_booking_id;
end;
$$;

create or replace function public.cancel_trial_booking(
  p_booking_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.trial_bookings%rowtype;
  v_label text;
  v_has_attendance boolean;
begin
  if not public.is_admin() then
    raise exception 'Only admins can cancel a trial booking.';
  end if;

  select * into v_booking
  from public.trial_bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Trial booking not found.';
  end if;

  if v_booking.student_id is not null then
    select exists (
      select 1 from public.lesson_log_students where student_id = v_booking.student_id
    ) into v_has_attendance;

    if v_has_attendance then
      raise exception 'Attendance was already recorded for this trial booking, so it cannot be removed.';
    end if;
  end if;

  select c.name into v_label
  from public.schedules s
  left join public.classrooms c on c.id = s.classroom_id
  where s.id = v_booking.schedule_id;

  delete from public.trial_bookings where id = p_booking_id;

  if v_booking.student_id is not null then
    -- Only reachable when the guard above found no attendance, so this never
    -- hits the lesson_log_students "on delete restrict" FK.
    delete from public.students where id = v_booking.student_id;
  end if;

  perform public.record_admin_activity(
    'trial_booking_cancelled',
    'schedule',
    v_booking.schedule_id,
    coalesce(v_label, 'Trial slot'),
    jsonb_build_object(
      'booking_date', v_booking.booking_date,
      'child_name', v_booking.child_name,
      'lead_id', v_booking.lead_id
    )
  );
end;
$$;

-- Attendance roster for a trial slot's occurrence comes from trial_bookings
-- (scoped to that exact schedule_id + date), not from students.classroom_id
-- (which is always empty for a trial classroom - bookings never set it) and
-- not from schedule_students (which has no per-occurrence date, so it can't
-- express "different children each week" for a weekly-recurring slot).
create or replace function public.submit_lesson_attendance(
  p_schedule_id bigint,
  p_occurrence_date date,
  p_lesson_remark text,
  p_attendance jsonb,
  p_student_reviews jsonb default '[]'::jsonb
)
returns table (
  lesson_log_id bigint,
  revision_number integer,
  updated_student_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.schedules%rowtype;
  v_classroom_category text;
  v_teacher_id bigint := public.current_teacher_id();
  v_is_admin boolean := public.is_admin();
  v_previous_log public.lesson_logs%rowtype;
  v_expected_student_ids bigint[] := '{}'::bigint[];
  v_submitted_student_ids bigint[] := '{}'::bigint[];
  v_next_revision integer := 1;
  v_new_log_id bigint;
  v_updated_count integer := 0;
  v_item jsonb;
  v_review jsonb;
  v_student_id bigint;
  v_new_status text;
  v_prev_status text;
  v_prev_delta integer;
  v_new_delta integer;
  v_net_delta integer;
  v_logical_thinking_score smallint;
  v_logical_thinking_remark text;
  v_coding_creativity_score smallint;
  v_coding_creativity_remark text;
  v_problem_solving_score smallint;
  v_problem_solving_remark text;
  v_expressiveness_score smallint;
  v_expressiveness_remark text;
  v_sustained_focus_score smallint;
  v_sustained_focus_remark text;
begin
  if v_teacher_id is null and not v_is_admin then
    raise exception 'No active teacher profile for this account.';
  end if;

  select *
  into v_schedule
  from public.schedules
  where id = p_schedule_id;

  if not found then
    raise exception 'Schedule not found.';
  end if;

  if v_schedule.classroom_id is not null then
    select category into v_classroom_category
    from public.classrooms
    where id = v_schedule.classroom_id;
  end if;

  if not v_is_admin and v_schedule.teacher_id <> v_teacher_id then
    raise exception 'Teacher can only submit attendance for assigned schedules.';
  end if;

  if jsonb_typeof(p_attendance) <> 'array' then
    raise exception 'Attendance payload must be an array.';
  end if;

  if jsonb_typeof(p_student_reviews) <> 'array' then
    raise exception 'Student reviews payload must be an array.';
  end if;

  select *
  into v_previous_log
  from public.lesson_logs
  where schedule_id = p_schedule_id
    and lesson_date = p_occurrence_date
  order by revision_number desc
  limit 1;

  if found then
    if timezone('utc', now()) > v_previous_log.submitted_at + interval '24 hours' then
      raise exception 'Attendance can only be modified within 24 hours.';
    end if;

    v_next_revision := v_previous_log.revision_number + 1;

    select coalesce(array_agg(student_id order by student_id), '{}'::bigint[])
    into v_expected_student_ids
    from public.lesson_log_students
    where lesson_log_id = v_previous_log.id;
  elsif v_schedule.event_type = 'regular' then
    if v_classroom_category = 'trial' then
      select coalesce(array_agg(student_id order by student_id), '{}'::bigint[])
      into v_expected_student_ids
      from public.trial_bookings
      where schedule_id = p_schedule_id
        and booking_date = p_occurrence_date
        and student_id is not null;
    else
      select coalesce(array_agg(id order by id), '{}'::bigint[])
      into v_expected_student_ids
      from public.students
      where classroom_id = v_schedule.classroom_id;
    end if;
  else
    select coalesce(array_agg(student_id order by student_id), '{}'::bigint[])
    into v_expected_student_ids
    from public.schedule_students
    where schedule_id = p_schedule_id
      and is_active = true;
  end if;

  if cardinality(v_expected_student_ids) = 0 then
    raise exception 'This class has no students assigned.';
  end if;

  select coalesce(array_agg(student_id order by student_id), '{}'::bigint[])
  into v_submitted_student_ids
  from (
    select distinct (value ->> 'student_id')::bigint as student_id
    from jsonb_array_elements(p_attendance)
  ) submitted;

  if jsonb_array_length(p_attendance) <> cardinality(v_expected_student_ids)
    or v_submitted_student_ids <> v_expected_student_ids then
    raise exception 'Attendance must include every student in the lesson roster exactly once.';
  end if;

  insert into public.lesson_logs (
    schedule_id,
    teacher_id,
    lesson_date,
    lesson_remark,
    revision_number,
    parent_log_id
  )
  values (
    p_schedule_id,
    v_schedule.teacher_id,
    p_occurrence_date,
    p_lesson_remark,
    v_next_revision,
    case when v_next_revision > 1 then v_previous_log.id else null end
  )
  returning id into v_new_log_id;

  for v_item in
    select value from jsonb_array_elements(p_attendance)
  loop
    v_student_id := (v_item ->> 'student_id')::bigint;
    v_new_status := v_item ->> 'status';

    if v_new_status not in ('present', 'absent', 'leave') then
      raise exception 'Invalid attendance status for student %', v_student_id;
    end if;

    if v_schedule.event_type = 'regular' then
      if v_classroom_category = 'trial' then
        if not exists (
          select 1
          from public.trial_bookings tb
          where tb.schedule_id = p_schedule_id
            and tb.booking_date = p_occurrence_date
            and tb.student_id = v_student_id
        ) then
          raise exception 'Student % is not booked for this trial slot.', v_student_id;
        end if;
      elsif not exists (
        select 1
        from public.students st
        where st.id = v_student_id
          and st.classroom_id = v_schedule.classroom_id
      ) then
        raise exception 'Student % is not assigned to this regular classroom.', v_student_id;
      end if;
    elsif not exists (
      select 1
      from public.schedule_students ss
      where ss.schedule_id = p_schedule_id
        and ss.student_id = v_student_id
        and ss.is_active = true
    ) then
      raise exception 'Student % is not assigned to this replacement schedule.', v_student_id;
    end if;

    insert into public.lesson_log_students (
      lesson_log_id,
      student_id,
      attendance_status
    )
    values (
      v_new_log_id,
      v_student_id,
      v_new_status
    );

    if v_next_revision > 1 then
      select attendance_status
      into v_prev_status
      from public.lesson_log_students
      where lesson_log_id = v_previous_log.id
        and student_id = v_student_id;
    else
      v_prev_status := null;
    end if;

    v_prev_delta := case when v_prev_status = 'present' then -1 else 0 end;
    v_new_delta := case when v_new_status = 'present' then -1 else 0 end;
    v_net_delta := v_new_delta - v_prev_delta;

    if v_new_status = 'present' then
      select value
      into v_review
      from jsonb_array_elements(p_student_reviews)
      where (value ->> 'student_id')::bigint = v_student_id
      limit 1;

      if v_review is null then
        raise exception 'Missing student review for student %.', v_student_id;
      end if;

      v_logical_thinking_score := (v_review ->> 'logicalThinkingScore')::smallint;
      v_logical_thinking_remark := nullif(trim(coalesce(v_review ->> 'logicalThinkingRemark', '')), '');
      v_coding_creativity_score := (v_review ->> 'codingCreativityScore')::smallint;
      v_coding_creativity_remark := nullif(trim(coalesce(v_review ->> 'codingCreativityRemark', '')), '');
      v_problem_solving_score := (v_review ->> 'problemSolvingScore')::smallint;
      v_problem_solving_remark := nullif(trim(coalesce(v_review ->> 'problemSolvingRemark', '')), '');
      v_expressiveness_score := (v_review ->> 'expressivenessScore')::smallint;
      v_expressiveness_remark := nullif(trim(coalesce(v_review ->> 'expressivenessRemark', '')), '');
      v_sustained_focus_score := (v_review ->> 'sustainedFocusScore')::smallint;
      v_sustained_focus_remark := nullif(trim(coalesce(v_review ->> 'sustainedFocusRemark', '')), '');

      if v_logical_thinking_score is null or v_logical_thinking_score not between 1 and 5 then
        raise exception 'Logical thinking score must be between 1 and 5 for student %.', v_student_id;
      end if;
      if v_coding_creativity_score is null or v_coding_creativity_score not between 1 and 5 then
        raise exception 'Coding creativity score must be between 1 and 5 for student %.', v_student_id;
      end if;
      if v_problem_solving_score is null or v_problem_solving_score not between 1 and 5 then
        raise exception 'Problem solving score must be between 1 and 5 for student %.', v_student_id;
      end if;
      if v_expressiveness_score is null or v_expressiveness_score not between 1 and 5 then
        raise exception 'Expressiveness score must be between 1 and 5 for student %.', v_student_id;
      end if;
      if v_sustained_focus_score is null or v_sustained_focus_score not between 1 and 5 then
        raise exception 'Sustained focus score must be between 1 and 5 for student %.', v_student_id;
      end if;

      if v_logical_thinking_score <= 2 and v_logical_thinking_remark is null then
        raise exception 'Logical thinking remark is required for low score on student %.', v_student_id;
      end if;
      if v_coding_creativity_score <= 2 and v_coding_creativity_remark is null then
        raise exception 'Coding creativity remark is required for low score on student %.', v_student_id;
      end if;
      if v_problem_solving_score <= 2 and v_problem_solving_remark is null then
        raise exception 'Problem solving remark is required for low score on student %.', v_student_id;
      end if;
      if v_expressiveness_score <= 2 and v_expressiveness_remark is null then
        raise exception 'Expressiveness remark is required for low score on student %.', v_student_id;
      end if;
      if v_sustained_focus_score <= 2 and v_sustained_focus_remark is null then
        raise exception 'Sustained focus remark is required for low score on student %.', v_student_id;
      end if;

      insert into public.lesson_log_student_reviews (
        lesson_log_id,
        student_id,
        logical_thinking_score,
        logical_thinking_remark,
        coding_creativity_score,
        coding_creativity_remark,
        problem_solving_score,
        problem_solving_remark,
        expressiveness_score,
        expressiveness_remark,
        sustained_focus_score,
        sustained_focus_remark
      )
      values (
        v_new_log_id,
        v_student_id,
        v_logical_thinking_score,
        v_logical_thinking_remark,
        v_coding_creativity_score,
        v_coding_creativity_remark,
        v_problem_solving_score,
        v_problem_solving_remark,
        v_expressiveness_score,
        v_expressiveness_remark,
        v_sustained_focus_score,
        v_sustained_focus_remark
      );
    end if;

    if v_net_delta <> 0 then
      update public.students
      set remaining_hours = remaining_hours + v_net_delta
      where id = v_student_id;

      insert into public.student_lesson_ledger (
        student_id,
        lesson_log_id,
        delta_lessons,
        reason
      )
      values (
        v_student_id,
        v_new_log_id,
        v_net_delta,
        case
          when v_net_delta = -1 then 'attendance_present_deduction'
          when v_net_delta = 1 then 'attendance_revision_reversal'
          else 'attendance_adjustment'
        end
      );

      v_updated_count := v_updated_count + 1;
    end if;
  end loop;

  return query
  select v_new_log_id, v_next_revision, v_updated_count;
end;
$$;

-- Backfill: a booking made before this migration has no linked student yet.
-- Give each one the same trial-type student a fresh booking would get, so it
-- becomes attendance-capable too instead of being silently stuck.
do $$
declare
  v_row record;
  v_student_id bigint;
begin
  for v_row in
    select tb.id as booking_id, tb.child_name, tb.phone, tb.notes, s.teacher_id
    from public.trial_bookings tb
    join public.schedules s on s.id = tb.schedule_id
    where tb.student_id is null
  loop
    insert into public.students (
      teacher_id, classroom_id, full_name, phone, remaining_hours,
      lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date,
      notes, is_active, student_type
    )
    values (
      v_row.teacher_id, null, v_row.child_name, v_row.phone, 0,
      current_date, current_date, current_date,
      v_row.notes, true, 'trial'
    )
    returning id into v_student_id;

    update public.trial_bookings
    set student_id = v_student_id
    where id = v_row.booking_id;
  end loop;
end $$;

revoke all on function public.submit_lesson_attendance(bigint, date, text, jsonb, jsonb) from public, anon;
grant execute on function public.submit_lesson_attendance(bigint, date, text, jsonb, jsonb) to authenticated;
revoke all on function public.book_trial_slot(bigint, date, text, integer, text, bigint, text) from public, anon;
grant execute on function public.book_trial_slot(bigint, date, text, integer, text, bigint, text) to authenticated;
revoke all on function public.cancel_trial_booking(bigint) from public, anon;
grant execute on function public.cancel_trial_booking(bigint) to authenticated;
