-- Reward points (phase 3A of the classroom plan; ledger idea after lms-front's
-- xp_transactions, levels after EDUCINEVA's hero levels).
--
-- student_points: the ledger. Every gain or spend is a row; a student's
-- points are the sum. Rows are never edited or deleted: an undo is a new row
-- that reverses one (reverses_id), so the history always adds up.
--   kind 'attendance' - given by itself when attendance is submitted, from the
--                       status's reward_points (attendance_statuses). A
--                       correction gives or takes the difference.
--   kind 'award'      - a teacher gives points (one student or the whole class)
--   kind 'redeem'     - points spent on a reward (admin / Students edit)
--   kind 'adjust'     - an admin correction, and undo rows
-- reward_presets: the quick buttons teachers give points with (school's own).
-- reward_levels: names by total points (school's own).
-- Students will read their own points later through their own rule.

alter table public.attendance_statuses
  add column reward_points integer not null default 0 check (reward_points between -100 and 100);

update public.attendance_statuses set reward_points = 10 where key = 'present';

create table public.reward_presets (
  id bigint generated always as identity primary key,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  points integer not null check (points between 1 and 100),
  emoji text check (emoji is null or char_length(emoji) <= 8),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger set_reward_presets_updated_at
  before update on public.reward_presets
  for each row execute function public.set_current_timestamp_updated_at();

insert into public.reward_presets (label, points, emoji, sort_order) values
  ('Great answer', 5, '🌟', 10),
  ('Helping others', 3, '🤝', 20),
  ('Homework done', 5, '📚', 30),
  ('Super focus', 3, '🎯', 40);

create table public.reward_levels (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  min_points integer not null unique check (min_points >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.reward_levels (name, min_points) values
  ('Starter', 0),
  ('Explorer', 100),
  ('Builder', 300),
  ('Creator', 600),
  ('Master', 1000);

create table public.student_points (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students (id) on delete cascade,
  points integer not null check (points <> 0 and points between -100000 and 100000),
  kind text not null check (kind in ('attendance', 'award', 'redeem', 'adjust')),
  reason text not null check (char_length(btrim(reason)) between 1 and 120),
  -- The lesson it came from (attendance, and awards given in class).
  schedule_id bigint references public.schedules (id) on delete set null,
  lesson_date date,
  preset_id bigint references public.reward_presets (id) on delete set null,
  reverses_id bigint unique references public.student_points (id) on delete restrict,
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index student_points_student_idx on public.student_points (student_id, created_at);
create index student_points_lesson_idx on public.student_points (schedule_id, lesson_date) where schedule_id is not null;

-- ---------------------------------------------------------------------------
-- Attendance points, by themselves

-- Was this student in that lesson (same roster rules as attendance)?
create or replace function public.is_lesson_student(p_schedule_id bigint, p_lesson_date date, p_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.schedules s
    left join public.classrooms c on c.id = s.classroom_id
    where s.id = p_schedule_id
      and (
        (s.event_type = 'regular' and c.category = 'trial' and exists (
          select 1 from public.trial_bookings tb
          where tb.schedule_id = s.id and tb.booking_date = p_lesson_date and tb.student_id = p_student_id
        ))
        or (s.event_type = 'regular' and coalesce(c.category, 'regular') <> 'trial'
          and public.is_in_classroom_on(p_student_id, s.classroom_id, p_lesson_date))
        or (s.event_type = 'replacement' and exists (
          select 1 from public.schedule_students ss
          where ss.schedule_id = s.id and ss.student_id = p_student_id and ss.is_active = true
        ))
      )
  );
$$;

revoke all on function public.is_lesson_student(bigint, date, bigint) from public, anon;
grant execute on function public.is_lesson_student(bigint, date, bigint) to authenticated;

-- Each attendance row (every revision writes all of them) brings the
-- student's attendance points for that lesson to what the status gives now.
-- Trial-type students (one-off booking placeholders) collect none.
create or replace function public.give_attendance_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log public.lesson_logs%rowtype;
  v_status public.attendance_statuses%rowtype;
  v_target integer;
  v_applied integer;
begin
  if (select student_type from public.students where id = new.student_id) = 'trial' then
    return new;
  end if;

  select * into v_log from public.lesson_logs where id = new.lesson_log_id;
  select * into v_status from public.attendance_statuses where key = new.attendance_status;
  v_target := coalesce(v_status.reward_points, 0);

  select coalesce(sum(points), 0) into v_applied
  from public.student_points
  where student_id = new.student_id
    and kind = 'attendance'
    and schedule_id = v_log.schedule_id
    and lesson_date = v_log.lesson_date;

  if v_target <> v_applied then
    insert into public.student_points (student_id, points, kind, reason, schedule_id, lesson_date, created_by)
    values (
      new.student_id,
      v_target - v_applied,
      'attendance',
      case when v_applied = 0 then 'Attendance: ' else 'Attendance changed: ' end || coalesce(v_status.label, new.attendance_status),
      v_log.schedule_id,
      v_log.lesson_date,
      v_log.teacher_id
    );
  end if;

  return new;
end;
$$;

revoke all on function public.give_attendance_points() from public, anon, authenticated;

create trigger lesson_log_students_give_points
  after insert on public.lesson_log_students
  for each row execute function public.give_attendance_points();

-- ---------------------------------------------------------------------------
-- Giving, spending and undoing points

-- Give points to students: in a lesson (its teacher, or anyone who may edit
-- classes; every student must be in that lesson), or outside a lesson
-- (Students edit). Teachers give 1-100 at a time; an admin may also give a
-- negative correction ('adjust').
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
    if not (public.can_edit_classes() or v_schedule.teacher_id = v_teacher_id) then
      raise exception 'Only this class''s teacher can give points in it.';
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

-- Spend points on a reward. Never below zero.
create or replace function public.redeem_points(p_student_id bigint, p_points integer, p_reason text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_id bigint;
begin
  if not public.has_permission('students', 'edit') then
    raise exception 'Only staff who may edit students can redeem points.';
  end if;
  if p_points is null or p_points < 1 then
    raise exception 'Points to spend must be at least 1.';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Say what the points are spent on.';
  end if;

  -- One redemption at a time per student, so two clicks cannot overspend.
  perform 1 from public.students where id = p_student_id for update;
  if not found then
    raise exception 'Student not found.';
  end if;

  select coalesce(sum(points), 0) into v_balance from public.student_points where student_id = p_student_id;
  if v_balance < p_points then
    raise exception 'Not enough points: % left.', v_balance;
  end if;

  insert into public.student_points (student_id, points, kind, reason, created_by)
  values (p_student_id, -p_points, 'redeem', left(btrim(p_reason), 120), public.current_teacher_id())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.redeem_points(bigint, integer, text) from public, anon;
grant execute on function public.redeem_points(bigint, integer, text) to authenticated;

-- Undo one award or redemption: a reversing row. Whoever gave it may undo it
-- within 24 hours; an admin any time. Attendance points follow attendance and
-- are not undone here.
create or replace function public.undo_points(p_points_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.student_points%rowtype;
  v_id bigint;
begin
  select * into v_row from public.student_points where id = p_points_id;
  if not found then
    raise exception 'Points entry not found.';
  end if;
  if v_row.kind = 'attendance' then
    raise exception 'Attendance points change with the attendance itself.';
  end if;
  if v_row.reverses_id is not null then
    raise exception 'This entry is already an undo.';
  end if;
  if not (
    public.is_admin()
    or (v_row.created_by = public.current_teacher_id()
      and v_row.created_at > timezone('utc', now()) - interval '24 hours')
  ) then
    raise exception 'Only who gave these points can undo them, within 24 hours.';
  end if;

  insert into public.student_points (student_id, points, kind, reason, schedule_id, lesson_date, reverses_id, created_by)
  values (
    v_row.student_id, -v_row.points, 'adjust', left('Undo: ' || v_row.reason, 120),
    v_row.schedule_id, v_row.lesson_date, v_row.id, public.current_teacher_id()
  )
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'These points were already undone.';
end;
$$;

revoke all on function public.undo_points(bigint) from public, anon;
grant execute on function public.undo_points(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Settings (admin)

create or replace function public.save_reward_preset(
  p_id bigint, p_label text, p_points integer, p_emoji text, p_sort_order integer, p_is_active boolean
)
returns public.reward_presets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.reward_presets%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admin can change rewards.';
  end if;

  if p_id is null then
    insert into public.reward_presets (label, points, emoji, sort_order, is_active)
    values (
      btrim(p_label), p_points, nullif(btrim(coalesce(p_emoji, '')), ''),
      coalesce(p_sort_order, (select coalesce(max(sort_order), 0) + 10 from public.reward_presets)),
      coalesce(p_is_active, true)
    )
    returning * into v_row;
  else
    update public.reward_presets
    set label = coalesce(btrim(p_label), label),
        points = coalesce(p_points, points),
        emoji = case when p_emoji is null then emoji else nullif(btrim(p_emoji), '') end,
        sort_order = coalesce(p_sort_order, sort_order),
        is_active = coalesce(p_is_active, is_active)
    where id = p_id
    returning * into v_row;
    if v_row.id is null then
      raise exception 'Reward not found.';
    end if;
  end if;
  return v_row;
end;
$$;

revoke all on function public.save_reward_preset(bigint, text, integer, text, integer, boolean) from public, anon;
grant execute on function public.save_reward_preset(bigint, text, integer, text, integer, boolean) to authenticated;

-- Replace the whole level list at once ([{name, min_points}]); one must start at 0.
create or replace function public.set_reward_levels(p_levels jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can change levels.';
  end if;
  if jsonb_typeof(p_levels) <> 'array' or jsonb_array_length(p_levels) = 0 or jsonb_array_length(p_levels) > 20 then
    raise exception 'Give between 1 and 20 levels.';
  end if;
  if not exists (select 1 from jsonb_array_elements(p_levels) e where (e.value ->> 'min_points')::int = 0) then
    raise exception 'The first level must start at 0 points.';
  end if;

  delete from public.reward_levels;
  insert into public.reward_levels (name, min_points)
  select btrim(e.value ->> 'name'), (e.value ->> 'min_points')::int
  from jsonb_array_elements(p_levels) e;
end;
$$;

revoke all on function public.set_reward_levels(jsonb) from public, anon;
grant execute on function public.set_reward_levels(jsonb) to authenticated;

-- Points a status gives on attendance (Class Settings > Attendance).
create or replace function public.set_attendance_status_points(p_key text, p_points integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can change attendance points.';
  end if;
  update public.attendance_statuses set reward_points = coalesce(p_points, 0) where key = p_key;
  if not found then
    raise exception 'Attendance status not found.';
  end if;
end;
$$;

revoke all on function public.set_attendance_status_points(text, integer) from public, anon;
grant execute on function public.set_attendance_status_points(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Who can read

alter table public.reward_presets enable row level security;
alter table public.reward_levels enable row level security;
alter table public.student_points enable row level security;

revoke all on public.reward_presets from public, anon, authenticated;
revoke all on public.reward_levels from public, anon, authenticated;
revoke all on public.student_points from public, anon, authenticated;
grant select on public.reward_presets, public.reward_levels, public.student_points to authenticated;
grant all on public.reward_presets, public.reward_levels, public.student_points to service_role;

create policy reward_presets_select_staff
  on public.reward_presets for select to authenticated
  using ((select public.current_teacher_id()) is not null);

create policy reward_levels_select_staff
  on public.reward_levels for select to authenticated
  using ((select public.current_teacher_id()) is not null);

-- A staff account sees the points of the students it can see.
create policy student_points_select_scoped
  on public.student_points for select to authenticated
  using (
    (select public.current_teacher_id()) is not null
    and student_id in (select s.id from public.students s)
  );
