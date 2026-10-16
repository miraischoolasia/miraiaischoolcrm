-- Attendance takes each school's own review criteria (step 2 of the review
-- criteria work, after 20261021110000_review_criteria.sql).
--
-- submit_lesson_attendance: a present student's review now carries
--   {"student_id", "lessonRemark", "scores": [{"criterion_id", "score", "remark"}]}.
-- Every switched-on criterion needs a score from 1 to its top score, and a
-- remark when the score is at or below its threshold. A page opened before
-- this change still sends the five fixed keys; they are mapped to the five
-- criteria that came from the old columns. Those old columns keep being
-- filled for those five criteria.
-- Everything else is unchanged from 20261010000000_per_student_lesson_remark.sql.

-- The name the attendance form has always shown.
update public.review_criteria
set name = 'Logical & Algorithmic Thinking'
where legacy_key = 'logical_thinking' and name = 'Logical Thinking';

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
  v_scores jsonb;
  v_score jsonb;
  v_score_value smallint;
  v_score_remark text;
  v_criterion public.review_criteria%rowtype;
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

      -- Scores come as [{criterion_id, score, remark}]. A page opened before
      -- review criteria existed still sends the five fixed keys
      -- (logicalThinkingScore, ...); those map to the criteria that came from
      -- the old columns.
      if v_review ? 'scores' then
        v_scores := v_review -> 'scores';
      else
        select coalesce(jsonb_agg(jsonb_build_object(
          'criterion_id', c.id,
          'score', v_review ->> (k.camel || 'Score'),
          'remark', v_review ->> (k.camel || 'Remark')
        )), '[]'::jsonb)
        into v_scores
        from public.review_criteria c
        join (values
          ('logical_thinking', 'logicalThinking'),
          ('coding_creativity', 'codingCreativity'),
          ('problem_solving', 'problemSolving'),
          ('expressiveness', 'expressiveness'),
          ('sustained_focus', 'sustainedFocus')
        ) as k(legacy_key, camel) on k.legacy_key = c.legacy_key
        where v_review ? (k.camel || 'Score');
      end if;

      if jsonb_typeof(v_scores) <> 'array' then
        raise exception 'Review scores must be an array for student %.', v_student_id;
      end if;

      if (select count(*) from jsonb_array_elements(v_scores))
        <> (select count(distinct value ->> 'criterion_id') from jsonb_array_elements(v_scores)) then
        raise exception 'A review criterion is scored twice for student %.', v_student_id;
      end if;

      -- Every criterion that is switched on needs a score.
      for v_criterion in
        select * from public.review_criteria where is_active order by sort_order, id
      loop
        if not exists (
          select 1 from jsonb_array_elements(v_scores) s
          where (s.value ->> 'criterion_id')::bigint = v_criterion.id
        ) then
          raise exception 'Please rate % for student %.', v_criterion.name, v_student_id;
        end if;
      end loop;

      -- A criterion switched off since may still be scored (editing an older
      -- lesson keeps what it had).
      for v_score in select value from jsonb_array_elements(v_scores)
      loop
        select * into v_criterion
        from public.review_criteria
        where id = (v_score ->> 'criterion_id')::bigint;
        if not found then
          raise exception 'Unknown review criterion for student %.', v_student_id;
        end if;

        v_score_value := (v_score ->> 'score')::smallint;
        if v_score_value is null or v_score_value < 1 or v_score_value > v_criterion.max_score then
          raise exception '% score must be between 1 and % for student %.',
            v_criterion.name, v_criterion.max_score, v_student_id;
        end if;

        v_score_remark := nullif(trim(coalesce(v_score ->> 'remark', '')), '');
        if v_score_value <= v_criterion.remark_required_at_or_below and v_score_remark is null then
          raise exception '% remark is required for a low score on student %.', v_criterion.name, v_student_id;
        end if;
      end loop;

      v_lesson_remark := nullif(trim(coalesce(v_review ->> 'lessonRemark', '')), '');

      -- The old columns are still filled for the criteria that came from
      -- them, so anything reading them keeps working.
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
      select
        v_new_log_id,
        v_student_id,
        max(case when c.legacy_key = 'logical_thinking' then (s.value ->> 'score')::smallint end),
        max(case when c.legacy_key = 'logical_thinking' then nullif(trim(coalesce(s.value ->> 'remark', '')), '') end),
        max(case when c.legacy_key = 'coding_creativity' then (s.value ->> 'score')::smallint end),
        max(case when c.legacy_key = 'coding_creativity' then nullif(trim(coalesce(s.value ->> 'remark', '')), '') end),
        max(case when c.legacy_key = 'problem_solving' then (s.value ->> 'score')::smallint end),
        max(case when c.legacy_key = 'problem_solving' then nullif(trim(coalesce(s.value ->> 'remark', '')), '') end),
        max(case when c.legacy_key = 'expressiveness' then (s.value ->> 'score')::smallint end),
        max(case when c.legacy_key = 'expressiveness' then nullif(trim(coalesce(s.value ->> 'remark', '')), '') end),
        max(case when c.legacy_key = 'sustained_focus' then (s.value ->> 'score')::smallint end),
        max(case when c.legacy_key = 'sustained_focus' then nullif(trim(coalesce(s.value ->> 'remark', '')), '') end),
        v_lesson_remark
      from jsonb_array_elements(v_scores) s
      left join public.review_criteria c on c.id = (s.value ->> 'criterion_id')::bigint;

      -- The copy trigger has written the criteria that came from the old
      -- columns; this writes the rest.
      insert into public.lesson_review_scores (lesson_log_id, student_id, criterion_id, score, remark)
      select
        v_new_log_id,
        v_student_id,
        (s.value ->> 'criterion_id')::bigint,
        (s.value ->> 'score')::smallint,
        nullif(trim(coalesce(s.value ->> 'remark', '')), '')
      from jsonb_array_elements(v_scores) s
      on conflict (lesson_log_id, student_id, criterion_id) do nothing;
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
