-- Who may take attendance: the class's teacher and admin, and now (decided
-- 2026-10-19) the class's assistants and the day's substitute teacher.
--
-- * Assistant: anyone else listed as teaching the class (classroom_teachers,
--   20261023200000_class_teachers.sql). Nothing new to set up.
-- * Substitute: lesson_substitutes, one teacher for one day of one class
--   (schedule + date). Whoever may edit classes sets it, from the class's
--   attendance window. It is for that day only.
-- * Each school chooses: app_settings 'attendance_takers'
--   {"assistants": true, "substitutes": true}. Both on by default; the class
--   teacher and admin can always take attendance.
-- * can_take_attendance(schedule, date) is the one rule; submit_lesson_attendance
--   and points given in a lesson (award_points) use it, and the CRM page
--   mirrors it (src/lib/attendanceTakers.ts).
-- * A teacher now sees the timetable, bookings, make-ups and attendance of
--   every class they teach (not only where they are the main teacher), and of
--   the days they cover; and the students of those lessons.
-- * lesson_logs.submitted_by records who took it; teacher_id stays the
--   class's teacher, so reports and counts are unchanged.
-- * The 24-hour lock and the late-editing switch apply to everyone alike.

-- ---------------------------------------------------------------------------
-- The school's switches

insert into public.app_settings (key, value)
values ('attendance_takers', '{"assistants": true, "substitutes": true}'::jsonb)
on conflict (key) do nothing;

create or replace function public.attendance_taker_rule(p_rule text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (value ->> p_rule)::boolean from public.app_settings where key = 'attendance_takers'),
    true
  );
$$;

revoke all on function public.attendance_taker_rule(text) from public, anon;
grant execute on function public.attendance_taker_rule(text) to authenticated;

