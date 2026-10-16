-- Student app (phase 5): logins for children and parents, and what the app
-- may read. The app (student-app/, Expo: web now, iOS/Android later) only
-- calls the portal_* functions below; it never reads CRM tables itself, so a
-- child or parent login sees nothing of the CRM (audited 2026-10-16).
--
-- Logins: a child signs in as the student (students.auth_user_id), a parent
-- as their people row (people.auth_user_id, kind 'parent') and sees every
-- child linked to them (people.parent_id). Login names are kept in
-- portal_accounts (one name per login, across children and parents); the
-- portal-accounts function creates them. One login is never two of staff,
-- student and parent.
--
-- What each sees is the school's choice (app_settings 'student_portal'):
-- schedule (classes and their Zoom link), points, scores (the teacher's
-- ratings, never the remarks), package (lessons left and expiry). By
-- default a child sees all but the package; a parent sees all.

-- ---------------------------------------------------------------------------
-- Login names

create table public.portal_accounts (
  auth_user_id uuid primary key,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
  kind text not null check (kind in ('student', 'parent')),
  student_id bigint unique references public.students (id) on delete cascade,
  parent_person_id bigint unique references public.people (id) on delete cascade,
  is_active boolean not null default true,
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    (kind = 'student' and student_id is not null and parent_person_id is null)
    or (kind = 'parent' and parent_person_id is not null and student_id is null)
  )
);

create trigger set_portal_accounts_updated_at
  before update on public.portal_accounts
  for each row execute function public.set_current_timestamp_updated_at();

alter table public.portal_accounts enable row level security;
revoke all on public.portal_accounts from public, anon, authenticated;
grant select on public.portal_accounts to authenticated;
grant all on public.portal_accounts to service_role;

-- Login names (never passwords): a child's to staff who can see that child
-- (so a class teacher can help a child who forgot it), every one to staff
-- who see all classes or students.
create policy portal_accounts_select_staff
  on public.portal_accounts for select to authenticated
  using (
    (select public.can_view_classes())
    or (select public.has_permission('students'))
    or (
      (select public.current_teacher_id()) is not null
      and student_id in (select s.id from public.students s)
    )
  );

-- A parent's login: only an admin or the server sets it, only on a parent,
-- and never one that is already staff or a student.
create or replace function public.guard_parent_login()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.auth_user_id is not distinct from (case when tg_op = 'UPDATE' then old.auth_user_id end) then
    return new;
  end if;
  if current_user not in ('postgres', 'service_role', 'supabase_admin') and not public.is_admin() then
    raise exception 'Only an admin can link a parent to a login.';
  end if;
  if new.auth_user_id is not null then
    if new.kind <> 'parent' then
      raise exception 'Only a parent gets a parent login.';
    end if;
    if exists (select 1 from public.teachers t where t.auth_user_id = new.auth_user_id)
      or exists (select 1 from public.students s where s.auth_user_id = new.auth_user_id) then
      raise exception 'This login belongs to staff or a student.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_parent_login() from public, anon, authenticated;

create trigger people_guard_parent_login
  before insert or update of auth_user_id on public.people
  for each row execute function public.guard_parent_login();

-- The student and staff guards also keep parents' logins apart.
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

  if new.auth_user_id is not null
    and exists (select 1 from public.people p where p.auth_user_id = new.auth_user_id) then
    raise exception 'This login belongs to a parent.';
  end if;

  return new;
end;
$$;

create or replace function public.guard_staff_login_not_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auth_user_id is not null
    and (
      exists (select 1 from public.students s where s.auth_user_id = new.auth_user_id)
      or exists (select 1 from public.people p where p.auth_user_id = new.auth_user_id)
    ) then
    raise exception 'This login belongs to a student or parent.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_student_login() from public, anon, authenticated;
revoke all on function public.guard_staff_login_not_student() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Who is signed in, and which children they may see

