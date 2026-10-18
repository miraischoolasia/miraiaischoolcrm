-- What the child sees during and after a lesson.
--
-- 1. Points at once: an app login (the child, or their parent) may read that
--    child's own rows of student_points, live (realtime), when the school
--    shows points to that login (Class Settings > Student app). The app
--    shows "+5 Great answer" with an effect the moment the teacher gives it.
--    Question points are only written when the teacher shows the answer, so
--    nothing is given away early.
-- 2. A summary of each lesson for the family (portal_lesson_summaries): time
--    in Zoom, questions answered and right (shown ones only), and the
--    lesson's points (when shown to that login).
-- 3. A Zoom check before class (student_zoom_checks): the family tries
--    Zoom's test meeting from the app and says whether it worked; the
--    teacher sees it on the live class console.

-- ---------------------------------------------------------------------------
-- Does the school show this part ('points', 'scores', ...) to this login?

create or replace function public.portal_sees(p_student_id bigint, p_part text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.portal_may_act_for(p_student_id)
    and coalesce((
      (select value from public.app_settings where key = 'student_portal')
        -> (case when public.current_student_id() = p_student_id then 'student' else 'parent' end || '_sees')
        ->> p_part
    )::boolean, false);
$$;

revoke all on function public.portal_sees(bigint, text) from public, anon;
grant execute on function public.portal_sees(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. The child's own points, live

drop policy if exists student_points_select_portal on public.student_points;
create policy student_points_select_portal
  on public.student_points for select to authenticated
  using ((select public.portal_sees(student_id, 'points')));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'student_points'
    ) then
    alter publication supabase_realtime add table public.student_points;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. A summary of each lesson (the last 20 the child was in, up to today)

create or replace function public.portal_lesson_summaries(p_student_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_points boolean;
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
begin
  if not public.portal_may_act_for(p_student_id) then
    raise exception 'Not found.';
  end if;
  v_points := public.portal_sees(p_student_id, 'points');

  return coalesce((
    select jsonb_agg(summary order by summary ->> 'date' desc, summary ->> 'start' desc)
    from (
      select jsonb_build_object(
        'session_id', cs.id,
        'date', cs.lesson_date,
        'start', to_char(timezone('Asia/Kuala_Lumpur', cs.starts_at), 'HH24:MI'),
        'title', s.title,
        'lesson_minutes', round(extract(epoch from (cs.ends_at - cs.starts_at)) / 60)::integer,
        -- Time in the lesson's Zoom, inside the lesson (a dropped connection
        -- counted as the school sets it); null when the lesson had no meeting.
        'zoom_minutes', case when exists (select 1 from public.class_session_zoom z where z.session_id = cs.id) then (
          select coalesce(round(sum(greatest(extract(epoch from (
            least(coalesce(public.zoom_counted_left_at(zp.joined_at, zp.left_at, zp.dropped), now()), cs.ends_at)
            - greatest(zp.joined_at, cs.starts_at))), 0)) / 60)::integer, 0)
          from public.zoom_participation zp
          where zp.session_id = cs.id and zp.student_id = p_student_id
        ) end,
        'questions', (select count(*) from public.live_questions q where q.session_id = cs.id and q.revealed_at is not null),
        'answered', (
          select count(*) from public.live_answers a
          join public.live_questions q on q.id = a.live_question_id
          where q.session_id = cs.id and q.revealed_at is not null and a.student_id = p_student_id
        ),
        'right', (
          select count(*) from public.live_answers a
          join public.live_questions q on q.id = a.live_question_id
          where q.session_id = cs.id and q.revealed_at is not null and a.student_id = p_student_id and a.result = 'correct'
        ),
        'points', case when v_points then (
          select coalesce(sum(p.points), 0) from public.student_points p
          where p.student_id = p_student_id and p.schedule_id = cs.schedule_id and p.lesson_date = cs.lesson_date
        ) end
      ) as summary
      from public.class_sessions cs
      join public.schedules s on s.id = cs.schedule_id
      where cs.lesson_date <= v_today
        and cs.starts_at <= now()
        and public.is_class_session_student(cs.id, p_student_id)
      order by cs.lesson_date desc, cs.starts_at desc
      limit 20
    ) lessons
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.portal_lesson_summaries(bigint) from public, anon;
grant execute on function public.portal_lesson_summaries(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The Zoom check before class

create table if not exists public.student_zoom_checks (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students (id) on delete cascade,
  ok boolean not null,
  -- 'web', 'ios', 'android': where the family tried it.
  platform text check (platform is null or platform in ('web', 'ios', 'android')),
  checked_at timestamptz not null default timezone('utc', now()),
  checked_by uuid
);

create index if not exists student_zoom_checks_student_idx on public.student_zoom_checks (student_id, checked_at desc);

alter table public.student_zoom_checks enable row level security;
revoke all on public.student_zoom_checks from public, anon, authenticated;
grant select on public.student_zoom_checks to authenticated;
grant all on public.student_zoom_checks to service_role;

drop policy if exists student_zoom_checks_select on public.student_zoom_checks;
create policy student_zoom_checks_select
  on public.student_zoom_checks for select to authenticated
  using (
    ((select public.current_teacher_id()) is not null and student_id in (select s.id from public.students s))
    or (select public.portal_may_act_for(student_id))
  );

create or replace function public.portal_record_zoom_check(p_student_id bigint, p_ok boolean, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.portal_may_act_for(p_student_id) then
    raise exception 'Not found.';
  end if;
  if p_ok is null then
    raise exception 'Say whether Zoom worked.';
  end if;
  if p_platform is not null and p_platform not in ('web', 'ios', 'android') then
    raise exception 'Unknown device.';
  end if;
  -- One answer a minute is plenty.
  if exists (
    select 1 from public.student_zoom_checks
    where student_id = p_student_id and checked_at > timezone('utc', now()) - interval '1 minute'
  ) then
    update public.student_zoom_checks
      set ok = p_ok, platform = p_platform, checked_at = timezone('utc', now())
    where id = (select id from public.student_zoom_checks where student_id = p_student_id order by checked_at desc limit 1);
    return;
  end if;
  insert into public.student_zoom_checks (student_id, ok, platform, checked_by)
  values (p_student_id, p_ok, p_platform, auth.uid());
end;
$$;

revoke all on function public.portal_record_zoom_check(bigint, boolean, text) from public, anon;
grant execute on function public.portal_record_zoom_check(bigint, boolean, text) to authenticated;