create or replace function public.set_attendance_takers(p_assistants boolean, p_substitutes boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can change who takes attendance.';
  end if;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values (
    'attendance_takers',
    jsonb_build_object('assistants', coalesce(p_assistants, true), 'substitutes', coalesce(p_substitutes, true)),
    timezone('utc', now()),
    public.current_teacher_id()
  )
  on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  perform public.record_admin_activity(
    'attendance_takers_changed',
    'schedule',
    null,
    'Who takes attendance',
    jsonb_build_object('assistants', coalesce(p_assistants, true), 'substitutes', coalesce(p_substitutes, true))
  );
end;
$$;

revoke all on function public.set_attendance_takers(boolean, boolean) from public, anon;
grant execute on function public.set_attendance_takers(boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Substitute teachers

create table public.lesson_substitutes (
  schedule_id bigint not null references public.schedules (id) on delete cascade,
  lesson_date date not null,
  teacher_id bigint not null references public.teachers (id) on delete cascade,
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (schedule_id, lesson_date)
);

create index lesson_substitutes_teacher_idx on public.lesson_substitutes (teacher_id, lesson_date);

-- Staff accounts do not teach (same rule as a class's teachers).
create trigger lesson_substitutes_ensure_teaching_account
before insert or update of teacher_id on public.lesson_substitutes
for each row execute function public.ensure_teaching_account();

alter table public.lesson_substitutes enable row level security;
revoke all on public.lesson_substitutes from public, anon, authenticated;
grant select on public.lesson_substitutes to authenticated;
grant all on public.lesson_substitutes to service_role;

-- The lessons this login covers.
create or replace function public.my_substitute_lessons()
returns table (schedule_id bigint, lesson_date date)
language sql
stable
security definer
set search_path = public
as $$
  select ls.schedule_id, ls.lesson_date
  from public.lesson_substitutes ls
  where ls.teacher_id = public.current_teacher_id();
$$;

revoke all on function public.my_substitute_lessons() from public, anon;
grant execute on function public.my_substitute_lessons() to authenticated;

-- The classes of the lessons this login covers.
create or replace function public.my_substitute_classroom_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select distinct s.classroom_id
  from public.lesson_substitutes ls
  join public.schedules s on s.id = ls.schedule_id
  where ls.teacher_id = public.current_teacher_id()
    and s.classroom_id is not null;
$$;

revoke all on function public.my_substitute_classroom_ids() from public, anon;
grant execute on function public.my_substitute_classroom_ids() to authenticated;

-- The timetable entries of every class this login teaches: as its main
-- teacher, the schedule's teacher, or one of its teachers (assistant).
create or replace function public.my_schedule_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.schedules s
  where s.teacher_id = public.current_teacher_id()
     or s.classroom_id in (select public.my_classroom_ids());
$$;

revoke all on function public.my_schedule_ids() from public, anon;
grant execute on function public.my_schedule_ids() to authenticated;

-- May this login take attendance for this class on this day?
create or replace function public.can_take_attendance(p_schedule_id bigint, p_lesson_date date)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_teacher_id bigint := public.current_teacher_id();
  v_schedule public.schedules%rowtype;
begin
  if public.is_admin() then
    return true;
  end if;
  if v_teacher_id is null then
    return false;
  end if;

  select * into v_schedule from public.schedules where id = p_schedule_id;
  if not found then
    return false;
  end if;

  if v_schedule.teacher_id = v_teacher_id then
    return true;
  end if;

  if public.attendance_taker_rule('assistants')
    and v_schedule.classroom_id is not null
    and v_schedule.classroom_id in (select public.my_classroom_ids()) then
    return true;
  end if;

  return public.attendance_taker_rule('substitutes')
    and exists (
      select 1 from public.lesson_substitutes ls
      where ls.schedule_id = p_schedule_id
        and ls.lesson_date = p_lesson_date
        and ls.teacher_id = v_teacher_id
    );
end;
$$;

revoke all on function public.can_take_attendance(bigint, date) from public, anon;
grant execute on function public.can_take_attendance(bigint, date) to authenticated;

-- Set (or with p_teacher_id null, clear) the substitute for one class day.
-- Whoever may edit classes. The class's own teacher needs no substitute row.
create or replace function public.set_lesson_substitute(p_schedule_id bigint, p_lesson_date date, p_teacher_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.schedules%rowtype;
  v_name text;
begin
  if not public.can_edit_classes() then
    raise exception 'Only staff who may edit classes can set a substitute teacher.';
  end if;

  select * into v_schedule from public.schedules where id = p_schedule_id;
  if not found or p_lesson_date is null then
    raise exception 'Class not found.';
  end if;

  if p_teacher_id is null or p_teacher_id = v_schedule.teacher_id then
    delete from public.lesson_substitutes
    where schedule_id = p_schedule_id and lesson_date = p_lesson_date;
  else
    if not exists (
      select 1 from public.teachers t
      where t.id = p_teacher_id and t.is_active and t.role <> 'staff'
    ) then
      raise exception 'Only an active teaching account can cover a class.';
    end if;

    -- Only a day the class meets, or one that already has attendance.
    if not public.schedule_meets_on(p_schedule_id, p_lesson_date)
      and not exists (
        select 1 from public.lesson_logs l
        where l.schedule_id = p_schedule_id and l.lesson_date = p_lesson_date
      ) then
      raise exception 'This class does not run on that date.';
    end if;

    insert into public.lesson_substitutes (schedule_id, lesson_date, teacher_id, created_by)
    values (p_schedule_id, p_lesson_date, p_teacher_id, public.current_teacher_id())
    on conflict (schedule_id, lesson_date) do update
      set teacher_id = excluded.teacher_id,
          created_by = excluded.created_by,
          created_at = timezone('utc', now());
  end if;

  select full_name into v_name from public.teachers where id = p_teacher_id;
  perform public.record_admin_activity(
    case when p_teacher_id is null then 'lesson_substitute_cleared' else 'lesson_substitute_set' end,
    'schedule',
    p_schedule_id,
    coalesce(v_schedule.title, 'Class') || ' on ' || to_char(p_lesson_date, 'DD Mon YYYY'),
    jsonb_build_object('lesson_date', p_lesson_date, 'teacher_id', p_teacher_id, 'teacher_name', v_name)
  );
end;
$$;

revoke all on function public.set_lesson_substitute(bigint, date, bigint) from public, anon;
grant execute on function public.set_lesson_substitute(bigint, date, bigint) to authenticated;

-- Staff who see classes see every substitute; a teacher sees those of the
-- classes they teach and their own.
create policy lesson_substitutes_select_scoped
  on public.lesson_substitutes for select to authenticated
  using (
    (select public.can_view_classes())
    or teacher_id = (select public.current_teacher_id())
    or schedule_id in (select public.my_schedule_ids())
  );

-- ---------------------------------------------------------------------------
-- Who took the attendance

alter table public.lesson_logs
  add column if not exists submitted_by bigint references public.teachers (id) on delete set null;

-- The attendance this login may read: classes they teach (any of their
-- teachers) and the days they cover.
create or replace function public.my_lesson_log_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select l.id
  from public.lesson_logs l
  where l.teacher_id = public.current_teacher_id()
     or l.schedule_id in (select public.my_schedule_ids())
     or (l.schedule_id, l.lesson_date) in (select * from public.my_substitute_lessons());
$$;

revoke all on function public.my_lesson_log_ids() from public, anon;
grant execute on function public.my_lesson_log_ids() to authenticated;

-- Students this login meets in lessons beyond their classes' own students:
-- trial bookings and replacement-class students of the classes they teach,
-- and everyone in the lessons they cover (the class that day, its trial
-- bookings, its replacement students, anyone in its attendance).
create or replace function public.my_lesson_student_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select tb.student_id from public.trial_bookings tb
  where tb.student_id is not null
    and (
      tb.schedule_id in (select public.my_schedule_ids())
      or (tb.schedule_id, tb.booking_date) in (select * from public.my_substitute_lessons())
    )
  union
  select ss.student_id from public.schedule_students ss
  where ss.schedule_id in (select public.my_schedule_ids())
     or ss.schedule_id in (select m.schedule_id from public.my_substitute_lessons() m)
  union
  select r.id
  from public.my_substitute_lessons() m
  join public.schedules s on s.id = m.schedule_id
  cross join lateral public.classroom_roster_on(s.classroom_id, m.lesson_date) as r(id)
  where s.classroom_id is not null
  union
  select lls.student_id from public.lesson_log_students lls
  where lls.lesson_log_id in (select public.my_lesson_log_ids());
$$;

revoke all on function public.my_lesson_student_ids() from public, anon;
grant execute on function public.my_lesson_student_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- What a teacher sees now follows every class they teach and every day they
-- cover. Each policy keeps what it allowed before and adds that.

drop policy classrooms_select_scoped on public.classrooms;
create policy classrooms_select_scoped
  on public.classrooms for select to authenticated
  using (
    (select public.can_view_classes())
    or id in (select public.my_classroom_ids())
    or id in (select public.my_substitute_classroom_ids())
  );

drop policy schedules_select_scoped on public.schedules;
create policy schedules_select_scoped on public.schedules
for select to authenticated
using (
  teacher_id = (select public.current_teacher_id())
  or (select public.can_view_classes())
  or id in (select public.my_schedule_ids())
  or id in (select m.schedule_id from public.my_substitute_lessons() m)
);

drop policy schedule_students_select_scoped on public.schedule_students;
create policy schedule_students_select_scoped on public.schedule_students
for select to authenticated
using (
  (select public.can_view_classes())
  or schedule_id in (select public.my_schedule_ids())
  or schedule_id in (select m.schedule_id from public.my_substitute_lessons() m)
);

drop policy schedule_exceptions_select_scoped on public.schedule_exceptions;
create policy schedule_exceptions_select_scoped on public.schedule_exceptions
for select to authenticated
using (
  (select public.can_view_classes())
  or schedule_id in (select public.my_schedule_ids())
  or schedule_id in (select m.schedule_id from public.my_substitute_lessons() m)
);

drop policy trial_bookings_select_scoped on public.trial_bookings;
create policy trial_bookings_select_scoped on public.trial_bookings
for select to authenticated
using (
  (select public.can_view_classes())
  or schedule_id in (select public.my_schedule_ids())
  or (schedule_id, booking_date) in (select * from public.my_substitute_lessons())
);

drop policy makeup_plans_select_scoped on public.makeup_plans;
create policy makeup_plans_select_scoped on public.makeup_plans
for select to authenticated
using (
  (select public.can_view_classes())
  or classroom_id in (
    select s.classroom_id from public.schedules s
    where s.id in (select public.my_schedule_ids())
  )
  or classroom_id in (select public.my_substitute_classroom_ids())
);

drop policy lesson_logs_select_scoped on public.lesson_logs;
create policy lesson_logs_select_scoped on public.lesson_logs
for select to authenticated
using (
  teacher_id = (select public.current_teacher_id())
  or (select public.can_view_classes())
  or id in (select public.my_lesson_log_ids())
);

drop policy lesson_log_students_select_scoped on public.lesson_log_students;
create policy lesson_log_students_select_scoped on public.lesson_log_students
for select to authenticated
using (
  (select public.can_view_classes())
  or lesson_log_id in (select public.my_lesson_log_ids())
);

drop policy lesson_log_student_reviews_select_scoped on public.lesson_log_student_reviews;
create policy lesson_log_student_reviews_select_scoped on public.lesson_log_student_reviews
for select to authenticated
using (
  (select public.can_view_classes())
  or lesson_log_id in (select public.my_lesson_log_ids())
);

drop policy lesson_review_scores_select_scoped on public.lesson_review_scores;
create policy lesson_review_scores_select_scoped
  on public.lesson_review_scores
  for select to authenticated
  using (
    (select public.can_view_classes())
    or lesson_log_id in (select public.my_lesson_log_ids())
  );

drop policy student_lesson_ledger_select_scoped on public.student_lesson_ledger;
create policy student_lesson_ledger_select_scoped on public.student_lesson_ledger
for select to authenticated
using (
  (select public.can_view_classes())
  or lesson_log_id in (select public.my_lesson_log_ids())
);

drop policy students_select_scoped on public.students;
create policy students_select_scoped
  on public.students for select to authenticated
  using (
    (select public.can_view_classes())
    or teacher_id = (select public.current_teacher_id())
    or classroom_id in (select public.my_classroom_ids())
    or id in (select public.my_former_class_student_ids())
    or id in (select public.my_lesson_student_ids())
  );

-- ---------------------------------------------------------------------------
-- Taking attendance: can_take_attendance instead of "admin or the schedule's
-- teacher", and who took it is kept. Everything else is unchanged from
-- 20261021140000_attendance_statuses.sql.

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
  v_status public.attendance_statuses%rowtype;
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

  -- The class's teacher, its assistants or the day's substitute (as the
  -- school allows), or admin.
  if not public.can_take_attendance(p_schedule_id, p_occurrence_date) then
    raise exception 'Only this class''s teachers or the day''s substitute can take attendance.';
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
    parent_log_id,
    submitted_by
  )
  values (
    p_schedule_id,
    v_schedule.teacher_id,
    p_occurrence_date,
    p_lesson_remark,
    v_next_revision,
    case when v_next_revision > 1 then v_previous_log.id else null end,
    v_teacher_id
  )
  returning id into v_new_log_id;

  for v_item in
    select value from jsonb_array_elements(p_attendance)
  loop
    v_student_id := (v_item ->> 'student_id')::bigint;
    v_new_status := v_item ->> 'status';

    -- One of the school's attendance statuses. A hidden one is only kept
    -- when this student already had it on the lesson being corrected.
    select * into v_status from public.attendance_statuses where key = v_new_status;
    if not found or (
      not v_status.is_active
      and not (
        v_next_revision > 1
        and exists (
          select 1 from public.lesson_log_students ls
          where ls.lesson_log_id = v_previous_log.id
            and ls.student_id = v_student_id
            and ls.attendance_status = v_new_status
        )
      )
    ) then
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

    -- A status that deducts takes one lesson. Its deducts_lesson cannot
    -- change once used (guard_attendance_status), so the earlier status still
    -- says what was taken.
    v_prev_delta := case
      when exists (
        select 1 from public.attendance_statuses
        where key = v_prev_status and deducts_lesson
      ) then -1
      else 0
    end;
    v_new_delta := case when v_status.deducts_lesson then -1 else 0 end;
    v_net_delta := case
      when v_student_type = 'trial' then 0
      when v_is_makeup_day then 0
      else v_new_delta - v_prev_delta
    end;

    -- Attended (in class): a review is needed.
    if v_status.attended then
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

-- Points in a lesson follow the same rule. Everything else is unchanged from
-- 20261021150000_rewards.sql.

create or replace function public.award_points(
  p_student_ids bigint[],
  p_points integer,
  p_reason text,
  p_preset_id bigint default null,
  p_schedule_id bigint default null,
  p_lesson_date date default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_id bigint := public.current_teacher_id();
  v_is_admin boolean := public.is_admin();
  v_schedule public.schedules%rowtype;
  v_preset public.reward_presets%rowtype;
  v_points integer := p_points;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_student_id bigint;
  v_count integer := 0;
begin
  if v_teacher_id is null then
    raise exception 'Only staff can give points.';
  end if;

  if p_student_ids is null or cardinality(p_student_ids) = 0 then
    raise exception 'Pick at least one student.';
  end if;

  if p_preset_id is not null then
    select * into v_preset from public.reward_presets where id = p_preset_id and is_active;
    if not found then
      raise exception 'That reward is not available.';
    end if;
    v_points := v_preset.points;
    v_reason := coalesce(v_reason, v_preset.label);
  end if;

  if v_reason is null then
    raise exception 'Say what the points are for.';
  end if;

  if v_points is null or v_points = 0 or v_points > 100 or (v_points < 0 and not v_is_admin) or v_points < -100 then
    raise exception 'Points must be from 1 to 100.';
  end if;

  if p_schedule_id is not null then
    select * into v_schedule from public.schedules where id = p_schedule_id;
    if not found or p_lesson_date is null then
      raise exception 'Class not found.';
    end if;
    if not (public.can_edit_classes() or public.can_take_attendance(p_schedule_id, p_lesson_date)) then
      raise exception 'Only this class''s teachers or the day''s substitute can give points in it.';
    end if;
  elsif not public.has_permission('students', 'edit') then
    raise exception 'Points outside a lesson need Students edit.';
  end if;

  foreach v_student_id in array p_student_ids
  loop
    if p_schedule_id is not null and not public.is_lesson_student(p_schedule_id, p_lesson_date, v_student_id) then
      raise exception 'Student % is not in this lesson.', v_student_id;
    end if;
    if not exists (select 1 from public.students where id = v_student_id) then
      raise exception 'Student % not found.', v_student_id;
    end if;

    insert into public.student_points (student_id, points, kind, reason, schedule_id, lesson_date, preset_id, created_by)
    values (
      v_student_id,
      v_points,
      case when v_points < 0 then 'adjust' else 'award' end,
      left(v_reason, 120),
      p_schedule_id,
      case when p_schedule_id is null then null else p_lesson_date end,
      v_preset.id,
      v_teacher_id
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.award_points(bigint[], integer, text, bigint, bigint, date) from public, anon;
grant execute on function public.award_points(bigint[], integer, text, bigint, bigint, date) to authenticated;
