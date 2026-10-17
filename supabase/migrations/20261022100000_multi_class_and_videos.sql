-- A student in several classes at once, and each class's videos (recorded
-- lessons and uploads) with month-by-month access and watch progress.
--
-- 1. Several classes: students.classroom_id stays the student's main class
--    (as today); any other class is an open period in student_classroom_periods.
--    Rosters already go by those periods (is_in_classroom_on), and a teacher
--    already sees every student who was ever in their classes. Only one open
--    period per class now (not per student), and the class-change trigger
--    only touches the main class's period.
-- 2. Class videos: Bunny Stream videos that belong to a class, by year and
--    month, from an upload, a Zoom recording or an import. The library comes
--    from the class (classrooms.recording_library_id) or, per teacher, from
--    classroom_teacher_libraries; such a teacher may also manage the class's
--    videos (a subject can have several teachers).
-- 3. Month access (when the school turns it on, app_settings 'class_videos'):
--    a student sees a class's videos of a month only while they have access
--    to that month (student_video_access, with optional start and end days).
-- 4. Watch progress per student and video; the app reads and writes it
--    through portal_* functions only.

-- ---------------------------------------------------------------------------
-- 1. Several classes at once

drop index if exists public.student_classroom_periods_one_open_idx;
create unique index if not exists student_classroom_periods_one_open_per_class_idx
  on public.student_classroom_periods (student_id, classroom_id)
  where end_date is null;

-- The main class changed: close the old main class's stay (or drop it if it
-- only started today), and open the new one unless the student is already in it.
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
    if old.classroom_id is not null then
      delete from public.student_classroom_periods
      where student_id = new.id and classroom_id = old.classroom_id
        and end_date is null and start_date >= v_today;
      update public.student_classroom_periods
      set end_date = v_today
      where student_id = new.id and classroom_id = old.classroom_id and end_date is null;
    end if;
  end if;

  if new.classroom_id is not null and not exists (
    select 1 from public.student_classroom_periods
    where student_id = new.id and classroom_id = new.classroom_id and end_date is null
  ) then
    insert into public.student_classroom_periods (student_id, classroom_id, start_date)
    values (new.id, new.classroom_id, v_today);
  end if;

  return new;
end;
$$;

revoke all on function public.track_student_classroom() from public, anon, authenticated;

