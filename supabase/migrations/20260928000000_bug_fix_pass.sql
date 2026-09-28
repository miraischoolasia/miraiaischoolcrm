-- Bug-fix pass (2026-09-28).
--
-- 1. Deleting a teacher silently did nothing: teachers, schedules and
--    schedule_students have no DELETE RLS policy, so the client's direct
--    deletes matched 0 rows without an error while the activity log still
--    said "teacher_deleted". delete_teacher_account() now does the whole
--    flow server-side in one transaction.
-- 2. Creating a student was 3-4 separate client calls (create, assign
--    classroom, activity log, convert lead). A failure midway reported an
--    error after the student already existed, so a retry made a duplicate.
--    create_student_record() now takes the classroom and the lead being
--    converted and does everything atomically, activity log included.
-- 3. submit_lesson_attendance() accepted any date: a future day (deducting
--    classes ahead of time), a weekday the class doesn't meet, or the
--    29th-31st that the calendar never shows. It now only accepts a real
--    occurrence on or before today (Malaysia time).
-- 4. A trial-type student has 0 classes, so marking one present took it to
--    -1. Trial students no longer deduct; existing negatives are reset.
-- 5. record_admin_activity() had no role check, so any teacher could write
--    arbitrary audit entries. It is admin-only now (every caller already is).

