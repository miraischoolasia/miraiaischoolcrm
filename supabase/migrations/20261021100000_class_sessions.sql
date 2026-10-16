-- Live classes, groundwork (phase 1 of the classroom plan).
--
-- 1. class_sessions: one row for one day of one class (schedule + date), the
--    thing a teacher opens, starts and ends. Questions, answers, rewards and
--    Zoom attendance (later phases) all hang off it. When the teacher submits
--    attendance, the lesson log is linked back to it.
-- 2. class_session_zoom: the Zoom meeting behind a session. Staff only: a
--    student never reads the class-wide join link; they will get their own
--    registrant link (phase 2), so nobody can pass the meeting on.
-- 3. Zoom meeting options per school in app_settings ('zoom_meeting_options').
--    The Zoom account itself (account id, client id/secret, host user) is a
--    secret of each school's own Supabase project, set with
--    `supabase secrets set`, never stored in a table.
-- 4. Students can sign in later: students.auth_user_id and current_student_id().
--    No student has a login yet. Every existing CRM rule checks the teachers
--    table (has_permission / current_teacher_id / is_admin), so a signed-in
--    student sees nothing of the CRM; audited 2026-10-16 (RLS on all public
--    tables and storage, security-definer RPCs, edge functions, WhatsApp
--    gateway). The one table every signed-in account can read is
--    app_settings, so it must never hold secrets. A student account can
--    never also be a staff account (guard below).

-- ---------------------------------------------------------------------------
-- Does this schedule meet on this date? Same rules the calendar and
-- submit_lesson_attendance use, plus cancelled days (schedule_exceptions).

create or replace function public.schedule_meets_on(p_schedule_id bigint, p_date date)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_schedule public.schedules%rowtype;
  v_category text;
begin
  select * into v_schedule from public.schedules where id = p_schedule_id;
  if not found or p_date is null then
    return false;
  end if;

  if exists (
    select 1 from public.schedule_exceptions e
    where e.schedule_id = p_schedule_id and e.exception_date = p_date
  ) then
    return false;
  end if;

  if v_schedule.event_type = 'replacement' then
    return p_date = v_schedule.scheduled_date;
  end if;

  if extract(dow from p_date)::int <> v_schedule.day_of_week
    or p_date < v_schedule.start_recur
    or (v_schedule.end_recur is not null and p_date > v_schedule.end_recur) then
    return false;
  end if;

  if v_schedule.classroom_id is not null then
    select category into v_category from public.classrooms where id = v_schedule.classroom_id;
  end if;

  -- A regular (non-trial) class never meets on the 29th-31st unless a
  -- make-up session lands there.
  if coalesce(v_category, 'regular') <> 'trial' and extract(day from p_date)::int >= 29 then
    return exists (
      select 1
      from public.makeup_sessions ms
      join public.makeup_plans mp on mp.id = ms.plan_id
      where mp.classroom_id = v_schedule.classroom_id
        and ms.session_date = p_date
    );
  end if;

  return true;
end;
$$;

