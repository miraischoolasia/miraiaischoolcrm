-- Lesson recordings go to Bunny Stream (each school's own libraries), and
-- Zoom's cloud copy is deleted once Bunny has the video ready.
--
-- When Zoom finishes a recording (zoom-webhook), Bunny is asked to fetch the
-- video straight from Zoom (no big file through our server) into the library
-- of the lesson's class. Bunny tells the recording-bunny function when it has
-- processed it (or a teacher presses Check); the function asks Bunny itself,
-- and only when Bunny says the video is finished is it marked ready and, when
-- the school wants it (app_settings 'zoom_recordings'), deleted from Zoom.
-- The student app plays the Bunny copy.
--
-- A library's access key is a secret: no signed-in user can read
-- recording_libraries; admins see only whether a key is set.

create table public.recording_libraries (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  library_id text not null check (library_id ~ '^[0-9]{1,12}$'),
  api_key text not null check (char_length(api_key) between 8 and 200),
  collection_id text check (collection_id is null or char_length(collection_id) <= 80),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.recording_libraries enable row level security;
revoke all on public.recording_libraries from public, anon, authenticated;
grant all on public.recording_libraries to service_role;

alter table public.classrooms
  add column if not exists recording_library_id bigint references public.recording_libraries (id) on delete set null;

alter table public.class_session_recordings
  add column if not exists bunny_library_id text,
  add column if not exists bunny_video_id text,
  add column if not exists bunny_status text check (bunny_status in ('sending', 'sent', 'ready', 'failed', 'no_library')),
  add column if not exists bunny_detail text check (bunny_detail is null or char_length(bunny_detail) <= 500),
  add column if not exists zoom_deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create index if not exists class_session_recordings_bunny_idx on public.class_session_recordings (bunny_video_id) where bunny_video_id is not null;

insert into public.app_settings (key, value)
values ('zoom_recordings', '{"delete_zoom_after_upload": true}'::jsonb)
on conflict (key) do nothing;

create or replace function public.set_recording_settings(p_delete_zoom_after_upload boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the recording settings.';
  end if;
  if p_delete_zoom_after_upload is null then
    raise exception 'Say whether to delete Zoom''s copy.';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('zoom_recordings', jsonb_build_object('delete_zoom_after_upload', p_delete_zoom_after_upload),
          timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

-- What the admin page shows: everything but the key.
create or replace function public.recording_libraries_list()
returns table (id bigint, name text, library_id text, collection_id text, has_key boolean, classes bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can see the recording libraries.';
  end if;
  return query
    select l.id, l.name, l.library_id, l.collection_id, l.api_key <> '',
      (select count(*) from public.classrooms c where c.recording_library_id = l.id)
    from public.recording_libraries l
    order by l.name;
end;
$$;

-- Add (p_id null) or change a library. An empty key on a change keeps the key.
create or replace function public.save_recording_library(p_id bigint, p_name text, p_library_id text, p_api_key text, p_collection_id text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the recording libraries.';
  end if;
  if p_id is null then
    if coalesce(btrim(p_api_key), '') = '' then
      raise exception 'Paste the library''s access key.';
    end if;
    insert into public.recording_libraries (name, library_id, api_key, collection_id)
    values (btrim(p_name), btrim(p_library_id), btrim(p_api_key), nullif(btrim(coalesce(p_collection_id, '')), ''))
    returning id into v_id;
  else
    update public.recording_libraries
    set name = btrim(p_name),
        library_id = btrim(p_library_id),
        api_key = coalesce(nullif(btrim(coalesce(p_api_key, '')), ''), api_key),
        collection_id = nullif(btrim(coalesce(p_collection_id, '')), ''),
        updated_at = timezone('utc', now())
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'That library does not exist.';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_recording_library(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the recording libraries.';
  end if;
  delete from public.recording_libraries where id = p_id;
end;
$$;

-- Which library a class's recordings go to (null: none, they stay on Zoom).
create or replace function public.set_classroom_recording_library(p_classroom_id bigint, p_library_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can change where recordings go.';
  end if;
  if p_library_id is not null and not exists (select 1 from public.recording_libraries where id = p_library_id) then
    raise exception 'That library does not exist.';
  end if;
  update public.classrooms set recording_library_id = p_library_id where id = p_classroom_id;
  if not found then
    raise exception 'Class not found.';
  end if;
end;
$$;

revoke all on function public.set_recording_settings(boolean) from public, anon;
revoke all on function public.recording_libraries_list() from public, anon;
revoke all on function public.save_recording_library(bigint, text, text, text, text) from public, anon;
revoke all on function public.delete_recording_library(bigint) from public, anon;
revoke all on function public.set_classroom_recording_library(bigint, bigint) from public, anon;
grant execute on function public.set_recording_settings(boolean) to authenticated;
grant execute on function public.recording_libraries_list() to authenticated;
grant execute on function public.save_recording_library(bigint, text, text, text, text) to authenticated;
grant execute on function public.delete_recording_library(bigint) to authenticated;
grant execute on function public.set_classroom_recording_library(bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- The app plays the Bunny copy once it is ready

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
        -- The Bunny copy once it is ready, else Zoom's while Zoom still has it.
        'recording', case when coalesce((v_sees ->> 'recordings')::boolean, false) then (
          select case
            when r.bunny_status = 'ready' then jsonb_build_object(
              'url', 'https://iframe.mediadelivery.net/embed/' || r.bunny_library_id || '/' || r.bunny_video_id, 'passcode', null)
            else jsonb_build_object('url', r.share_url, 'passcode', r.passcode)
          end
          from public.class_sessions cs
          join public.class_session_recordings r on r.session_id = cs.id
          where cs.schedule_id = l.schedule_id and cs.lesson_date = l.lesson_date
            and (r.bunny_status = 'ready' or (r.share_url is not null and r.zoom_deleted_at is null))
          order by (r.bunny_status = 'ready') desc, r.started_at nulls last
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
