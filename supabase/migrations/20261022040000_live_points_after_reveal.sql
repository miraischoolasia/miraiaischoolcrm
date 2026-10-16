-- Points for a class question stay out of the app until the teacher shows
-- the answer, so a child cannot refresh the app to learn whether they were
-- right. If the teacher never shows it, the points appear the next day.
-- (The answer itself is held back by portal_live_state.)

create or replace function public.is_unrevealed_question_points(p_points_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.live_answers a
    join public.live_questions q on q.id = a.live_question_id
    join public.class_sessions cs on cs.id = a.session_id
    where a.points_entry_id = p_points_id
      and q.revealed_at is null
      and cs.lesson_date >= (timezone('Asia/Kuala_Lumpur', now()))::date
  );
$$;

revoke all on function public.is_unrevealed_question_points(bigint) from public, anon;
grant execute on function public.is_unrevealed_question_points(bigint) to authenticated;

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

  return v_result;
end;
$$;


revoke all on function public.portal_home(bigint) from public, anon;
grant execute on function public.portal_home(bigint) to authenticated;
