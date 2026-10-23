-- The lesson report at the end of a class (teacher version A, student version A;
-- docs/design/class-end-report/, owner's choices 2026-10-23).
--
-- Nothing is copied: each child's record of each lesson is worked out from what
-- is already kept for good:
--   questions and answers  live_questions + live_answers
--   time in the lesson     zoom_participation (one row per join, so several spans)
--   attendance             lesson_log_students (latest revision of the lesson's log)
--   points                 student_points (schedule + lesson date)
-- New here:
-- 1. class_session_events: the teacher picking a child in class (was only shown
--    live, never kept), so a child who neither answered nor was picked shows as
--    "silent".
-- 2. class_report_seen: the student app shows a lesson's report by itself once
--    (again when the teacher later adds attendance or remarks).
-- 3. staff_notifications.class_session_id: a "needs care" note sent from the
--    report to the child's Handled by opens that lesson's report.
-- 4. Functions and two views other parts read (② reads the views for the
--    management and Learning Consultant numbers; its background checks, with
--    nobody signed in, read automation.lesson_student_records_core):
--      lesson_student_records(...)   / view student_lesson_records
--      lesson_student_answers(...)   / view student_lesson_answers
--      student_lesson_history(student)           CRM student page
--      student_handled_by(student)               Learning Consultant, else the PIC of the lead that became the student
--      send_lesson_care_notes(session, items)    report -> Handled by's bell
--      record_class_pick(session, student)       teacher console, when a child is picked
--      portal_lesson_report / portal_unseen_lesson_reports / portal_mark_report_seen / portal_class_question_history
-- Lessons with attendance only (no class session: the live class console was
-- never opened) are not in these records; their attendance is in lesson_logs.

-- ---------------------------------------------------------------------------
-- 1. Children picked in class

create table public.class_session_events (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.class_sessions (id) on delete cascade,
  kind text not null check (kind in ('pick')),
  student_id bigint references public.students (id) on delete cascade,
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index class_session_events_session_idx on public.class_session_events (session_id, student_id);

alter table public.class_session_events enable row level security;
revoke all on public.class_session_events from public, anon, authenticated;
grant select on public.class_session_events to authenticated;
grant all on public.class_session_events to service_role;

create policy class_session_events_select_staff
  on public.class_session_events for select to authenticated
  using (public.can_see_class_session(session_id));

create or replace function public.record_class_pick(p_session_id bigint, p_student_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.can_see_class_session(p_session_id) then
    raise exception 'Only the class''s teacher can do this.';
  end if;
  if p_student_id is null then
    return null;
  end if;
  insert into public.class_session_events (session_id, kind, student_id, created_by)
  values (p_session_id, 'pick', p_student_id, public.current_teacher_id())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_class_pick(bigint, bigint) from public, anon;
grant execute on function public.record_class_pick(bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Reports the student app has shown

create table public.class_report_seen (
  session_id bigint not null references public.class_sessions (id) on delete cascade,
  student_id bigint not null references public.students (id) on delete cascade,
  seen_at timestamptz not null default timezone('utc', now()),
  primary key (session_id, student_id)
);

alter table public.class_report_seen enable row level security;
revoke all on public.class_report_seen from public, anon, authenticated;
grant all on public.class_report_seen to service_role;

-- ---------------------------------------------------------------------------
-- 3. A note in the bell can point at a lesson

alter table public.staff_notifications
  add column if not exists class_session_id bigint references public.class_sessions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 5a. Who handles a student: their Learning Consultant (students.consultant_id),
-- else the PIC of the lead that became the student (the same order as the
-- Inbox's Handled by).

create or replace function public.student_handled_by(p_student_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select t.id from public.students s join public.teachers t on t.id = s.consultant_id and t.is_active where s.id = p_student_id),
    (select t.id
     from public.leads l
     join public.lead_options o on o.id = l.pic_id and o.kind = 'pic'
     join public.teachers t on t.id = o.teacher_id and t.is_active
     where l.converted_student_id = p_student_id
     order by l.id desc
     limit 1)
  );
$$;

revoke all on function public.student_handled_by(bigint) from public, anon;
grant execute on function public.student_handled_by(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 5b. Each child's record of each lesson.
--
-- Who is in a lesson: the children on its roster that day, and anyone who came
-- into its Zoom, answered, or is on its attendance. The lesson runs from when
-- the teacher started it (else the planned start) to when they ended it (else
-- now while it is live, else the planned end). Time in Zoom counts only inside
-- that window; a dropped connection is counted as the school sets it.
--
-- teacher_id is who taught that day: the day's substitute when there was one,
-- else the lesson's teacher (class_teacher_id).
--
-- The core has no login check: only the database itself (the background
-- checks of the automations) calls it. public.lesson_student_records below is
-- the same rows, filtered to what the signed-in person may see.

create or replace function automation.lesson_student_records_core(
  p_session_id bigint default null,
  p_student_id bigint default null,
  p_from date default null,
  p_to date default null
)
returns table (
  session_id bigint,
  lesson_date date,
  session_status text,
  starts_at timestamptz,
  ends_at timestamptz,
  lesson_from timestamptz,
  lesson_to timestamptz,
  classroom_id bigint,
  classroom_name text,
  subject_id bigint,
  teacher_id bigint,
  class_teacher_id bigint,
  title text,
  student_id bigint,
  student_name text,
  student_code text,
  attendance_status text,
  has_zoom boolean,
  zoom_minutes integer,
  lesson_minutes integer,
  participation_percent integer,
  online_spans jsonb,
  left_periods jsonb,
  late_minutes integer,
  left_early_minutes integer,
  questions_total integer,
  answered integer,
  correct integer,
  wrong integer,
  pending integer,
  points integer,
  picked_count integer,
  is_silent boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with sessions as (
    select cs.*, sc.title as schedule_title, c.name as classroom_name_, c.subject_id as subject_id_,
      coalesce(cs.started_at, cs.starts_at) as w_from,
      coalesce(cs.ended_at, case when cs.status = 'live' then greatest(timezone('utc', now()), coalesce(cs.started_at, cs.starts_at)) else cs.ends_at end) as w_to,
      (select l.id from public.lesson_logs l where l.schedule_id = cs.schedule_id and l.lesson_date = cs.lesson_date
       order by l.revision_number desc limit 1) as log_id,
      exists (select 1 from public.class_session_zoom z where z.session_id = cs.id) as has_zoom_,
      coalesce((select ls.teacher_id from public.lesson_substitutes ls where ls.schedule_id = cs.schedule_id and ls.lesson_date = cs.lesson_date), cs.teacher_id) as taught_by
    from public.class_sessions cs
    join public.schedules sc on sc.id = cs.schedule_id
    left join public.classrooms c on c.id = cs.classroom_id
    where (p_session_id is null or cs.id = p_session_id)
      and (p_from is null or cs.lesson_date >= p_from)
      and (p_to is null or cs.lesson_date <= p_to)
      -- Only lessons that have begun: a class later today is not history yet.
      and coalesce(cs.started_at, cs.starts_at) <= timezone('utc', now())
  ),
  people as (
    select s.id as session_id, x.student_id
    from sessions s
    cross join lateral (
      select p.student_id from public.student_classroom_periods p
      where p.classroom_id = s.classroom_id and public.is_class_session_student(s.id, p.student_id)
      union
      select tb.student_id from public.trial_bookings tb
      where tb.schedule_id = s.schedule_id and tb.booking_date = s.lesson_date and public.is_class_session_student(s.id, tb.student_id)
      union
      select ss.student_id from public.schedule_students ss
      where ss.schedule_id = s.schedule_id and ss.is_active and public.is_class_session_student(s.id, ss.student_id)
      union
      select zp.student_id from public.zoom_participation zp where zp.session_id = s.id and zp.student_id is not null
      union
      select a.student_id from public.live_answers a where a.session_id = s.id
      union
      select ls.student_id from public.lesson_log_students ls where ls.lesson_log_id = s.log_id
    ) x
    where x.student_id is not null and (p_student_id is null or x.student_id = p_student_id)
  ),
  visible as (
    select distinct pe.session_id, pe.student_id from people pe
  ),
  spans as (
    select zp.session_id, zp.student_id,
      greatest(zp.joined_at, s.w_from) as f,
      least(coalesce(public.zoom_counted_left_at(zp.joined_at, zp.left_at, zp.dropped), s.w_to), s.w_to) as t
    from public.zoom_participation zp
    join sessions s on s.id = zp.session_id
    join visible v on v.session_id = zp.session_id and v.student_id = zp.student_id
  ),
  ordered as (
    select sp.*, max(sp.t) over (partition by sp.session_id, sp.student_id order by sp.f, sp.t rows between unbounded preceding and 1 preceding) as prev_max
    from spans sp
    where sp.t > sp.f
  ),
  grouped as (
    select o.*, sum(case when o.prev_max is null or o.f > o.prev_max then 1 else 0 end)
      over (partition by o.session_id, o.student_id order by o.f, o.t rows unbounded preceding) as grp
    from ordered o
  ),
  merged as (
    select g.session_id, g.student_id, min(g.f) as f, max(g.t) as t
    from grouped g
    group by g.session_id, g.student_id, g.grp
  ),
  gaps as (
    select m.session_id, m.student_id, lag(m.t) over (partition by m.session_id, m.student_id order by m.f) as gap_from, m.f as gap_to
    from merged m
  ),
  online as (
    select m.session_id, m.student_id,
      sum(extract(epoch from (m.t - m.f))) as seconds,
      min(m.f) as first_in, max(m.t) as last_out,
      jsonb_agg(jsonb_build_object('from', m.f, 'to', m.t) order by m.f) as spans
    from merged m
    group by m.session_id, m.student_id
  ),
  away as (
    select g.session_id, g.student_id,
      jsonb_agg(jsonb_build_object('kind', 'away', 'from', g.gap_from, 'to', g.gap_to) order by g.gap_from) as periods
    from gaps g
    where g.gap_from is not null and g.gap_to - g.gap_from >= interval '1 minute'
    group by g.session_id, g.student_id
  ),
  answers as (
    select a.session_id, a.student_id, count(*) as answered,
      count(*) filter (where a.result = 'correct') as correct,
      count(*) filter (where a.result = 'wrong') as wrong,
      count(*) filter (where a.result = 'pending') as pending
    from public.live_answers a
    join visible v on v.session_id = a.session_id and v.student_id = a.student_id
    group by a.session_id, a.student_id
  ),
  picks as (
    select e.session_id, e.student_id, count(*) as picked
    from public.class_session_events e
    where e.kind = 'pick'
    group by e.session_id, e.student_id
  )
  select s.id, s.lesson_date, s.status, s.starts_at, s.ends_at, s.w_from, s.w_to,
    s.classroom_id, s.classroom_name_, s.subject_id_, s.taught_by, s.teacher_id, s.schedule_title,
    st.id, st.full_name, st.student_code,
    ls.attendance_status,
    s.has_zoom_,
    case when s.has_zoom_ then round(coalesce(o.seconds, 0) / 60)::integer end,
    greatest(round(extract(epoch from (s.w_to - s.w_from)) / 60), 0)::integer,
    case when s.has_zoom_ and s.w_to > s.w_from
      then least(100, round(100 * coalesce(o.seconds, 0) / extract(epoch from (s.w_to - s.w_from))))::integer end,
    coalesce(o.spans, '[]'::jsonb),
    coalesce((
      select jsonb_agg(p order by p ->> 'from')
      from (
        select jsonb_build_object('kind', 'late', 'from', s.w_from, 'to', o.first_in) as p
        where o.first_in is not null and o.first_in - s.w_from >= interval '1 minute'
        union all
        select jsonb_array_elements(aw.periods)
        union all
        select jsonb_build_object('kind', 'early', 'from', o.last_out, 'to', s.w_to)
        where o.last_out is not null and s.status = 'ended' and s.w_to - o.last_out >= interval '1 minute'
      ) periods
    ), '[]'::jsonb),
    case when o.first_in is not null then greatest(round(extract(epoch from (o.first_in - s.w_from)) / 60), 0)::integer end,
    case when o.last_out is not null and s.status = 'ended' then greatest(round(extract(epoch from (s.w_to - o.last_out)) / 60), 0)::integer end,
    (select count(*) from public.live_questions q where q.session_id = s.id)::integer,
    coalesce(an.answered, 0)::integer,
    coalesce(an.correct, 0)::integer,
    coalesce(an.wrong, 0)::integer,
    coalesce(an.pending, 0)::integer,
    coalesce((
      select sum(sp.points) from public.student_points sp
      where sp.student_id = st.id and sp.schedule_id = s.schedule_id and sp.lesson_date = s.lesson_date
    ), 0)::integer,
    coalesce(pk.picked, 0)::integer,
    coalesce(o.seconds, 0) > 0 and coalesce(an.answered, 0) = 0 and coalesce(pk.picked, 0) = 0
  from visible v
  join sessions s on s.id = v.session_id
  join public.students st on st.id = v.student_id
  left join public.lesson_log_students ls on ls.lesson_log_id = s.log_id and ls.student_id = st.id
  left join online o on o.session_id = s.id and o.student_id = st.id
  left join away aw on aw.session_id = s.id and aw.student_id = st.id
  left join answers an on an.session_id = s.id and an.student_id = st.id
  left join picks pk on pk.session_id = s.id and pk.student_id = st.id
  order by s.lesson_date desc, s.starts_at desc, st.full_name;
$$;

revoke all on function automation.lesson_student_records_core(bigint, bigint, date, date) from public, anon, authenticated;
grant execute on function automation.lesson_student_records_core(bigint, bigint, date, date) to service_role;

-- The same rows for a signed-in person: a lesson's records when they may see
-- the lesson, are the child's Learning Consultant, or may see Students.
create or replace function public.lesson_student_records(
  p_session_id bigint default null,
  p_student_id bigint default null,
  p_from date default null,
  p_to date default null
)
returns table (
  session_id bigint,
  lesson_date date,
  session_status text,
  starts_at timestamptz,
  ends_at timestamptz,
  lesson_from timestamptz,
  lesson_to timestamptz,
  classroom_id bigint,
  classroom_name text,
  subject_id bigint,
  teacher_id bigint,
  class_teacher_id bigint,
  title text,
  student_id bigint,
  student_name text,
  student_code text,
  attendance_status text,
  has_zoom boolean,
  zoom_minutes integer,
  lesson_minutes integer,
  participation_percent integer,
  online_spans jsonb,
  left_periods jsonb,
  late_minutes integer,
  left_early_minutes integer,
  questions_total integer,
  answered integer,
  correct integer,
  wrong integer,
  pending integer,
  points integer,
  picked_count integer,
  is_silent boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.*
  from automation.lesson_student_records_core(p_session_id, p_student_id, p_from, p_to) c
  join public.students st on st.id = c.student_id
  where public.can_see_class_session(c.session_id)
    or (st.consultant_id is not null and st.consultant_id = public.current_teacher_id())
    or public.has_permission('students');
$$;

revoke all on function public.lesson_student_records(bigint, bigint, date, date) from public, anon;
grant execute on function public.lesson_student_records(bigint, bigint, date, date) to authenticated;

-- Every question of the lesson for every child in it (a question a child did
-- not answer is a row with result 'unanswered').
create or replace function public.lesson_student_answers(p_session_id bigint default null, p_student_id bigint default null)
returns table (
  session_id bigint,
  lesson_date date,
  classroom_id bigint,
  subject_id bigint,
  student_id bigint,
  live_question_id bigint,
  question_position integer,
  kind text,
  prompt text,
  options jsonb,
  result text,
  answer_choices integer[],
  answer_text text,
  seconds_taken numeric,
  points integer,
  submitted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.session_id, r.lesson_date, r.classroom_id, r.subject_id, r.student_id,
    q.id, q.position, q.kind, q.prompt, q.options,
    coalesce(a.result, 'unanswered'), a.answer_choices, a.answer_text, a.seconds_taken, coalesce(a.points, 0), a.submitted_at
  from public.lesson_student_records(p_session_id, p_student_id) r
  join public.live_questions q on q.session_id = r.session_id
  left join public.live_answers a on a.live_question_id = q.id and a.student_id = r.student_id
  order by r.lesson_date desc, r.session_id, r.student_id, q.position;
$$;

revoke all on function public.lesson_student_answers(bigint, bigint) from public, anon;
grant execute on function public.lesson_student_answers(bigint, bigint) to authenticated;

-- The two views ② reads (each login sees what the functions above let it see).
create or replace view public.student_lesson_records with (security_invoker = true) as
  select * from public.lesson_student_records();

create or replace view public.student_lesson_answers with (security_invoker = true) as
  select * from public.lesson_student_answers();

revoke all on public.student_lesson_records, public.student_lesson_answers from public, anon;
grant select on public.student_lesson_records, public.student_lesson_answers to authenticated;

-- One child's lessons, newest first (the CRM student page).
create or replace function public.student_lesson_history(p_student_id bigint)
returns setof public.student_lesson_records
language sql
stable
security definer
set search_path = public
as $$
  select * from public.lesson_student_records(null, p_student_id);
$$;

revoke all on function public.student_lesson_history(bigint) from public, anon;
grant execute on function public.student_lesson_history(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 5c. "Needs care" notes from the report to each child's Handled by.
-- p_items: [{"student_id": 1, "note": "Left early twice"}]. Returns
-- {"sent": n, "no_handler": [student ids]}.

create or replace function public.send_lesson_care_notes(p_session_id bigint, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_student bigint;
  v_note text;
  v_handler bigint;
  v_name text;
  v_class text;
  v_date date;
  v_sent integer := 0;
  v_missing bigint[] := '{}';
begin
  if not public.can_see_class_session(p_session_id) then
    raise exception 'Only the class''s teacher can do this.';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Nothing to send.';
  end if;
  select coalesce(c.name, s.title), cs.lesson_date into v_class, v_date
  from public.class_sessions cs
  join public.schedules s on s.id = cs.schedule_id
  left join public.classrooms c on c.id = cs.classroom_id
  where cs.id = p_session_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_student := (v_item ->> 'student_id')::bigint;
    v_note := left(btrim(coalesce(v_item ->> 'note', '')), 1500);
    if v_student is null or not exists (select 1 from public.lesson_student_records(p_session_id, v_student)) then
      continue;
    end if;
    v_handler := public.student_handled_by(v_student);
    if v_handler is null then
      v_missing := v_missing || v_student;
      continue;
    end if;
    select coalesce(nullif(btrim(student_code), '') || ' · ', '') || full_name into v_name from public.students where id = v_student;
    insert into public.staff_notifications (teacher_id, title, body, student_id, class_session_id)
    values (
      v_handler,
      left(format('%s needs care · %s %s', v_name, v_class, to_char(v_date, 'DD Mon')), 200),
      v_note,
      v_student,
      p_session_id
    );
    v_sent := v_sent + 1;
  end loop;

  return jsonb_build_object('sent', v_sent, 'no_handler', to_jsonb(v_missing));
end;
$$;

revoke all on function public.send_lesson_care_notes(bigint, jsonb) from public, anon;
grant execute on function public.send_lesson_care_notes(bigint, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5d. The student app.
--
-- A lesson's report exists only once the teacher has ended the lesson. The
-- child (or their parent) sees their own lines; points and remarks only when
-- the school shows them to that login (Class Settings > Student app).

create or replace function public.portal_lesson_report(p_student_id bigint, p_session_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_session public.class_sessions%rowtype;
  v_title text;
  v_class text;
  v_teacher text;
  v_points boolean;
  v_scores boolean;
  v_log bigint;
  v_from timestamptz;
  v_to timestamptz;
  v_has_zoom boolean;
  v_seconds numeric;
  v_first timestamptz;
  v_total integer;
  v_answered integer;
  v_right integer;
  v_my_points integer;
  v_place integer;
  v_prev_right integer;
  v_words jsonb;
begin
  if not public.portal_may_act_for(p_student_id) then
    raise exception 'Not found.';
  end if;
  select * into v_session from public.class_sessions where id = p_session_id;
  if not found or v_session.status <> 'ended' then
    return null;
  end if;
  if not (public.is_class_session_student(p_session_id, p_student_id)
    or exists (select 1 from public.zoom_participation zp where zp.session_id = p_session_id and zp.student_id = p_student_id)
    or exists (select 1 from public.live_answers a where a.session_id = p_session_id and a.student_id = p_student_id)) then
    return null;
  end if;

  select s.title, c.name, t.full_name into v_title, v_class, v_teacher
  from public.schedules s
  left join public.classrooms c on c.id = v_session.classroom_id
  left join public.teachers t on t.id = v_session.teacher_id
  where s.id = v_session.schedule_id;

  v_points := public.portal_sees(p_student_id, 'points');
  v_scores := public.portal_sees(p_student_id, 'scores');
  v_from := coalesce(v_session.started_at, v_session.starts_at);
  v_to := coalesce(v_session.ended_at, v_session.ends_at);
  v_has_zoom := exists (select 1 from public.class_session_zoom z where z.session_id = p_session_id);

  -- Time in the lesson's Zoom, inside the lesson (overlapping joins counted once).
  with spans as (
    select greatest(zp.joined_at, v_from) as f,
      least(coalesce(public.zoom_counted_left_at(zp.joined_at, zp.left_at, zp.dropped), v_to), v_to) as t
    from public.zoom_participation zp
    where zp.session_id = p_session_id and zp.student_id = p_student_id
  ),
  ordered as (
    select f, t, max(t) over (order by f, t rows between unbounded preceding and 1 preceding) as prev_max from spans where t > f
  ),
  grouped as (
    select f, t, sum(case when prev_max is null or f > prev_max then 1 else 0 end) over (order by f, t rows unbounded preceding) as grp from ordered
  ),
  merged as (select min(f) as f, max(t) as t from grouped group by grp)
  select coalesce(sum(extract(epoch from (t - f))), 0), min(f) into v_seconds, v_first from merged;

  -- Questions whose answer the teacher has shown.
  select count(*) into v_total from public.live_questions q where q.session_id = p_session_id and q.revealed_at is not null;
  select count(*), count(*) filter (where a.result = 'correct') into v_answered, v_right
  from public.live_answers a
  join public.live_questions q on q.id = a.live_question_id
  where q.session_id = p_session_id and q.revealed_at is not null and a.student_id = p_student_id;

  if v_points then
    select coalesce(sum(points), 0) into v_my_points from public.student_points
    where student_id = p_student_id and schedule_id = v_session.schedule_id and lesson_date = v_session.lesson_date;
    -- The place in the class by the lesson's points (the app shows only the top three).
    select 1 + count(*) into v_place
    from (
      select sp.student_id, sum(sp.points) as total
      from public.student_points sp
      where sp.schedule_id = v_session.schedule_id and sp.lesson_date = v_session.lesson_date
      group by sp.student_id
    ) others
    where others.student_id <> p_student_id and others.total > v_my_points;
    if v_my_points <= 0 then
      v_place := null;
    end if;
  end if;

  -- Right answers in the previous lesson of the same class ("1 more than last time").
  select count(*) filter (where a.result = 'correct') into v_prev_right
  from public.live_answers a
  join public.live_questions q on q.id = a.live_question_id
  where a.student_id = p_student_id and q.revealed_at is not null
    and q.session_id = (
      select cs.id from public.class_sessions cs
      where cs.classroom_id = v_session.classroom_id and cs.id <> p_session_id and cs.status = 'ended'
        and cs.starts_at < v_session.starts_at
      order by cs.starts_at desc limit 1
    );

  select l.id into v_log from public.lesson_logs l
  where l.schedule_id = v_session.schedule_id and l.lesson_date = v_session.lesson_date
  order by l.revision_number desc limit 1;

  if v_scores and v_log is not null then
    select coalesce(jsonb_agg(r.remark order by c.sort_order, c.id), '[]'::jsonb) into v_words
    from public.lesson_review_scores r
    join public.review_criteria c on c.id = r.criterion_id
    where r.lesson_log_id = v_log and r.student_id = p_student_id and nullif(btrim(r.remark), '') is not null;
    if v_words = '[]'::jsonb then
      select coalesce(jsonb_build_array(nullif(btrim(lesson_remark), '')), '[]'::jsonb) into v_words from public.lesson_logs where id = v_log;
      v_words := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(v_words) x where x <> 'null'::jsonb);
    end if;
  end if;

  return jsonb_build_object(
    'session_id', p_session_id,
    'date', v_session.lesson_date,
    'start', to_char(timezone('Asia/Kuala_Lumpur', v_session.starts_at), 'HH24:MI'),
    'end', to_char(timezone('Asia/Kuala_Lumpur', v_session.ends_at), 'HH24:MI'),
    'title', v_title,
    'class', v_class,
    'classroom_id', v_session.classroom_id,
    'teacher', v_teacher,
    'has_zoom', v_has_zoom,
    'zoom_minutes', case when v_has_zoom then round(v_seconds / 60)::integer end,
    'lesson_minutes', greatest(round(extract(epoch from (v_to - v_from)) / 60), 0)::integer,
    'late_minutes', case when v_first is not null then greatest(round(extract(epoch from (v_first - v_from)) / 60), 0)::integer end,
    'attended', v_seconds > 0 or exists (
      select 1 from public.lesson_log_students ls where ls.lesson_log_id = v_log and ls.student_id = p_student_id and ls.attendance_status = 'present'
    ),
    'attendance', (select ls.attendance_status from public.lesson_log_students ls where ls.lesson_log_id = v_log and ls.student_id = p_student_id),
    'questions', v_total,
    'answered', v_answered,
    'right', v_right,
    'previous_right', v_prev_right,
    'points', case when v_points then v_my_points end,
    'place', case when v_points then v_place end,
    'point_items', case when v_points then (
      select coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'kind', kind, 'emoji', emoji, 'points', total) order by total desc), '[]'::jsonb)
      from (
        select case when sp.kind = 'question' then 'question' else sp.reason end as reason, sp.kind,
          max(rp.emoji) as emoji, sum(sp.points) as total
        from public.student_points sp
        left join public.reward_presets rp on rp.id = sp.preset_id
        where sp.student_id = p_student_id and sp.schedule_id = v_session.schedule_id and sp.lesson_date = v_session.lesson_date
        group by 1, 2
      ) items
    ) end,
    'teacher_words', case when v_scores then coalesce(v_words, '[]'::jsonb) end,
    -- False until the teacher sends the attendance (the remarks come with it).
    'attendance_sent', v_log is not null
  );
end;
$$;

revoke all on function public.portal_lesson_report(bigint, bigint) from public, anon;
grant execute on function public.portal_lesson_report(bigint, bigint) to authenticated;

-- Ended lessons (last 14 days) whose report this child has not seen, or has
-- not seen since the teacher sent the attendance or remarks. Newest first.
create or replace function public.portal_unseen_lesson_reports(p_student_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.portal_may_act_for(p_student_id) then
    raise exception 'Not found.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('session_id', x.id, 'date', x.lesson_date, 'updated', x.updated) order by x.starts_at desc)
    from (
      select cs.id, cs.lesson_date, cs.starts_at, seen.seen_at is not null as updated
      from public.class_sessions cs
      left join public.class_report_seen seen on seen.session_id = cs.id and seen.student_id = p_student_id
      where cs.status = 'ended'
        and coalesce(cs.ended_at, cs.ends_at) >= timezone('utc', now()) - interval '14 days'
        and (public.is_class_session_student(cs.id, p_student_id)
          or exists (select 1 from public.zoom_participation zp where zp.session_id = cs.id and zp.student_id = p_student_id))
        and (
          seen.seen_at is null
          or exists (
            select 1 from public.lesson_logs l
            where l.schedule_id = cs.schedule_id and l.lesson_date = cs.lesson_date and l.created_at > seen.seen_at
          )
        )
      order by cs.starts_at desc
      limit 5
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.portal_unseen_lesson_reports(bigint) from public, anon;
grant execute on function public.portal_unseen_lesson_reports(bigint) to authenticated;

create or replace function public.portal_mark_report_seen(p_student_id bigint, p_session_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.portal_may_act_for(p_student_id) then
    raise exception 'Not found.';
  end if;
  insert into public.class_report_seen (session_id, student_id, seen_at)
  values (p_session_id, p_student_id, timezone('utc', now()))
  on conflict (session_id, student_id) do update set seen_at = excluded.seen_at;
end;
$$;

revoke all on function public.portal_mark_report_seen(bigint, bigint) from public, anon;
grant execute on function public.portal_mark_report_seen(bigint, bigint) to authenticated;

-- A class's questions, lesson by lesson, with the child's own answers (the
-- Room of a subject in the student app). Only questions whose answer the
-- teacher has shown; the right answer comes with them.
create or replace function public.portal_class_question_history(p_student_id bigint, p_classroom_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.portal_may_act_for(p_student_id) then
    raise exception 'Not found.';
  end if;
  return coalesce((
    select jsonb_agg(lesson order by lesson ->> 'date' desc, lesson ->> 'start' desc)
    from (
      select jsonb_build_object(
        'session_id', cs.id,
        'date', cs.lesson_date,
        'start', to_char(timezone('Asia/Kuala_Lumpur', cs.starts_at), 'HH24:MI'),
        'questions', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'number', q.position,
            'kind', q.kind,
            'prompt', q.prompt,
            'options', q.options,
            'points', q.points,
            'result', coalesce(a.result, 'unanswered'),
            'my_choices', a.answer_choices,
            'my_text', a.answer_text,
            'my_points', coalesce(a.points, 0),
            'correct_options', k.correct_options,
            'accepted_answers', k.accepted_answers,
            'explanation', k.explanation,
            'feedback', a.feedback
          ) order by q.position), '[]'::jsonb)
          from public.live_questions q
          left join public.live_answers a on a.live_question_id = q.id and a.student_id = p_student_id
          left join public.live_question_keys k on k.live_question_id = q.id
          where q.session_id = cs.id and q.revealed_at is not null
        )
      ) as lesson
      from public.class_sessions cs
      where cs.classroom_id = p_classroom_id
        and exists (select 1 from public.live_questions q where q.session_id = cs.id and q.revealed_at is not null)
        and (public.is_class_session_student(cs.id, p_student_id)
          or exists (select 1 from public.live_answers a where a.session_id = cs.id and a.student_id = p_student_id))
      order by cs.starts_at desc
      limit 40
    ) lessons
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.portal_class_question_history(bigint, bigint) from public, anon;
grant execute on function public.portal_class_question_history(bigint, bigint) to authenticated;
