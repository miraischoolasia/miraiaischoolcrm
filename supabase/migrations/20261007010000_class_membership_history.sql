-- Class membership history: who was in a class on a given day.
--
-- Until now a class's roster was simply the students in it today, so a
-- student who joined in October also showed up in the class's September
-- lessons (and taking attendance for one of those days demanded them and
-- took a class off them), while a student who moved out vanished from the
-- old class's earlier days.
--
-- student_classroom_periods keeps one row per stay in a class:
--   start_date  first day in the class (null = since the class began)
--   end_date    first day no longer in it (null = still in it)
-- A trigger on students keeps it in step with students.classroom_id, so
-- every way of putting a student into a class or taking them out is
-- covered. The first day can be corrected afterwards with
-- set_student_class_start (for a student entered after they started).

create table public.student_classroom_periods (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  classroom_id bigint not null references public.classrooms(id) on delete cascade,
  start_date date,
  end_date date,
  created_at timestamptz not null default timezone('utc', now()),
  constraint student_classroom_periods_dates_check
    check (start_date is null or end_date is null or start_date < end_date)
);

create index student_classroom_periods_classroom_idx
  on public.student_classroom_periods (classroom_id);
create index student_classroom_periods_student_idx
  on public.student_classroom_periods (student_id);
-- A student is in at most one class at a time.
create unique index student_classroom_periods_one_open_idx
  on public.student_classroom_periods (student_id)
  where end_date is null;

alter table public.student_classroom_periods enable row level security;

-- Visible to whoever sees the student or teaches the class.
create policy student_classroom_periods_select_scoped
  on public.student_classroom_periods
  for select
  to authenticated
  using (
    (select public.can_view_classes())
    or exists (select 1 from public.students st where st.id = student_id)
    or classroom_id in (
      select c.id from public.classrooms c
      where c.teacher_id = (select public.current_teacher_id())
    )
  );

revoke all on public.student_classroom_periods from anon;
grant select on public.student_classroom_periods to authenticated;

-- Was the student in the class on that day?
create or replace function public.is_in_classroom_on(p_student_id bigint, p_classroom_id bigint, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_classroom_periods p
    where p.student_id = p_student_id
      and p.classroom_id = p_classroom_id
      and (p.start_date is null or p.start_date <= p_date)
      and (p.end_date is null or p_date < p.end_date)
  );
$$;

-- Everyone in the class on that day.
create or replace function public.classroom_roster_on(p_classroom_id bigint, p_date date)
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.student_id
  from public.student_classroom_periods p
  where p.classroom_id = p_classroom_id
    and (p.start_date is null or p.start_date <= p_date)
    and (p.end_date is null or p_date < p.end_date);
$$;

-- Only used inside other functions.
revoke all on function public.is_in_classroom_on(bigint, bigint, date) from public, anon, authenticated;
revoke all on function public.classroom_roster_on(bigint, date) from public, anon, authenticated;

-- Keeps the history in step with students.classroom_id. Joining or moving
-- counts from today; leaving ends the stay today (a stay that only began
-- today is dropped: the student was never really in that class).
create or replace function public.track_student_classroom()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
begin
  if tg_op = 'UPDATE' then
    if old.classroom_id is not distinct from new.classroom_id then
      return new;
    end if;

    delete from public.student_classroom_periods
    where student_id = new.id
      and end_date is null
      and start_date >= v_today;

    update public.student_classroom_periods
    set end_date = v_today
    where student_id = new.id
      and end_date is null;
  end if;

  if new.classroom_id is not null then
    insert into public.student_classroom_periods (student_id, classroom_id, start_date)
    values (new.id, new.classroom_id, v_today);
  end if;

  return new;
end;
$$;

revoke all on function public.track_student_classroom() from public, anon, authenticated;