create or replace function public.current_parent_person_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.people p
  where p.auth_user_id = auth.uid() and auth.uid() is not null and p.kind = 'parent'
    and exists (select 1 from public.portal_accounts a where a.auth_user_id = p.auth_user_id and a.is_active)
  limit 1;
$$;

revoke all on function public.current_parent_person_id() from public, anon;
grant execute on function public.current_parent_person_id() to authenticated;

-- The children this login may see: itself (a child), or every child linked
-- to the parent.
create or replace function public.portal_children()
returns table (student_id bigint, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.full_name
  from public.students s
  where s.id = public.current_student_id()
    and exists (select 1 from public.portal_accounts a where a.auth_user_id = auth.uid() and a.is_active)
  union
  select s.id, s.full_name
  from public.people child
  join public.students s on s.id = child.student_id
  where child.parent_id = public.current_parent_person_id()
    and child.kind = 'student'
  order by 2;
$$;

revoke all on function public.portal_children() from public, anon;
grant execute on function public.portal_children() to authenticated;

-- ---------------------------------------------------------------------------
-- What the school shows in the app

insert into public.app_settings (key, value)
values (
  'student_portal',
  '{"school_name": "", "accent_color": "#fc0c97",
    "student_sees": {"schedule": true, "points": true, "scores": true, "package": false},
    "parent_sees": {"schedule": true, "points": true, "scores": true, "package": true}}'::jsonb
)
on conflict (key) do nothing;

create or replace function public.set_portal_settings(p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer text;
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the student app settings.';
  end if;
  if jsonb_typeof(p_settings) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_settings) k where k not in ('school_name', 'accent_color', 'student_sees', 'parent_sees'))
    or char_length(coalesce(p_settings ->> 'school_name', '')) > 60
    or coalesce(p_settings ->> 'accent_color', '') !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Student app settings are not valid.';
  end if;
  foreach v_viewer in array array['student_sees', 'parent_sees']
  loop
    if jsonb_typeof(p_settings -> v_viewer) <> 'object'
      or exists (
        select 1 from jsonb_each(p_settings -> v_viewer) e
        where e.key not in ('schedule', 'points', 'scores', 'package') or jsonb_typeof(e.value) <> 'boolean'
      ) then
      raise exception 'Student app settings are not valid.';
    end if;
  end loop;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('student_portal', p_settings, timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_portal_settings(jsonb) from public, anon;
grant execute on function public.set_portal_settings(jsonb) to authenticated;

-- The school's name and colour for the app's sign-in screen (no login yet,
-- so anon may read these two only).
create or replace function public.portal_branding()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'school_name', coalesce(value ->> 'school_name', ''),
    'accent_color', coalesce(value ->> 'accent_color', '#fc0c97')
  )
  from public.app_settings where key = 'student_portal';
$$;

revoke all on function public.portal_branding() from public;
grant execute on function public.portal_branding() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Everything the app shows for one child

