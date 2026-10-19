-- The student app's Zoom link for an upcoming lesson falls back to that
-- weekly lesson's own fixed link (schedules.zoom_link, added in
-- 20261025200000) before the class's fixed link.
--
-- Same portal_home as 20261024700000_class_live_channel.sql with only that
-- one fallback changed, so it must run after that migration.

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
          -- The lesson's class session once the teacher has opened it, and
          -- whether it has a Zoom meeting the app can join in the page.
          'session_id', (select cs.id from public.class_sessions cs
                         where cs.schedule_id = s.id and cs.lesson_date = d::date),
          'in_app_zoom', exists (select 1 from public.class_sessions cs
                                 join public.class_session_zoom z on z.session_id = cs.id
                                 where cs.schedule_id = s.id and cs.lesson_date = d::date),
          -- The child's own link for that lesson's meeting, else the
          -- meeting's link (no sign-up), else the weekly lesson's fixed
          -- link, else the class's.
          'zoom_link', coalesce(
            (select zl.join_url from public.class_sessions cs
             join public.class_session_zoom_links zl on zl.session_id = cs.id and zl.student_id = p_student_id
             where cs.schedule_id = s.id and cs.lesson_date = d::date),
            (select z.join_url from public.class_sessions cs
             join public.class_session_zoom z on z.session_id = cs.id
             where cs.schedule_id = s.id and cs.lesson_date = d::date and not z.uses_registration),
            s.zoom_link,
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