revoke all on function public.schedule_meets_on(bigint, date) from public, anon;
grant execute on function public.schedule_meets_on(bigint, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Sessions

create table public.class_sessions (
  id bigint generated always as identity primary key,
  schedule_id bigint not null references public.schedules (id) on delete restrict,
  lesson_date date not null,
  classroom_id bigint references public.classrooms (id) on delete set null,
  teacher_id bigint not null references public.teachers (id) on delete restrict,
  -- The planned time, copied from the schedule when the session is opened
  -- (a later change to the weekly time does not rewrite a past lesson).
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended')),
  started_at timestamptz,
  ended_at timestamptz,
  recording_url text check (recording_url is null or char_length(recording_url) <= 1000),
  lesson_log_id bigint references public.lesson_logs (id) on delete set null,
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (schedule_id, lesson_date),
  check (ends_at > starts_at),
  check (ended_at is null or started_at is null or ended_at >= started_at)
);

create index class_sessions_teacher_date_idx on public.class_sessions (teacher_id, lesson_date);
create index class_sessions_classroom_date_idx on public.class_sessions (classroom_id, lesson_date);
create index class_sessions_live_idx on public.class_sessions (status) where status = 'live';

create trigger set_class_sessions_updated_at
  before update on public.class_sessions
  for each row execute function public.set_current_timestamp_updated_at();

create table public.class_session_zoom (
  session_id bigint primary key references public.class_sessions (id) on delete cascade,
  meeting_id text not null check (char_length(meeting_id) between 1 and 40),
  join_url text check (join_url is null or char_length(join_url) <= 1000),
  passcode text check (passcode is null or char_length(passcode) <= 40),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger set_class_session_zoom_updated_at
  before update on public.class_session_zoom
  for each row execute function public.set_current_timestamp_updated_at();

-- ---------------------------------------------------------------------------
-- Student sign-in groundwork

alter table public.students
  add column if not exists auth_user_id uuid unique references auth.users (id) on delete set null;

create or replace function public.current_student_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select id from public.students
  where auth_user_id = auth.uid() and auth.uid() is not null and is_active = true
  limit 1;
$$;

revoke all on function public.current_student_id() from public, anon;
grant execute on function public.current_student_id() to authenticated;

-- Only an admin (or the server) links a student to a login, and one login is
-- never both a student and a staff account. Runs as the caller (not security
-- definer), so current_user is the caller's role; only an admin or the server
-- gets past the first check, and both can read every staff row.
create or replace function public.guard_student_login()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.auth_user_id is not distinct from (case when tg_op = 'UPDATE' then old.auth_user_id end) then
    return new;
  end if;

  if current_user not in ('postgres', 'service_role', 'supabase_admin') and not public.is_admin() then
    raise exception 'Only an admin can link a student to a login.';
  end if;

  if new.auth_user_id is not null
    and exists (select 1 from public.teachers t where t.auth_user_id = new.auth_user_id) then
    raise exception 'This login belongs to a staff account.';
  end if;

  return new;
end;
$$;

create trigger students_guard_login
  before insert or update of auth_user_id on public.students
  for each row execute function public.guard_student_login();

create or replace function public.guard_staff_login_not_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auth_user_id is not null
    and exists (select 1 from public.students s where s.auth_user_id = new.auth_user_id) then
    raise exception 'This login belongs to a student.';
  end if;
  return new;
end;
$$;

create trigger teachers_guard_login_not_student
  before insert or update of auth_user_id on public.teachers
  for each row execute function public.guard_staff_login_not_student();

-- Is this student in that session's lesson? Trial slots go by booking,
-- replacement classes by their own list, regular classes by who was in the
-- class on that day.
create or replace function public.is_class_session_student(p_session_id bigint, p_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_student_id is not null and exists (
    select 1
    from public.class_sessions cs
    join public.schedules s on s.id = cs.schedule_id
    left join public.classrooms c on c.id = s.classroom_id
    where cs.id = p_session_id
      and (
        (s.event_type = 'regular' and c.category = 'trial' and exists (
          select 1 from public.trial_bookings tb
          where tb.schedule_id = s.id and tb.booking_date = cs.lesson_date and tb.student_id = p_student_id
        ))
        or (s.event_type = 'regular' and coalesce(c.category, 'regular') <> 'trial'
          and public.is_in_classroom_on(p_student_id, s.classroom_id, cs.lesson_date))
        or (s.event_type = 'replacement' and exists (
          select 1 from public.schedule_students ss
          where ss.schedule_id = s.id and ss.student_id = p_student_id and ss.is_active = true
        ))
      )
  );
$$;

revoke all on function public.is_class_session_student(bigint, bigint) from public, anon;
grant execute on function public.is_class_session_student(bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Who can read and change sessions

alter table public.class_sessions enable row level security;
alter table public.class_session_zoom enable row level security;

-- Supabase gives new tables wide default grants; start from nothing.
revoke all on public.class_sessions from public, anon, authenticated;
revoke all on public.class_session_zoom from public, anon, authenticated;
grant select on public.class_sessions to authenticated;
grant select on public.class_session_zoom to authenticated;
grant all on public.class_sessions to service_role;
grant all on public.class_session_zoom to service_role;

create policy class_sessions_select_scoped
  on public.class_sessions
  for select to authenticated
  using (
    teacher_id = (select public.current_teacher_id())
    or (select public.can_view_classes())
    or ((select public.current_student_id()) is not null
      and public.is_class_session_student(id, (select public.current_student_id())))
  );

create policy class_session_zoom_select_staff
  on public.class_session_zoom
  for select to authenticated
  using (
    exists (
      select 1 from public.class_sessions cs
      where cs.id = class_session_zoom.session_id
        and (cs.teacher_id = (select public.current_teacher_id()) or (select public.can_view_classes()))
    )
  );

-- Open (get or create) the session for one class day. The class's teacher,
-- or anyone who may edit classes. Days ahead are fine (to prepare questions).
create or replace function public.open_class_session(p_schedule_id bigint, p_lesson_date date)
returns public.class_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.schedules%rowtype;
  v_session public.class_sessions%rowtype;
  v_teacher_id bigint := public.current_teacher_id();
begin
  select * into v_schedule from public.schedules where id = p_schedule_id;
  if not found then
    raise exception 'Class not found.';
  end if;

  if not (public.can_edit_classes() or (v_teacher_id is not null and v_schedule.teacher_id = v_teacher_id)) then
    raise exception 'Only this class''s teacher can open it.';
  end if;

  select * into v_session
  from public.class_sessions
  where schedule_id = p_schedule_id and lesson_date = p_lesson_date;
  if found then
    return v_session;
  end if;

  if v_schedule.status <> 'active' then
    raise exception 'This class is cancelled.';
  end if;

  if not public.schedule_meets_on(p_schedule_id, p_lesson_date) then
    raise exception 'This class does not run on that date.';
  end if;

  insert into public.class_sessions (
    schedule_id, lesson_date, classroom_id, teacher_id, starts_at, ends_at, lesson_log_id, created_by
  )
  values (
    p_schedule_id,
    p_lesson_date,
    v_schedule.classroom_id,
    v_schedule.teacher_id,
    (p_lesson_date + v_schedule.start_time) at time zone 'Asia/Kuala_Lumpur',
    (p_lesson_date + v_schedule.end_time) at time zone 'Asia/Kuala_Lumpur',
    (
      select l.id from public.lesson_logs l
      where l.schedule_id = p_schedule_id and l.lesson_date = p_lesson_date
      order by l.revision_number desc
      limit 1
    ),
    v_teacher_id
  )
  on conflict (schedule_id, lesson_date) do nothing
  returning * into v_session;

  -- Two clicks at once: the other one made it.
  if v_session.id is null then
    select * into v_session
    from public.class_sessions
    where schedule_id = p_schedule_id and lesson_date = p_lesson_date;
  end if;

  return v_session;
end;
$$;

revoke all on function public.open_class_session(bigint, date) from public, anon;
grant execute on function public.open_class_session(bigint, date) to authenticated;

-- Submitting (or correcting) attendance links the newest lesson log.
create or replace function public.link_lesson_log_to_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.class_sessions
  set lesson_log_id = new.id
  where schedule_id = new.schedule_id and lesson_date = new.lesson_date;
  return new;
end;
$$;

create trigger lesson_logs_link_session
  after insert on public.lesson_logs
  for each row execute function public.link_lesson_log_to_session();

-- ---------------------------------------------------------------------------
-- Zoom meeting options for this school (no secrets; every signed-in account
-- can read app_settings).

insert into public.app_settings (key, value)
values (
  'zoom_meeting_options',
  '{"mute_upon_entry": true, "waiting_room": false, "join_before_host": false, "auto_recording": "cloud"}'::jsonb
)
on conflict (key) do nothing;

create or replace function public.set_zoom_meeting_options(p_options jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the Zoom settings.';
  end if;

  if jsonb_typeof(p_options) <> 'object'
    or exists (
      select 1 from jsonb_object_keys(p_options) k
      where k not in ('mute_upon_entry', 'waiting_room', 'join_before_host', 'auto_recording')
    )
    or jsonb_typeof(p_options -> 'mute_upon_entry') <> 'boolean'
    or jsonb_typeof(p_options -> 'waiting_room') <> 'boolean'
    or jsonb_typeof(p_options -> 'join_before_host') <> 'boolean'
    or coalesce(p_options ->> 'auto_recording', '') not in ('cloud', 'local', 'none') then
    raise exception 'Zoom settings are not valid.';
  end if;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('zoom_meeting_options', p_options, timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  perform public.record_admin_activity(
    'zoom_meeting_options_changed', 'schedule', null, 'Zoom settings', p_options
  );
end;
$$;

revoke all on function public.set_zoom_meeting_options(jsonb) from public, anon;
grant execute on function public.set_zoom_meeting_options(jsonb) to authenticated;
