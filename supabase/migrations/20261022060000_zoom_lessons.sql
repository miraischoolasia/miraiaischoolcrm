-- Zoom for each lesson (phase 2 of the classroom plan).
--
-- The teacher makes the lesson's Zoom meeting from the CRM (zoom-lesson
-- function, with the school's own Zoom account: function secrets, never a
-- table). Each child in the lesson is signed up to it and gets a link of their
-- own (class_session_zoom_links), which the student app shows for that lesson.
-- Zoom tells us who was in the meeting and when (zoom-webhook function), so the
-- attendance form can be filled in from the minutes online, and sends the
-- recording when it is ready, which the app shows under that lesson.
--
-- All of it is staff-only, read through RLS like class_sessions; only the
-- functions (service role) write it. The app reads its own link and the
-- recordings through portal_home.

alter table public.class_session_zoom
  add column if not exists uses_registration boolean not null default true,
  add column if not exists topic text check (topic is null or char_length(topic) <= 200),
  add column if not exists created_by bigint references public.teachers (id) on delete set null;

create table public.class_session_zoom_links (
  session_id bigint not null references public.class_sessions (id) on delete cascade,
  student_id bigint not null references public.students (id) on delete cascade,
  registrant_id text check (registrant_id is null or char_length(registrant_id) <= 100),
  join_url text not null check (char_length(join_url) <= 1000),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (session_id, student_id)
);

create table public.zoom_participation (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.class_sessions (id) on delete cascade,
  student_id bigint references public.students (id) on delete set null,
  participant_uuid text not null check (char_length(participant_uuid) <= 200),
  user_name text check (user_name is null or char_length(user_name) <= 200),
  joined_at timestamptz not null,
  left_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (session_id, participant_uuid, joined_at),
  check (left_at is null or left_at >= joined_at)
);

create index zoom_participation_session_idx on public.zoom_participation (session_id, student_id);

create table public.class_session_recordings (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.class_sessions (id) on delete cascade,
  zoom_recording_uuid text not null check (char_length(zoom_recording_uuid) <= 200),
  share_url text check (share_url is null or char_length(share_url) <= 1000),
  passcode text check (passcode is null or char_length(passcode) <= 100),
  started_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (session_id, zoom_recording_uuid)
);

alter table public.class_session_zoom_links enable row level security;
alter table public.zoom_participation enable row level security;
alter table public.class_session_recordings enable row level security;

revoke all on public.class_session_zoom_links from public, anon, authenticated;
revoke all on public.zoom_participation from public, anon, authenticated;
revoke all on public.class_session_recordings from public, anon, authenticated;
grant select on public.class_session_zoom_links to authenticated;
grant select on public.zoom_participation to authenticated;
grant select on public.class_session_recordings to authenticated;
grant all on public.class_session_zoom_links to service_role;
grant all on public.zoom_participation to service_role;
grant all on public.class_session_recordings to service_role;

create policy class_session_zoom_links_select_staff
  on public.class_session_zoom_links for select to authenticated
  using ((select public.can_see_class_session(session_id)));

create policy zoom_participation_select_staff
  on public.zoom_participation for select to authenticated
  using ((select public.can_see_class_session(session_id)));

create policy class_session_recordings_select_staff
  on public.class_session_recordings for select to authenticated
  using ((select public.can_see_class_session(session_id)));

-- ---------------------------------------------------------------------------
-- Who is in a lesson (for signing them up to its meeting)

