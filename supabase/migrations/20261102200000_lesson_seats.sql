-- Change Class and Replacement: a child sits in another class's lesson for one day.
--
-- Two kinds of one-day seat (owner rule 2026-10-23):
--   change       BEFORE the lesson: the child is taken out of their own class's lesson on that day (no attendance
--                may exist for them there yet) and sits in a lesson of another class instead.
--   replacement  AFTER the lesson: their own lesson keeps whatever was recorded (Present / Absent); they also sit in
--                another lesson as a make-up.
-- No other limits for now (any class, any subject, any age group).
--
-- A seat is one row: a child, the lesson it is for (class + day) and the lesson they sit in (class + day). Who is in a
-- lesson on a day is answered in one place, is_in_classroom_on / classroom_roster_on (class membership history), which
-- now also takes seats into account: a "change" seat takes the child out of the old lesson that day, any seat puts the
-- child into the lesson they sit in. Attendance, the Zoom list, videos, app chat and rewards read those two functions,
-- so they follow without being changed. The signatures stay the same.
--
-- Writes go through book_lesson_seat / cancel_lesson_seat (Students: edit).

create table if not exists public.lesson_seats (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students (id) on delete cascade,
  kind text not null check (kind in ('change', 'replacement')),
  from_classroom_id bigint not null references public.classrooms (id) on delete cascade,
  from_date date not null,
  to_classroom_id bigint not null references public.classrooms (id) on delete cascade,
  to_date date not null,
  note text,
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  check (from_classroom_id <> to_classroom_id or from_date <> to_date)
);

-- A child sits in a lesson once; a lesson of theirs is changed once, or replaced once.
create unique index if not exists lesson_seats_one_seat_per_lesson
  on public.lesson_seats (student_id, to_classroom_id, to_date);
create unique index if not exists lesson_seats_one_per_old_lesson
  on public.lesson_seats (student_id, from_classroom_id, from_date, kind);
create index if not exists lesson_seats_to_idx on public.lesson_seats (to_classroom_id, to_date);
create index if not exists lesson_seats_from_idx on public.lesson_seats (from_classroom_id, from_date);

alter table public.lesson_seats enable row level security;

drop policy if exists "lesson_seats_select_permitted" on public.lesson_seats;
create policy "lesson_seats_select_permitted"
on public.lesson_seats
for select
to authenticated
using (
  public.is_admin()
  or (select public.has_permission('students'))
  or exists (
    select 1 from public.schedules s
    where s.classroom_id in (lesson_seats.from_classroom_id, lesson_seats.to_classroom_id)
      and s.teacher_id = public.current_teacher_id()
  )
);

revoke all on public.lesson_seats from anon, authenticated;
grant select on public.lesson_seats to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Who is in a lesson on a day (same names and arguments as before).
-- ---------------------------------------------------------------------------------------------

create or replace function public.is_in_classroom_on(p_student_id bigint, p_classroom_id bigint, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
      exists (
        select 1
        from public.student_classroom_periods p
        where p.student_id = p_student_id
          and p.classroom_id = p_classroom_id
          and (p.start_date is null or p.start_date <= p_date)
          and (p.end_date is null or p_date < p.end_date)
      )
      and not exists (
        select 1 from public.lesson_seats q
        where q.student_id = p_student_id and q.kind = 'change'
          and q.from_classroom_id = p_classroom_id and q.from_date = p_date
      )
    )
    or exists (
      select 1 from public.lesson_seats q
      where q.student_id = p_student_id and q.to_classroom_id = p_classroom_id and q.to_date = p_date
    );
$$;

create or replace function public.classroom_roster_on(p_classroom_id bigint, p_date date)
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select distinct r.student_id
  from (
    select p.student_id
    from public.student_classroom_periods p
    where p.classroom_id = p_classroom_id
      and (p.start_date is null or p.start_date <= p_date)
      and (p.end_date is null or p_date < p.end_date)
      and not exists (
        select 1 from public.lesson_seats q
        where q.student_id = p.student_id and q.kind = 'change'
          and q.from_classroom_id = p_classroom_id and q.from_date = p_date
      )
    union all
    select q.student_id
    from public.lesson_seats q
    where q.to_classroom_id = p_classroom_id and q.to_date = p_date
  ) r;
