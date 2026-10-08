-- A lesson remark for each student, not one for the whole class.
--
-- Until now the teacher wrote a single class-wide "Lesson Remark" when taking
-- attendance. Each present student's review now carries their own, so the
-- progress / homework note sits with the child it is about. It lives on the
-- review row (lesson_log_student_reviews.lesson_remark), next to the scores.
--
-- lesson_logs.lesson_remark stays: older lessons keep their class note, and an
-- edit of such a lesson carries it along unchanged.
-- Everything else is unchanged from 20261008010000_late_feedback_edit.sql.

alter table public.lesson_log_student_reviews
  add column if not exists lesson_remark text;

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
#variable_conflict use_column
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
  v_is_makeup_day boolean := false;
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
  v_lesson_remark text;
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
    -- The 29th-31st are only a class day when a make-up session lands there.
    v_is_makeup_day :=
      coalesce(v_classroom_category, 'regular') <> 'trial'
      and extract(day from p_occurrence_date)::int >= 29
      and exists (
        select 1
        from public.makeup_sessions ms
        join public.makeup_plans mp on mp.id = ms.plan_id
        where mp.classroom_id = v_schedule.classroom_id
          and ms.session_date = p_occurrence_date
      );

    if extract(dow from p_occurrence_date)::int <> v_schedule.day_of_week
      or p_occurrence_date < v_schedule.start_recur
      or (v_schedule.end_recur is not null and p_occurrence_date > v_schedule.end_recur)
      or (
        coalesce(v_classroom_category, 'regular') <> 'trial'
        and extract(day from p_occurrence_date)::int >= 29
        and not v_is_makeup_day
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
    -- Past the 24 hours only while an admin has late editing switched on.
    if timezone('utc', now()) > v_previous_log.submitted_at + interval '24 hours'
      and not public.late_feedback_edit_open() then
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
    elsif v_is_makeup_day then
      -- A whole-class session brings the whole class; otherwise only the
      -- students whose own make-up plans have a session that day.
      if exists (
        select 1
        from public.makeup_sessions ms
        join public.makeup_plans mp on mp.id = ms.plan_id
        where mp.classroom_id = v_schedule.classroom_id
          and ms.session_date = p_occurrence_date
          and mp.student_id is null
      ) then
        select coalesce(array_agg(id order by id), '{}'::bigint[])
        into v_expected_student_ids
        from public.classroom_roster_on(v_schedule.classroom_id, p_occurrence_date) as roster(id);
      else
        select coalesce(array_agg(student_id order by student_id), '{}'::bigint[])
        into v_expected_student_ids
        from (
          select distinct mp.student_id
          from public.makeup_sessions ms
          join public.makeup_plans mp on mp.id = ms.plan_id
          where mp.classroom_id = v_schedule.classroom_id
            and ms.session_date = p_occurrence_date
            and mp.student_id is not null
            and public.is_in_classroom_on(mp.student_id, v_schedule.classroom_id, p_occurrence_date)
        ) makeup_students;
      end if;
    else
      select coalesce(array_agg(id order by id), '{}'::bigint[])
      into v_expected_student_ids
      from public.classroom_roster_on(v_schedule.classroom_id, p_occurrence_date) as roster(id);
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
      elsif not public.is_in_classroom_on(v_student_id, v_schedule.classroom_id, p_occurrence_date) then
        raise exception 'Student % was not in this class on that date.', v_student_id;
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
      when v_is_makeup_day then 0
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
      v_lesson_remark := nullif(trim(coalesce(v_review ->> 'lessonRemark', '')), '');

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
        sustained_focus_remark,
        lesson_remark
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
        v_sustained_focus_remark,
        v_lesson_remark
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

revoke all on function public.submit_lesson_attendance(bigint, date, text, jsonb, jsonb) from public, anon;
grant execute on function public.submit_lesson_attendance(bigint, date, text, jsonb, jsonb) to authenticated;