create or replace function public.portal_home(p_student_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer text;
  v_settings jsonb;
  v_sees jsonb;
  v_student public.students%rowtype;
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_result jsonb;
  v_total integer;
begin
  if not exists (select 1 from public.portal_children() c where c.student_id = p_student_id) then
    raise exception 'Not found.';
  end if;
  v_viewer := case when public.current_student_id() = p_student_id then 'student' else 'parent' end;

  select value into v_settings from public.app_settings where key = 'student_portal';
  v_sees := coalesce(v_settings -> (v_viewer || '_sees'), '{}'::jsonb);
  select * into v_student from public.students where id = p_student_id;

  v_result := jsonb_build_object(
    'viewer', v_viewer,
    'school_name', coalesce(v_settings ->> 'school_name', ''),
    'accent_color', coalesce(v_settings ->> 'accent_color', '#fc0c97'),
    'sees', v_sees,
    'student', jsonb_build_object(
      'id', v_student.id,
      'name', v_student.full_name,
      'class', (select name from public.classrooms where id = v_student.classroom_id)
    )
  );

  -- Classes in the next three weeks: every timetable entry the child is in
  -- on that day (own class, booked trial, or replacement class).
  if coalesce((v_sees ->> 'schedule')::boolean, false) then
    v_result := v_result || jsonb_build_object('schedule', coalesce((
      select jsonb_agg(item order by item ->> 'date', item ->> 'start')
      from (
        select jsonb_build_object(
          'date', d::date,
          'start', to_char(s.start_time, 'HH24:MI'),
          'end', to_char(s.end_time, 'HH24:MI'),
          'title', s.title,
          'class', c.name,
          'teacher', t.full_name,
          'zoom_link', c.zoom_link
        ) as item
        from generate_series(v_today, v_today + 20, interval '1 day') as d
        join public.schedules s on s.status = 'active'
        left join public.classrooms c on c.id = s.classroom_id
        left join public.teachers t on t.id = s.teacher_id
        where public.schedule_meets_on(s.id, d::date)
          and public.is_lesson_student(s.id, d::date, p_student_id)
      ) upcoming
    ), '[]'::jsonb));
  end if;

  -- Lessons so far (latest revision of each), newest first: the status and,
  -- with scores on, the teacher's ratings. Remarks are never sent.
  v_result := v_result || jsonb_build_object('lessons', coalesce((
    select jsonb_agg(lesson order by lesson ->> 'date' desc)
    from (
      select jsonb_build_object(
        'date', l.lesson_date,
        'title', s.title,
        'status', coalesce(st.label, ls.attendance_status),
        'attended', coalesce(st.attended, false),
        'scores', case when coalesce((v_sees ->> 'scores')::boolean, false) then coalesce((
          select jsonb_agg(jsonb_build_object('criterion', rc.name, 'score', sc.score, 'max', rc.max_score) order by rc.sort_order, rc.id)
          from public.lesson_review_scores sc
          join public.review_criteria rc on rc.id = sc.criterion_id
          where sc.lesson_log_id = l.id and sc.student_id = p_student_id
        ), '[]'::jsonb) else '[]'::jsonb end
      ) as lesson
      from public.lesson_log_students ls
      join public.lesson_logs l on l.id = ls.lesson_log_id
      join public.schedules s on s.id = l.schedule_id
      left join public.attendance_statuses st on st.key = ls.attendance_status
      where ls.student_id = p_student_id
        and l.revision_number = (
          select max(l2.revision_number) from public.lesson_logs l2
          where l2.schedule_id = l.schedule_id and l2.lesson_date = l.lesson_date
        )
      order by l.lesson_date desc
      limit 40
    ) history
  ), '[]'::jsonb));

  if coalesce((v_sees ->> 'points')::boolean, false) then
    select coalesce(sum(points), 0) into v_total from public.student_points where student_id = p_student_id;
    v_result := v_result || jsonb_build_object('points', jsonb_build_object(
      'total', v_total,
      'level', (select name from public.reward_levels where min_points <= v_total order by min_points desc limit 1),
      'next_level', (select jsonb_build_object('name', name, 'min_points', min_points)
                     from public.reward_levels where min_points > v_total order by min_points limit 1),
      'level_start', coalesce((select max(min_points) from public.reward_levels where min_points <= v_total), 0),
      'recent', coalesce((
        select jsonb_agg(jsonb_build_object('reason', reason, 'points', points, 'kind', kind,
                                            'date', coalesce(lesson_date, created_at::date)) order by id desc)
        from (select * from public.student_points where student_id = p_student_id order by id desc limit 20) recent
      ), '[]'::jsonb)
    ));
  end if;

  if coalesce((v_sees ->> 'package')::boolean, false) then
    v_result := v_result || jsonb_build_object('package', jsonb_build_object(
      'name', (select name from public.packages where id = v_student.package_id),
      'lessons_left', v_student.remaining_hours,
      'expires', v_student.lesson_expiry_date
    ));
  end if;

  return v_result;
end;
$$;

revoke all on function public.portal_home(bigint) from public, anon;
grant execute on function public.portal_home(bigint) to authenticated;
