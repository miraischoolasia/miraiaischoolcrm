-- Who is in the lesson right now (teacher's room list), strangers, the waiting
-- room, and leaves that Zoom reports late.
--
-- 1. zoom_participation keeps Zoom's leave reason. When a child's connection
--    drops (a closed browser tab, lost Wi-Fi) Zoom only says "left" after its
--    own time-out, minutes later. Such a leave is marked `dropped`, and the
--    minutes count it as ending the school's drop_grace_seconds earlier
--    (zoom_attendance setting, 0 until measured on the school's Zoom;
--    late_minutes there too, default 5).
-- 2. is_host marks the teacher's own join; anyone else who is not one of the
--    lesson's children is a stranger the teacher is told about (and can clear).
-- 3. zoom_waiting: who is in Zoom's waiting room, so the teacher sees whom to
--    Admit (admitting stays in Zoom).
-- 4. Facebook Live per lesson (class_session_zoom.fb_live_*): the teacher
--    switches it on; zoom-lesson / zoom-webhook start and stop the stream.
--
-- Only the zoom-webhook function (service role) writes; staff who may see the
-- lesson read, live (realtime).

alter table public.zoom_participation
  add column if not exists leave_reason text check (leave_reason is null or char_length(leave_reason) <= 300),
  add column if not exists dropped boolean not null default false,
  add column if not exists is_host boolean not null default false,
  add column if not exists stranger_cleared_at timestamptz,
  add column if not exists stranger_cleared_by bigint references public.teachers (id) on delete set null;

alter table public.class_session_zoom
  add column if not exists fb_live_wanted boolean not null default false,
  add column if not exists fb_live_id text check (fb_live_id is null or char_length(fb_live_id) <= 100),
  add column if not exists fb_live_url text check (fb_live_url is null or char_length(fb_live_url) <= 1000),
  add column if not exists fb_live_error text check (fb_live_error is null or char_length(fb_live_error) <= 300),
  add column if not exists fb_live_started_at timestamptz;

create table if not exists public.zoom_waiting (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.class_sessions (id) on delete cascade,
  student_id bigint references public.students (id) on delete set null,
  participant_uuid text not null check (char_length(participant_uuid) <= 200),
  user_name text check (user_name is null or char_length(user_name) <= 200),
  entered_at timestamptz not null,
  left_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (session_id, participant_uuid, entered_at),
  check (left_at is null or left_at >= entered_at)
);

create index if not exists zoom_waiting_session_idx on public.zoom_waiting (session_id);

alter table public.zoom_waiting enable row level security;
revoke all on public.zoom_waiting from public, anon, authenticated;
grant select on public.zoom_waiting to authenticated;
grant all on public.zoom_waiting to service_role;

drop policy if exists zoom_waiting_select_staff on public.zoom_waiting;
create policy zoom_waiting_select_staff
  on public.zoom_waiting for select to authenticated
  using ((select public.can_see_class_session(session_id)));

-- ---------------------------------------------------------------------------
-- Clearing a stranger notice (the teacher removed them in Zoom, or knows them)

create or replace function public.clear_zoom_stranger(p_participation_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session bigint;
begin
  select session_id into v_session
  from public.zoom_participation
  where id = p_participation_id and student_id is null and not is_host;
  if v_session is null or not public.can_see_class_session(v_session) then
    raise exception 'Not found.';
  end if;
  update public.zoom_participation
    set stranger_cleared_at = timezone('utc', now()), stranger_cleared_by = public.current_teacher_id()
  where id = p_participation_id and stranger_cleared_at is null;
end;
$$;

revoke all on function public.clear_zoom_stranger(bigint) from public, anon;
grant execute on function public.clear_zoom_stranger(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Late leaves: the school's grace, kept with the attendance rule

create or replace function public.set_zoom_attendance(p_present_percent integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the Zoom attendance rule.';
  end if;
  if p_present_percent is null or p_present_percent not between 1 and 100 then
    raise exception 'Choose 1 to 100 percent of the lesson.';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('zoom_attendance', jsonb_build_object('present_percent', p_present_percent), timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = public.app_settings.value || jsonb_build_object('present_percent', p_present_percent),
        updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

-- drop_grace_seconds: how much earlier a dropped connection really ended.
-- late_minutes: a child who first joins later than this after the start is
-- shown as late on the teacher's room list.
create or replace function public.set_zoom_room_rules(p_drop_grace_seconds integer, p_late_minutes integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rules jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the Zoom attendance rule.';
  end if;
  if p_drop_grace_seconds is null or p_drop_grace_seconds not between 0 and 900 then
    raise exception 'Choose 0 to 900 seconds.';
  end if;
  if p_late_minutes is null or p_late_minutes not between 0 and 120 then
    raise exception 'Choose 0 to 120 minutes.';
  end if;
  v_rules := jsonb_build_object('drop_grace_seconds', p_drop_grace_seconds, 'late_minutes', p_late_minutes);
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('zoom_attendance', jsonb_build_object('present_percent', 50) || v_rules, timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = public.app_settings.value || v_rules,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_zoom_room_rules(integer, integer) from public, anon;
grant execute on function public.set_zoom_room_rules(integer, integer) to authenticated;

update public.app_settings
  set value = jsonb_build_object('drop_grace_seconds', 0, 'late_minutes', 5) || value
where key = 'zoom_attendance';

-- When a stay really ended: a dropped connection ends the grace earlier
-- (never before the join).
create or replace function public.zoom_counted_left_at(p_joined_at timestamptz, p_left_at timestamptz, p_dropped boolean)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_left_at is null or not p_dropped then p_left_at
    else greatest(
      p_joined_at,
      p_left_at - make_interval(secs => coalesce(
        (select (value ->> 'drop_grace_seconds')::integer from public.app_settings where key = 'zoom_attendance'), 0))
    )
  end;
$$;

revoke all on function public.zoom_counted_left_at(timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.zoom_counted_left_at(timestamptz, timestamptz, boolean) to authenticated;

create or replace function public.lesson_zoom_minutes(p_schedule_id bigint, p_lesson_date date)
returns table (student_id bigint, minutes integer, counts_as_present boolean)
language sql
stable
security definer
set search_path = public
as $$
  with session as (
    select cs.* from public.class_sessions cs
    where cs.schedule_id = p_schedule_id and cs.lesson_date = p_lesson_date
      and public.can_see_class_session(cs.id)
  ),
  rule as (
    select coalesce((select (value ->> 'present_percent')::integer from public.app_settings where key = 'zoom_attendance'), 50) as percent
  ),
  spans as (
    select zp.student_id,
      greatest(zp.joined_at, s.starts_at - interval '15 minutes') as from_at,
      least(
        coalesce(public.zoom_counted_left_at(zp.joined_at, zp.left_at, zp.dropped),
                 least(timezone('utc', now()), s.ends_at + interval '30 minutes')),
        s.ends_at + interval '30 minutes') as to_at,
      s.starts_at, s.ends_at
    from public.zoom_participation zp
    join session s on s.id = zp.session_id
    where zp.student_id is not null
  )
  select sp.student_id,
    round(sum(greatest(extract(epoch from (sp.to_at - sp.from_at)), 0)) / 60)::integer,
    sum(greatest(extract(epoch from (sp.to_at - sp.from_at)), 0))
      >= extract(epoch from (min(sp.ends_at) - min(sp.starts_at))) * (select percent from rule) / 100.0
  from spans sp
  group by sp.student_id;
$$;

-- ---------------------------------------------------------------------------
-- Real time: the teacher's room list updates as Zoom tells us.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['zoom_participation', 'zoom_waiting'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