-- Put a student in another class too (their main class stays). A student with
-- no class gets it as their main class.
create or replace function public.add_student_to_classroom(p_student_id bigint, p_classroom_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
begin
  if not public.has_permission('students', 'edit') then
    raise exception 'Only staff who may edit students can change their classes.';
  end if;
  select * into v_student from public.students where id = p_student_id for update;
  if not found then
    raise exception 'Student not found.';
  end if;
  if not exists (select 1 from public.classrooms where id = p_classroom_id and status = 'active') then
    raise exception 'Pick a class that is still running.';
  end if;
  if exists (
    select 1 from public.student_classroom_periods
    where student_id = p_student_id and classroom_id = p_classroom_id and end_date is null
  ) then
    raise exception 'The student is already in this class.';
  end if;
  if v_student.classroom_id is null then
    update public.students set classroom_id = p_classroom_id where id = p_student_id;
  else
    insert into public.student_classroom_periods (student_id, classroom_id, start_date)
    values (p_student_id, p_classroom_id, (timezone('Asia/Kuala_Lumpur', now()))::date);
  end if;
end;
$$;

-- Take a student out of one class from today. Leaving the main class makes
-- another class they are in the main one (or none).
create or replace function public.remove_student_from_classroom(p_student_id bigint, p_classroom_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_next bigint;
begin
  if not public.has_permission('students', 'edit') then
    raise exception 'Only staff who may edit students can change their classes.';
  end if;
  select * into v_student from public.students where id = p_student_id for update;
  if not found then
    raise exception 'Student not found.';
  end if;
  if v_student.classroom_id = p_classroom_id then
    select p.classroom_id into v_next
    from public.student_classroom_periods p
    where p.student_id = p_student_id and p.end_date is null and p.classroom_id <> p_classroom_id
    order by p.start_date nulls first, p.id
    limit 1;
    update public.students set classroom_id = v_next where id = p_student_id;
    return;
  end if;
  delete from public.student_classroom_periods
  where student_id = p_student_id and classroom_id = p_classroom_id and end_date is null and start_date >= v_today;
  update public.student_classroom_periods
  set end_date = v_today
  where student_id = p_student_id and classroom_id = p_classroom_id and end_date is null;
end;
$$;

revoke all on function public.add_student_to_classroom(bigint, bigint) from public, anon;
revoke all on function public.remove_student_from_classroom(bigint, bigint) from public, anon;
grant execute on function public.add_student_to_classroom(bigint, bigint) to authenticated;
grant execute on function public.remove_student_from_classroom(bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Class videos

insert into public.app_settings (key, value)
values ('class_videos', '{"month_access": false}'::jsonb)
on conflict (key) do nothing;

create or replace function public.set_class_video_settings(p_month_access boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the video settings.';
  end if;
  if p_month_access is null then
    raise exception 'Say whether videos open month by month.';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('class_videos', jsonb_build_object('month_access', p_month_access), timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_class_video_settings(boolean) from public, anon;
grant execute on function public.set_class_video_settings(boolean) to authenticated;

-- A teacher's own Bunny library for a class (else the class's own library).
create table public.classroom_teacher_libraries (
  classroom_id bigint not null references public.classrooms (id) on delete cascade,
  teacher_id bigint not null references public.teachers (id) on delete cascade,
  library_id bigint not null references public.recording_libraries (id) on delete cascade,
  primary key (classroom_id, teacher_id)
);

alter table public.classroom_teacher_libraries enable row level security;
revoke all on public.classroom_teacher_libraries from public, anon, authenticated;
grant select on public.classroom_teacher_libraries to authenticated;
grant all on public.classroom_teacher_libraries to service_role;

create policy classroom_teacher_libraries_select_staff
  on public.classroom_teacher_libraries for select to authenticated
  using ((select public.current_teacher_id()) is not null);

create or replace function public.set_classroom_teacher_library(p_classroom_id bigint, p_teacher_id bigint, p_library_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can change where videos go.';
  end if;
  if p_library_id is null then
    delete from public.classroom_teacher_libraries where classroom_id = p_classroom_id and teacher_id = p_teacher_id;
    return;
  end if;
  if not exists (select 1 from public.recording_libraries where id = p_library_id) then
    raise exception 'That library does not exist.';
  end if;
  insert into public.classroom_teacher_libraries (classroom_id, teacher_id, library_id)
  values (p_classroom_id, p_teacher_id, p_library_id)
  on conflict (classroom_id, teacher_id) do update set library_id = excluded.library_id;
end;
$$;

revoke all on function public.set_classroom_teacher_library(bigint, bigint, bigint) from public, anon;
grant execute on function public.set_classroom_teacher_library(bigint, bigint, bigint) to authenticated;

-- May this login manage a class's videos? Anyone who may edit classes, the
-- class's teacher, or a teacher with their own library for that class.
create or replace function public.can_manage_class_videos(p_classroom_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_classes()
    or exists (select 1 from public.classrooms c where c.id = p_classroom_id and c.teacher_id = public.current_teacher_id())
    or exists (
      select 1 from public.classroom_teacher_libraries l
      where l.classroom_id = p_classroom_id and l.teacher_id = public.current_teacher_id()
    );
$$;

revoke all on function public.can_manage_class_videos(bigint) from public, anon;
grant execute on function public.can_manage_class_videos(bigint) to authenticated;

create table public.class_videos (
  id bigint generated always as identity primary key,
  classroom_id bigint not null references public.classrooms (id) on delete cascade,
  teacher_id bigint references public.teachers (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  description text check (description is null or char_length(description) <= 5000),
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  lesson_date date,
  bunny_library_id text not null check (bunny_library_id ~ '^[0-9]{1,12}$'),
  bunny_video_id text not null check (char_length(bunny_video_id) between 1 and 100),
  status text not null default 'ready' check (status in ('uploading', 'processing', 'ready', 'failed')),
  source text not null default 'upload' check (source in ('upload', 'zoom', 'import')),
  recording_id bigint references public.class_session_recordings (id) on delete set null,
  views integer not null default 0 check (views >= 0),
  legacy_id text unique,
  is_archived boolean not null default false,
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (bunny_library_id, bunny_video_id)
);

create index class_videos_classroom_month_idx on public.class_videos (classroom_id, year, month) where not is_archived;

alter table public.class_videos enable row level security;
revoke all on public.class_videos from public, anon, authenticated;
grant select on public.class_videos to authenticated;
grant all on public.class_videos to service_role;

create policy class_videos_select_staff
  on public.class_videos for select to authenticated
  using (
    (select public.can_view_classes())
    or teacher_id = (select public.current_teacher_id())
    or (select public.can_manage_class_videos(classroom_id))
  );

-- Change a video's title, description, month or lesson day.
create or replace function public.update_class_video(
  p_id bigint, p_title text, p_description text, p_year integer, p_month integer, p_lesson_date date
)
returns public.class_videos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.class_videos%rowtype;
begin
  select * into v_row from public.class_videos where id = p_id for update;
  if not found or not public.can_manage_class_videos(v_row.classroom_id) then
    raise exception 'Video not found.';
  end if;
  update public.class_videos
  set title = btrim(p_title),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      year = p_year,
      month = p_month,
      lesson_date = p_lesson_date,
      updated_at = timezone('utc', now())
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;

-- Hide a video from the app (or show it again). Archived, not deleted.
create or replace function public.set_class_video_archived(p_id bigint, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_classroom bigint;
begin
  select classroom_id into v_classroom from public.class_videos where id = p_id;
  if v_classroom is null or not public.can_manage_class_videos(v_classroom) then
    raise exception 'Video not found.';
  end if;
  update public.class_videos set is_archived = coalesce(p_archived, true), updated_at = timezone('utc', now()) where id = p_id;
end;
$$;

revoke all on function public.update_class_video(bigint, text, text, integer, integer, date) from public, anon;
revoke all on function public.set_class_video_archived(bigint, boolean) from public, anon;
grant execute on function public.update_class_video(bigint, text, text, integer, integer, date) to authenticated;
grant execute on function public.set_class_video_archived(bigint, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Month access

create table public.student_video_access (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students (id) on delete cascade,
  classroom_id bigint not null references public.classrooms (id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  starts_on date,
  ends_on date,
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (student_id, classroom_id, year, month),
  check (starts_on is null or ends_on is null or starts_on <= ends_on)
);

create index student_video_access_classroom_idx on public.student_video_access (classroom_id, year, month);

alter table public.student_video_access enable row level security;
revoke all on public.student_video_access from public, anon, authenticated;
grant select on public.student_video_access to authenticated;
grant all on public.student_video_access to service_role;

create policy student_video_access_select_staff
  on public.student_video_access for select to authenticated
  using (
    (select public.can_view_classes())
    or (select public.can_manage_class_videos(classroom_id))
    or exists (select 1 from public.students s where s.id = student_id)
  );

-- Give (p_granted true) or take away a student's month of a class's videos.
create or replace function public.set_student_video_access(
  p_student_id bigint, p_classroom_id bigint, p_year integer, p_month integer,
  p_granted boolean, p_starts_on date default null, p_ends_on date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.has_permission('students', 'edit') or public.can_manage_class_videos(p_classroom_id)) then
    raise exception 'Only staff who may edit students can open months.';
  end if;
  if not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'Student not found.';
  end if;
  if p_year not between 2000 and 2100 or p_month not between 1 and 12 then
    raise exception 'Pick a month.';
  end if;
  if coalesce(p_granted, false) then
    if p_starts_on is not null and p_ends_on is not null and p_starts_on > p_ends_on then
      raise exception 'The access must end after it starts.';
    end if;
    insert into public.student_video_access (student_id, classroom_id, year, month, starts_on, ends_on, created_by)
    values (p_student_id, p_classroom_id, p_year, p_month, p_starts_on, p_ends_on, public.current_teacher_id())
    on conflict (student_id, classroom_id, year, month)
      do update set starts_on = excluded.starts_on, ends_on = excluded.ends_on;
  else
    delete from public.student_video_access
    where student_id = p_student_id and classroom_id = p_classroom_id and year = p_year and month = p_month;
  end if;
end;
$$;

revoke all on function public.set_student_video_access(bigint, bigint, integer, integer, boolean, date, date) from public, anon;
grant execute on function public.set_student_video_access(bigint, bigint, integer, integer, boolean, date, date) to authenticated;

-- May this student watch this video today? In the class now, the video shown,
-- and (with month access on) access to its month today.
create or replace function public.student_can_watch_video(p_student_id bigint, p_video_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_videos v
    where v.id = p_video_id and not v.is_archived and v.status = 'ready'
      and public.is_in_classroom_on(p_student_id, v.classroom_id, (timezone('Asia/Kuala_Lumpur', now()))::date)
      and (
        coalesce((select (value ->> 'month_access')::boolean from public.app_settings where key = 'class_videos'), false) = false
        or exists (
          select 1 from public.student_video_access a
          where a.student_id = p_student_id and a.classroom_id = v.classroom_id and a.year = v.year and a.month = v.month
            and (a.starts_on is null or a.starts_on <= (timezone('Asia/Kuala_Lumpur', now()))::date)
            and (a.ends_on is null or (timezone('Asia/Kuala_Lumpur', now()))::date <= a.ends_on)
        )
      )
  );
$$;

revoke all on function public.student_can_watch_video(bigint, bigint) from public, anon;
grant execute on function public.student_can_watch_video(bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Watch progress

create table public.class_video_progress (
  student_id bigint not null references public.students (id) on delete cascade,
  video_id bigint not null references public.class_videos (id) on delete cascade,
  watch_percentage numeric(5, 2) not null default 0 check (watch_percentage between 0 and 100),
  watch_seconds integer not null default 0 check (watch_seconds >= 0),
  rewatch_count integer not null default 0 check (rewatch_count >= 0),
  opened_at timestamptz not null default timezone('utc', now()),
  last_watched_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  primary key (student_id, video_id)
);

create index class_video_progress_video_idx on public.class_video_progress (video_id);

alter table public.class_video_progress enable row level security;
revoke all on public.class_video_progress from public, anon, authenticated;
grant select on public.class_video_progress to authenticated;
grant all on public.class_video_progress to service_role;

create policy class_video_progress_select_staff
  on public.class_video_progress for select to authenticated
  using (
    (select public.can_view_classes())
    or exists (select 1 from public.students s where s.id = student_id)
  );

-- The app reports watching: p_opened when the video starts (a view, and a
-- re-watch if it was finished before), then the furthest point reached.
create or replace function public.portal_save_video_progress(
  p_student_id bigint, p_video_id bigint, p_percentage numeric, p_seconds integer, p_opened boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_percent numeric := least(greatest(coalesce(p_percentage, 0), 0), 100);
  v_seconds integer := greatest(coalesce(p_seconds, 0), 0);
  v_now timestamptz := timezone('utc', now());
begin
  if not public.portal_may_act_for(p_student_id) or not public.student_can_watch_video(p_student_id, p_video_id) then
    raise exception 'Not found.';
  end if;
  insert into public.class_video_progress (student_id, video_id, watch_percentage, watch_seconds, opened_at, last_watched_at, completed_at)
  values (p_student_id, p_video_id, v_percent, v_seconds, v_now, v_now, case when v_percent >= 90 then v_now end)
  on conflict (student_id, video_id) do update
    set watch_percentage = greatest(class_video_progress.watch_percentage, excluded.watch_percentage),
        watch_seconds = greatest(class_video_progress.watch_seconds, excluded.watch_seconds),
        rewatch_count = class_video_progress.rewatch_count
          + case when coalesce(p_opened, false) and class_video_progress.completed_at is not null then 1 else 0 end,
        last_watched_at = v_now,
        completed_at = coalesce(class_video_progress.completed_at, excluded.completed_at);
  if coalesce(p_opened, false) then
    update public.class_videos set views = views + 1 where id = p_video_id;
  end if;
end;
$$;

revoke all on function public.portal_save_video_progress(bigint, bigint, numeric, integer, boolean) from public, anon;
grant execute on function public.portal_save_video_progress(bigint, bigint, numeric, integer, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. What the app shows: the child's classes with the videos they may watch,
-- newest month first, and the months that are closed to them.

create or replace function public.portal_class_videos(p_student_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
begin
  if not public.portal_may_act_for(p_student_id) then
    raise exception 'Not found.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'classroom_id', c.id,
      'class', c.name,
      'videos', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', v.id,
          'title', v.title,
          'description', v.description,
          'year', v.year,
          'month', v.month,
          'lesson_date', v.lesson_date,
          'embed_url', 'https://player.mediadelivery.net/embed/' || v.bunny_library_id || '/' || v.bunny_video_id,
          'thumbnail_url', 'https://player.mediadelivery.net/embed/' || v.bunny_library_id || '/' || v.bunny_video_id || '/thumbnail.jpg',
          'watched', coalesce(pr.watch_percentage, 0),
          'completed', pr.completed_at is not null
        ) order by v.year desc, v.month desc, v.lesson_date desc nulls last, v.id desc)
        from public.class_videos v
        left join public.class_video_progress pr on pr.video_id = v.id and pr.student_id = p_student_id
        where v.classroom_id = c.id and public.student_can_watch_video(p_student_id, v.id)
      ), '[]'::jsonb),
      'closed_months', coalesce((
        select jsonb_agg(distinct jsonb_build_object('year', v.year, 'month', v.month))
        from public.class_videos v
        where v.classroom_id = c.id and not v.is_archived and v.status = 'ready'
          and not public.student_can_watch_video(p_student_id, v.id)
      ), '[]'::jsonb)
    ) order by c.name)
    from public.classrooms c
    where public.is_in_classroom_on(p_student_id, c.id, v_today)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.portal_class_videos(bigint) from public, anon;
grant execute on function public.portal_class_videos(bigint) to authenticated;
