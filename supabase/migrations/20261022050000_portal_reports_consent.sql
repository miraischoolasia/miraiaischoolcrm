-- The student app, part 2: the teacher's report for parents, and parents'
-- consent (PDPA) for AI analysis and class recordings.
--
-- Reports: an AI analysis written for parents shows in the app only after a
-- teacher shares it (student_ai_reports.shared_at), and only to the logins the
-- school lets see it (student_sees / parent_sees 'report'; default: parents).
--
-- Consent: each school writes its own wording (app_settings 'portal_consents')
-- and decides whether it is required. A parent agrees or withdraws in the app;
-- every answer is kept with the wording shown (student_consents). When the
-- school requires it, the AI analysis is refused without a yes (the
-- student-report function checks student_has_consent).

-- ---------------------------------------------------------------------------
-- Sharing a report

alter table public.student_ai_reports
  add column shared_at timestamptz,
  add column shared_by bigint references public.teachers (id) on delete set null;

create index student_ai_reports_shared_idx on public.student_ai_reports (student_id, shared_at desc) where shared_at is not null;

-- Staff who can see the student share or unshare a report written for parents.
grant update (shared_at) on public.student_ai_reports to authenticated;

create policy student_ai_reports_share_staff
  on public.student_ai_reports for update to authenticated
  using (
    audience = 'parent'
    and (select public.current_teacher_id()) is not null
    and student_id in (select s.id from public.students s)
  )
  with check (audience = 'parent');

-- Who shared it is recorded by the database, not taken from the page.
create or replace function public.stamp_ai_report_share()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.shared_at is distinct from old.shared_at then
    new.shared_at := case when new.shared_at is null then null else timezone('utc', now()) end;
    new.shared_by := case when new.shared_at is null then null else public.current_teacher_id() end;
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_ai_report_share() from public, anon, authenticated;

create trigger student_ai_reports_stamp_share
  before update of shared_at on public.student_ai_reports
  for each row execute function public.stamp_ai_report_share();

-- ---------------------------------------------------------------------------
-- What the app may show: 'report' and 'recordings' (class recordings, once
-- Zoom sends them) join schedule / points / scores / package

update public.app_settings
set value = jsonb_set(jsonb_set(jsonb_set(jsonb_set(value,
  '{student_sees,report}', coalesce(value #> '{student_sees,report}', 'false'::jsonb)),
  '{parent_sees,report}', coalesce(value #> '{parent_sees,report}', 'true'::jsonb)),
  '{student_sees,recordings}', coalesce(value #> '{student_sees,recordings}', 'true'::jsonb)),
  '{parent_sees,recordings}', coalesce(value #> '{parent_sees,recordings}', 'true'::jsonb))
where key = 'student_portal';

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
    if jsonb_typeof(p_settings -> v_viewer) is distinct from 'object'
      or exists (
        select 1 from jsonb_each(p_settings -> v_viewer) e
        where e.key not in ('schedule', 'points', 'scores', 'package', 'report', 'recordings') or jsonb_typeof(e.value) <> 'boolean'
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

-- ---------------------------------------------------------------------------
-- Consent

insert into public.app_settings (key, value)
values (
  'portal_consents',
  jsonb_build_object(
    'ai_analysis', jsonb_build_object(
      'title', 'AI progress reports',
      'text', 'I agree that the school may use my child''s class records (attendance, the teacher''s ratings and answers in class) to write progress reports with an AI service. Only my child''s first name and age are sent to it, never the full name or contact details.',
      'required', false),
    'class_recording', jsonb_build_object(
      'title', 'Class recordings',
      'text', 'I agree that my child''s online classes may be recorded, and that the recordings are kept for the class to watch again.',
      'required', false)
  )
)
on conflict (key) do nothing;

create or replace function public.set_portal_consents(p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the consent wording.';
  end if;
  if jsonb_typeof(p_settings) is distinct from 'object'
    or exists (select 1 from jsonb_object_keys(p_settings) k where k not in ('ai_analysis', 'class_recording')) then
    raise exception 'Consent settings are not valid.';
  end if;
  foreach v_kind in array array['ai_analysis', 'class_recording']
  loop
    if jsonb_typeof(p_settings -> v_kind) is distinct from 'object'
      or char_length(btrim(coalesce(p_settings -> v_kind ->> 'title', ''))) not between 1 and 80
      or char_length(btrim(coalesce(p_settings -> v_kind ->> 'text', ''))) not between 1 and 2000
      or jsonb_typeof(p_settings -> v_kind -> 'required') is distinct from 'boolean' then
      raise exception 'Each consent needs a title, its wording and whether it is required.';
    end if;
  end loop;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('portal_consents', p_settings, timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_portal_consents(jsonb) from public, anon;
grant execute on function public.set_portal_consents(jsonb) to authenticated;

create table public.student_consents (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students (id) on delete cascade,
  kind text not null check (kind in ('ai_analysis', 'class_recording')),
  granted boolean not null,
  -- The wording the parent saw, kept with the answer.
  text_shown text not null,
  given_by_person_id bigint references public.people (id) on delete set null,
  given_by_auth_user uuid,
  created_at timestamptz not null default timezone('utc', now())
);

create index student_consents_student_idx on public.student_consents (student_id, kind, id desc);

alter table public.student_consents enable row level security;
revoke all on public.student_consents from public, anon, authenticated;
grant select on public.student_consents to authenticated;
grant all on public.student_consents to service_role;

create policy student_consents_select_staff
  on public.student_consents for select to authenticated
  using (
    (select public.can_view_classes())
    or (select public.has_permission('students'))
    or (
      (select public.current_teacher_id()) is not null
      and student_id in (select s.id from public.students s)
    )
  );

-- Has the parent said yes (their latest answer)?
create or replace function public.student_has_consent(p_student_id bigint, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select sc.granted from public.student_consents sc
    where sc.student_id = p_student_id and sc.kind = p_kind
    order by sc.id desc limit 1
  ), false);
$$;

revoke all on function public.student_has_consent(bigint, text) from public, anon;
grant execute on function public.student_has_consent(bigint, text) to authenticated;

-- A parent's login agrees or withdraws, for one of their children.
create or replace function public.portal_set_consent(p_student_id bigint, p_kind text, p_granted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent bigint := public.current_parent_person_id();
  v_text text;
begin
  if v_parent is null or not public.portal_may_act_for(p_student_id) or public.current_student_id() = p_student_id then
    raise exception 'Only a parent can answer this.';
  end if;
  if p_kind not in ('ai_analysis', 'class_recording') or p_granted is null then
    raise exception 'Unknown consent.';
  end if;
  select value -> p_kind ->> 'text' into v_text from public.app_settings where key = 'portal_consents';
  insert into public.student_consents (student_id, kind, granted, text_shown, given_by_person_id, given_by_auth_user)
  values (p_student_id, p_kind, p_granted, coalesce(v_text, ''), v_parent, auth.uid());
end;
$$;

revoke all on function public.portal_set_consent(bigint, text, boolean) from public, anon;
grant execute on function public.portal_set_consent(bigint, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Everything the app shows for one child, now with the report and consents

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