-- Backfill from what is known: the activity log records every time a
-- student was put into a class or taken out of one. A student who was there
-- within the class's first week counts as in it since it began (that is
-- when the school's existing students were entered); anyone later counts
-- from the day they were added.
with first_days as (
  select classroom_id, min(start_recur) as first_day
  from public.schedules
  where event_type = 'regular' and classroom_id is not null
  group by classroom_id
),
joins as (
  select
    l.entity_id as student_id,
    coalesce(l.details ->> 'new_classroom_id', l.details ->> 'classroom_id')::bigint as classroom_id,
    (l.created_at at time zone 'Asia/Kuala_Lumpur')::date as day,
    l.created_at
  from public.admin_activity_logs l
  where l.entity_type = 'student'
    and l.action_type in ('student_created', 'student_updated')
    and coalesce(l.details ->> 'new_classroom_id', l.details ->> 'classroom_id') is not null
    and (
      l.action_type = 'student_created'
      or l.details ->> 'previous_classroom_id' is distinct from l.details ->> 'new_classroom_id'
    )
),
leaves as (
  select
    l.entity_id as student_id,
    (l.details ->> 'previous_classroom_id')::bigint as classroom_id,
    (l.created_at at time zone 'Asia/Kuala_Lumpur')::date as day,
    l.created_at
  from public.admin_activity_logs l
  where l.entity_type = 'student'
    and l.action_type = 'student_updated'
    and l.details ->> 'previous_classroom_id' is not null
    and l.details ->> 'previous_classroom_id' is distinct from l.details ->> 'new_classroom_id'
),
stays as (
  -- Classes left earlier.
  select
    lv.student_id,
    lv.classroom_id,
    coalesce(
      (select max(j.day) from joins j
        where j.student_id = lv.student_id
          and j.classroom_id = lv.classroom_id
          and j.created_at < lv.created_at),
      (s.created_at at time zone 'Asia/Kuala_Lumpur')::date
    ) as raw_start,
    lv.day as end_date
  from leaves lv
  join public.students s on s.id = lv.student_id
  union all
  -- The class each student is in now.
  select
    s.id,
    s.classroom_id,
    coalesce(
      (select max(j.day) from joins j
        where j.student_id = s.id and j.classroom_id = s.classroom_id),
      (s.created_at at time zone 'Asia/Kuala_Lumpur')::date
    ),
    null
  from public.students s
  where s.classroom_id is not null
),
resolved as (
  select
    st.student_id,
    st.classroom_id,
    case
      when f.first_day is null or st.raw_start <= f.first_day + 7 then null
      else st.raw_start
    end as start_date,
    st.end_date
  from stays st
  left join first_days f on f.classroom_id = st.classroom_id
  where exists (select 1 from public.classrooms c where c.id = st.classroom_id)
)
insert into public.student_classroom_periods (student_id, classroom_id, start_date, end_date)
select student_id, classroom_id, start_date, end_date
from resolved
where start_date is null or end_date is null or start_date < end_date;

create trigger students_track_classroom
  after insert or update of classroom_id on public.students
  for each row execute function public.track_student_classroom();

-- Corrects the day a student started in their current class, e.g. one
-- entered into the system after they had already started. Null means since
-- the class began. Moves the end of their previous class to match.
create or replace function public.set_student_class_start(p_student_id bigint, p_start_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_current public.student_classroom_periods%rowtype;
  v_previous public.student_classroom_periods%rowtype;
  v_has_previous boolean := false;
begin
  if not public.has_permission('students', 'edit') then
    raise exception 'Your account is not allowed to change this.';
  end if;

  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'Student not found.';
  end if;

  select * into v_current
  from public.student_classroom_periods
  where student_id = p_student_id
    and end_date is null
  for update;
  if not found then
    raise exception 'This student is not in a class.';
  end if;

  if v_current.start_date is not null then
    select * into v_previous
    from public.student_classroom_periods
    where student_id = p_student_id
      and end_date = v_current.start_date
    for update;
    v_has_previous := found;
  end if;

  if v_has_previous then
    if p_start_date is null
      or (v_previous.start_date is not null and p_start_date <= v_previous.start_date) then
      raise exception 'Pick a day after they started their previous class.';
    end if;

    update public.student_classroom_periods
    set end_date = p_start_date
    where id = v_previous.id;
  end if;

  update public.student_classroom_periods
  set start_date = p_start_date
  where id = v_current.id;

  perform public.record_admin_activity(
    'student_class_start_changed',
    'student',
    p_student_id,
    v_student.full_name,
    jsonb_build_object(
      'classroom_id', v_current.classroom_id,
      'previous_start_date', v_current.start_date,
      'new_start_date', p_start_date
    )
  );
end;
$$;

revoke all on function public.set_student_class_start(bigint, date) from public, anon;
grant execute on function public.set_student_class_start(bigint, date) to authenticated;

-- Attendance: the roster of a day is the students in the class that day.
-- Everything else is unchanged from 20261005000000_makeup_day_attendance.sql.

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

revoke all on function public.submit_lesson_attendance(bigint, date, text, jsonb, jsonb) from public, anon;
grant execute on function public.submit_lesson_attendance(bigint, date, text, jsonb, jsonb) to authenticated;

-- Moving one day of a class takes the students who were in it that day.
-- Everything else is unchanged from 20261003000000_account_permissions.sql.

create or replace function public.move_class_occurrence(p_schedule_id bigint, p_from_date date, p_to_date date, p_start_time time without time zone, p_end_time time without time zone, p_reason text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_schedule public.schedules%rowtype;
  v_classroom public.classrooms%rowtype;
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_student_ids bigint[];
  v_new_id bigint;
begin
  if not public.has_permission('calendar', 'edit') then
    raise exception 'Your account is not allowed to move a class.';
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
  where id in (select public.classroom_roster_on(v_classroom.id, p_from_date))
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
$function$;