create or replace function public.record_admin_activity(
  p_action_type text,
  p_entity_type text,
  p_entity_id bigint,
  p_entity_label text,
  p_details jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id bigint;
begin
  if not public.is_admin() then
    raise exception 'Only admins can record admin activity.';
  end if;

  if p_entity_type not in ('student', 'teacher', 'classroom', 'schedule', 'lead') then
    raise exception 'Unsupported activity entity type.';
  end if;

  insert into public.admin_activity_logs (
    actor_teacher_id,
    action_type,
    entity_type,
    entity_id,
    entity_label,
    details
  ) values (
    public.current_teacher_id(),
    trim(p_action_type),
    p_entity_type,
    p_entity_id,
    trim(p_entity_label),
    coalesce(p_details, '{}'::jsonb)
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

drop function if exists public.create_student_record(text, bigint, integer, date, date, date, text, text, text);

create or replace function public.create_student_record(
  p_full_name text,
  p_teacher_id bigint,
  p_initial_hours integer,
  p_lesson_expiry_date date,
  p_account_fee_expiry_date date,
  p_mirai_club_expiry_date date,
  p_notes text,
  p_student_type text default 'regular',
  p_phone text default null,
  p_classroom_id bigint default null,
  p_lead_id bigint default null
)
returns table (
  student_id bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id bigint;
  v_initial_hours integer := greatest(coalesce(p_initial_hours, 0), 0);
  v_student_type text := coalesce(nullif(trim(p_student_type), ''), 'regular');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_full_name text := trim(coalesce(p_full_name, ''));
  v_actor_teacher_id bigint := public.current_teacher_id();
  v_classroom public.classrooms%rowtype;
  v_classroom_id bigint;
  v_teacher_id bigint := p_teacher_id;
  v_lead public.leads%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can create student records.';
  end if;

  if v_full_name = '' then
    raise exception 'Student full name is required.';
  end if;

  if v_student_type not in ('trial', 'preview', 'regular') then
    raise exception 'Invalid student type.';
  end if;

  if v_student_type = 'preview' and v_phone is null then
    raise exception 'Phone number is required for preview students.';
  end if;

  -- A preview student never sits in a classroom.
  if p_classroom_id is not null and v_student_type <> 'preview' then
    select * into v_classroom
    from public.classrooms
    where id = p_classroom_id;

    if not found or v_classroom.status <> 'active' then
      raise exception 'Classroom not found or archived.';
    end if;

    v_classroom_id := v_classroom.id;
    v_teacher_id := v_classroom.teacher_id;
  end if;

  if v_teacher_id is not null and not exists (
    select 1
    from public.teachers
    where id = v_teacher_id
  ) then
    raise exception 'Assigned teacher not found.';
  end if;

  if p_lead_id is not null then
    select * into v_lead
    from public.leads
    where id = p_lead_id
    for update;

    if not found then
      raise exception 'Lead not found.';
    end if;

    if v_lead.converted_student_id is not null then
      raise exception 'This lead was already converted to a student.';
    end if;
  end if;

  insert into public.students (
    teacher_id,
    classroom_id,
    full_name,
    phone,
    remaining_hours,
    lesson_expiry_date,
    account_fee_expiry_date,
    mirai_club_expiry_date,
    notes,
    is_active,
    student_type
  )
  values (
    case when v_student_type = 'preview' then null else v_teacher_id end,
    v_classroom_id,
    v_full_name,
    v_phone,
    case when v_student_type = 'preview' then 0 else v_initial_hours end,
    coalesce(p_lesson_expiry_date, current_date),
    coalesce(p_account_fee_expiry_date, current_date),
    coalesce(p_mirai_club_expiry_date, current_date),
    case
      when v_student_type = 'preview' then null
      else nullif(trim(coalesce(p_notes, '')), '')
    end,
    true,
    v_student_type
  )
  returning id into v_student_id;

  insert into public.student_admin_ledger (
    student_id,
    action_type,
    delta_hours,
    remark,
    actor_teacher_id
  )
  values (
    v_student_id,
    'student_created',
    case when v_student_type = 'preview' then 0 else v_initial_hours end,
    case
      when v_student_type = 'preview' then 'Preview student record created.'
      else coalesce(nullif(trim(coalesce(p_notes, '')), ''), 'Initial student record created.')
    end,
    v_actor_teacher_id
  );

  if v_student_type <> 'preview' then
    insert into public.student_admin_ledger (
      student_id,
      action_type,
      old_date,
      new_date,
      remark,
      actor_teacher_id
    )
    values
      (
        v_student_id,
        'lesson_expiry_updated',
        null,
        p_lesson_expiry_date,
        'Initial lesson expiry set.',
        v_actor_teacher_id
      ),
      (
        v_student_id,
        'account_fee_expiry_updated',
        null,
        p_account_fee_expiry_date,
        'Initial account fee expiry set.',
        v_actor_teacher_id
      ),
      (
        v_student_id,
        'mirai_club_expiry_updated',
        null,
        p_mirai_club_expiry_date,
        'Initial Mirai Club expiry set.',
        v_actor_teacher_id
      );
  end if;

  perform public.record_admin_activity(
    'student_created',
    'student',
    v_student_id,
    v_full_name,
    jsonb_build_object('classroom_id', v_classroom_id, 'student_type', v_student_type)
  );

  if p_lead_id is not null then
    -- The lead keeps its trial_bookings (lead_id), so the new student's
    -- trial history is reachable through leads.converted_student_id.
    update public.leads
    set status = 'converted', converted_student_id = v_student_id
    where id = p_lead_id;

    perform public.record_admin_activity(
      'lead_converted',
      'lead',
      p_lead_id,
      v_full_name,
      jsonb_build_object('student_id', v_student_id)
    );
  end if;

  return query
  select v_student_id;
end;
$$;

-- Deletes a teacher when nothing references it, otherwise archives it
-- (deactivated, contact details cleared) so history stays intact.
-- Classrooms are unassigned; schedules with no history are removed, the
-- rest are cancelled. Returns true when the row was kept (archived).
create or replace function public.delete_teacher_account(
  p_teacher_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher public.teachers%rowtype;
  v_schedule_id bigint;
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

  update public.classrooms
  set teacher_id = null
  where teacher_id = p_teacher_id;

  for v_schedule_id in
    select id from public.schedules where teacher_id = p_teacher_id
  loop
    -- Lesson logs block the delete, and trial_bookings would cascade away
    -- with it (losing a lead's trial history), so either keeps the
    -- schedule as cancelled instead.
    if exists (select 1 from public.lesson_logs where schedule_id = v_schedule_id)
      or exists (select 1 from public.trial_bookings where schedule_id = v_schedule_id) then
      update public.schedules set status = 'cancelled' where id = v_schedule_id;
    else
      delete from public.schedules where id = v_schedule_id;
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
    jsonb_build_object('retained_for_history', v_retained)
  );

  return v_retained;
end;
$$;

-- Trial students deducted to -1 before this fix; they carry no package.
update public.students
set remaining_hours = 0
where student_type = 'trial'
  and remaining_hours < 0;

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
  v_student_type text;
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
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

  -- Attendance is only taken on or after the day of the class, never ahead.
  if p_occurrence_date is null or p_occurrence_date > v_today then
    raise exception 'Attendance can only be taken on or after the day of the class.';
  end if;

  -- The date must be a day this schedule actually meets, matching what the
  -- calendar renders (see buildScheduleEvents in src/lib/schedule.ts):
  -- a weekly class meets on its weekday within its start/end range, and a
  -- regular (non-trial) class never meets on the 29th-31st, which caps it
  -- at 4 classes a month. A replacement class meets only on its own date.
  if v_schedule.event_type = 'regular' then
    if extract(dow from p_occurrence_date)::int <> v_schedule.day_of_week
      or p_occurrence_date < v_schedule.start_recur
      or (v_schedule.end_recur is not null and p_occurrence_date > v_schedule.end_recur)
      or (
        coalesce(v_classroom_category, 'regular') <> 'trial'
        and extract(day from p_occurrence_date)::int >= 29
      ) then
      raise exception 'This class does not run on that date.';
    end if;
  elsif p_occurrence_date <> v_schedule.scheduled_date then
    raise exception 'This class does not run on that date.';
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

  -- A cancelled schedule takes no new attendance, but a lesson already
  -- logged can still be corrected inside its 24-hour window.
  if not found and v_schedule.status <> 'active' then
    raise exception 'This schedule is cancelled.';
  end if;

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

    -- A trial-type student is a per-booking placeholder with no class
    -- package, so attending never deducts from remaining_hours.
    select student_type into v_student_type
    from public.students
    where id = v_student_id;

    v_prev_delta := case when v_prev_status = 'present' then -1 else 0 end;
    v_new_delta := case when v_new_status = 'present' then -1 else 0 end;
    v_net_delta := case
      when v_student_type = 'trial' then 0
      else v_new_delta - v_prev_delta
    end;

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

revoke all on function public.record_admin_activity(text, text, bigint, text, jsonb) from public, anon;
grant execute on function public.record_admin_activity(text, text, bigint, text, jsonb) to authenticated;
revoke all on function public.create_student_record(text, bigint, integer, date, date, date, text, text, text, bigint, bigint) from public, anon;
grant execute on function public.create_student_record(text, bigint, integer, date, date, date, text, text, text, bigint, bigint) to authenticated;
revoke all on function public.delete_teacher_account(bigint) from public, anon;
grant execute on function public.delete_teacher_account(bigint) to authenticated;
revoke all on function public.submit_lesson_attendance(bigint, date, text, jsonb, jsonb) from public, anon;
grant execute on function public.submit_lesson_attendance(bigint, date, text, jsonb, jsonb) to authenticated;