create or replace function public.class_session_roster(p_session_id bigint)
returns table (student_id bigint, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.full_name
  from public.students s
  where public.can_see_class_session(p_session_id)
    and public.is_class_session_student(p_session_id, s.id)
  order by s.full_name;
$$;

revoke all on function public.class_session_roster(bigint) from public, anon;
grant execute on function public.class_session_roster(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Minutes each child was in the lesson's meeting, inside the lesson's time
-- (from 15 minutes before it starts to 30 minutes after it ends), and whether
-- that counts as there (the school's 'zoom_attendance' present_percent of the
-- lesson, default half).

insert into public.app_settings (key, value)
values ('zoom_attendance', '{"present_percent": 50}'::jsonb)
on conflict (key) do nothing;

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
    set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_zoom_attendance(integer) from public, anon;
grant execute on function public.set_zoom_attendance(integer) to authenticated;

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
      least(coalesce(zp.left_at, least(timezone('utc', now()), s.ends_at + interval '30 minutes')), s.ends_at + interval '30 minutes') as to_at,
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

revoke all on function public.lesson_zoom_minutes(bigint, date) from public, anon;
grant execute on function public.lesson_zoom_minutes(bigint, date) to authenticated;

-- ---------------------------------------------------------------------------
-- The app: the child's own Zoom link and the lesson recordings

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
  v_consents jsonb;
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
          -- The child's own link for that lesson's meeting, else the
          -- meeting's link (no sign-up), else the class's fixed link.
          'zoom_link', coalesce(
            (select zl.join_url from public.class_sessions cs
             join public.class_session_zoom_links zl on zl.session_id = cs.id and zl.student_id = p_student_id
             where cs.schedule_id = s.id and cs.lesson_date = d::date),
            (select z.join_url from public.class_sessions cs
             join public.class_session_zoom z on z.session_id = cs.id
             where cs.schedule_id = s.id and cs.lesson_date = d::date and not z.uses_registration),
            c.zoom_link)
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
        ), '[]'::jsonb) else '[]'::jsonb end,
        'recording', case when coalesce((v_sees ->> 'recordings')::boolean, false) then (
          select jsonb_build_object('url', r.share_url, 'passcode', r.passcode)
          from public.class_sessions cs
          join public.class_session_recordings r on r.session_id = cs.id
          where cs.schedule_id = l.schedule_id and cs.lesson_date = l.lesson_date and r.share_url is not null
          order by r.started_at nulls last
          limit 1
        ) end
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
    select coalesce(sum(points), 0) into v_total from public.student_points sp
    where sp.student_id = p_student_id and not public.is_unrevealed_question_points(sp.id);
    v_result := v_result || jsonb_build_object('points', jsonb_build_object(
      'total', v_total,
      'level', (select name from public.reward_levels where min_points <= v_total order by min_points desc limit 1),
      'next_level', (select jsonb_build_object('name', name, 'min_points', min_points)
                     from public.reward_levels where min_points > v_total order by min_points limit 1),
      'level_start', coalesce((select max(min_points) from public.reward_levels where min_points <= v_total), 0),
      'recent', coalesce((
        select jsonb_agg(jsonb_build_object('reason', reason, 'points', points, 'kind', kind,
                                            'date', coalesce(lesson_date, created_at::date)) order by id desc)
        from (select * from public.student_points sp
              where sp.student_id = p_student_id and not public.is_unrevealed_question_points(sp.id)
              order by id desc limit 20) recent
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

  -- The teacher's report, once a teacher shares it in the app.
  if coalesce((v_sees ->> 'report')::boolean, false) then
    v_result := v_result || jsonb_build_object('report', (
      select jsonb_build_object('report', r.report, 'shared_at', r.shared_at)
      from public.student_ai_reports r
      where r.student_id = p_student_id and r.audience = 'parent' and r.shared_at is not null
      order by r.shared_at desc
      limit 1
    ));
  end if;

  -- What the parent agreed to (only a parent's login answers these).
  if v_viewer = 'parent' then
    select value into v_consents from public.app_settings where key = 'portal_consents';
    v_result := v_result || jsonb_build_object('consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', k.kind,
        'title', coalesce(v_consents -> k.kind ->> 'title', k.kind),
        'text', coalesce(v_consents -> k.kind ->> 'text', ''),
        'required', coalesce((v_consents -> k.kind ->> 'required')::boolean, false),
        'granted', c.granted,
        'at', c.created_at
      ) order by k.ordinality)
      from unnest(array['ai_analysis', 'class_recording']) with ordinality k(kind, ordinality)
      left join lateral (
        select sc.granted, sc.created_at from public.student_consents sc
        where sc.student_id = p_student_id and sc.kind = k.kind
        order by sc.id desc limit 1
      ) c on true
    ), '[]'::jsonb));
  end if;

  return v_result;
end;
$$;

revoke all on function public.portal_home(bigint) from public, anon;
grant execute on function public.portal_home(bigint) to authenticated;