$$;

revoke all on function public.is_in_classroom_on(bigint, bigint, date) from public, anon, authenticated;
revoke all on function public.classroom_roster_on(bigint, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

-- Whether a class has a lesson on a day (a weekly class on its day, a one-off, not a cancelled day).
create or replace function public.classroom_lesson_on(p_classroom_id bigint, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.schedules s
    where s.classroom_id = p_classroom_id
      and s.status = 'active'
      and public.schedule_meets_on(s.id, p_date)
  );
$$;

revoke all on function public.classroom_lesson_on(bigint, date) from public, anon, authenticated;

-- Whether a child already has attendance taken for a class's lesson on a day.
create or replace function public.student_attendance_on(p_student_id bigint, p_classroom_id bigint, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lesson_log_students lls
    join public.lesson_logs ll on ll.id = lls.lesson_log_id
    join public.schedules s on s.id = ll.schedule_id
    where lls.student_id = p_student_id
      and s.classroom_id = p_classroom_id
      and ll.lesson_date = p_date
  );
$$;

revoke all on function public.student_attendance_on(bigint, bigint, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Book and undo
-- ---------------------------------------------------------------------------------------------

create or replace function public.book_lesson_seat(
  p_student_id bigint,
  p_kind text,
  p_from_classroom_id bigint,
  p_from_date date,
  p_to_classroom_id bigint,
  p_to_date date,
  p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_student public.students%rowtype;
  v_id bigint;
begin
  if not public.has_permission('students', 'edit') then
    raise exception 'Your account is not allowed to move a student to another lesson.';
  end if;
  if p_kind is null or p_kind not in ('change', 'replacement') then
    raise exception 'Choose Change class or Replacement.';
  end if;

  select * into v_student from public.students where id = p_student_id;
  if not found or not v_student.is_active then
    raise exception 'Student not found or not active.';
  end if;
  if p_from_classroom_id is null or p_from_date is null or p_to_classroom_id is null or p_to_date is null then
    raise exception 'Choose the lesson and the lesson to sit in.';
  end if;
  if p_from_classroom_id = p_to_classroom_id and p_from_date = p_to_date then
    raise exception 'That is the same lesson.';
  end if;

  -- The lesson they were meant to be in: theirs by the class history (not by another seat), and held that day.
  if not exists (
    select 1 from public.student_classroom_periods p
    where p.student_id = p_student_id and p.classroom_id = p_from_classroom_id
      and (p.start_date is null or p.start_date <= p_from_date)
      and (p.end_date is null or p_from_date < p.end_date)
  ) then
    raise exception 'This student is not in that class on that day.';
  end if;
  if not public.classroom_lesson_on(p_from_classroom_id, p_from_date) then
    raise exception 'That class has no lesson on that day.';
  end if;

  if p_kind = 'change' then
    if p_from_date < v_today then
      raise exception 'A lesson that has passed cannot be changed. Use Replacement.';
    end if;
    if public.student_attendance_on(p_student_id, p_from_classroom_id, p_from_date) then
      raise exception 'Attendance is already taken for this student in that lesson. Use Replacement.';
    end if;
  else
    if p_from_date >= v_today then
      raise exception 'A replacement is for a lesson that has already passed. Use Change class.';
    end if;
  end if;

  if p_to_date < v_today then
    raise exception 'The lesson to sit in cannot be in the past.';
  end if;
  if not public.classroom_lesson_on(p_to_classroom_id, p_to_date) then
    raise exception 'The other class has no lesson on that day.';
  end if;
  if public.is_in_classroom_on(p_student_id, p_to_classroom_id, p_to_date) then
    raise exception 'This student is already in that lesson.';
  end if;

  insert into public.lesson_seats (student_id, kind, from_classroom_id, from_date, to_classroom_id, to_date, note, created_by)
  values (p_student_id, p_kind, p_from_classroom_id, p_from_date, p_to_classroom_id, p_to_date,
          nullif(btrim(coalesce(p_note, '')), ''), public.current_teacher_id())
  returning id into v_id;

  perform public.record_admin_activity(
    'lesson_seat_booked',
    'student',
    p_student_id,
    v_student.full_name,
    jsonb_build_object(
      'kind', p_kind,
      'from_classroom_id', p_from_classroom_id, 'from_date', p_from_date,
      'to_classroom_id', p_to_classroom_id, 'to_date', p_to_date
    )
  );

  return v_id;
end;
$$;

revoke all on function public.book_lesson_seat(bigint, text, bigint, date, bigint, date, text) from public, anon;
grant execute on function public.book_lesson_seat(bigint, text, bigint, date, bigint, date, text) to authenticated;

create or replace function public.cancel_lesson_seat(p_seat_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seat public.lesson_seats%rowtype;
  v_name text;
begin
  if not public.has_permission('students', 'edit') then
    raise exception 'Your account is not allowed to move a student to another lesson.';
  end if;
  select * into v_seat from public.lesson_seats where id = p_seat_id;
  if not found then
    raise exception 'That seat no longer exists.';
  end if;
  if public.student_attendance_on(v_seat.student_id, v_seat.to_classroom_id, v_seat.to_date) then
    raise exception 'Attendance is already taken in that lesson, so it cannot be undone.';
  end if;
  if v_seat.kind = 'change' and public.student_attendance_on(v_seat.student_id, v_seat.from_classroom_id, v_seat.from_date) then
    raise exception 'Attendance is already taken in the old lesson, so it cannot be undone.';
  end if;

  delete from public.lesson_seats where id = p_seat_id;

  select full_name into v_name from public.students where id = v_seat.student_id;
  perform public.record_admin_activity(
    'lesson_seat_cancelled',
    'student',
    v_seat.student_id,
    coalesce(v_name, 'Student'),
    jsonb_build_object(
      'kind', v_seat.kind,
      'from_classroom_id', v_seat.from_classroom_id, 'from_date', v_seat.from_date,
      'to_classroom_id', v_seat.to_classroom_id, 'to_date', v_seat.to_date
    )
  );
end;
$$;

revoke all on function public.cancel_lesson_seat(bigint) from public, anon;
grant execute on function public.cancel_lesson_seat(bigint) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- A replacement lesson takes no lesson from the package (owner 2026-10-23): it stands in for the one that was
-- missed. A Change class lesson is taken as usual - they left their own lesson that day, so it is still one lesson.
-- Same technique as 20261029400000: the attendance function takes its own text and only one condition changes.
-- ---------------------------------------------------------------------------------------------

do $$
declare
  v_oid oid;
  v_def text;
  v_from text := E'      when v_is_makeup_day then 0\n      else v_new_delta - v_prev_delta';
  v_to text := E'      when v_is_makeup_day then 0\n      when exists (\n        select 1 from public.lesson_seats rs\n        where rs.student_id = v_student_id and rs.kind = ''replacement''\n          and rs.to_classroom_id = v_schedule.classroom_id and rs.to_date = p_occurrence_date\n      ) then 0\n      else v_new_delta - v_prev_delta';
  v_found boolean := false;
begin
  for v_oid in
    select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'submit_lesson_attendance'
  loop
    v_def := replace(pg_get_functiondef(v_oid), chr(13), '');
    if position(v_to in v_def) > 0 then
      v_found := true;
    elsif position(v_from in v_def) > 0 then
      execute replace(v_def, v_from, v_to);
      v_found := true;
    end if;
  end loop;
  if not v_found then
    raise exception 'lesson_seats: the hours line of submit_lesson_attendance was not found.';
  end if;
end;
$$;
