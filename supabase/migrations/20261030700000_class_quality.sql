-- Class quality for the management and the Learning Consultants (items 4-9 of the class-report batch).
--
--   4  Teacher scorecard   public.quality_lessons(from, to): one row per lesson with the numbers the page adds up per
--                          teacher and month (attendance, time in class, answers right, started on time, recording on
--                          time, attendance sent on time, comments written).
--   5  Retention           public.quality_periods(from, to): the stays in a counted class (the roster table's rule of
--                          department 3: the ticked class categories, class changes from its "changes_from" day); the
--                          page counts at the start / added / stopped per teacher and month.
--   6  Class alerts        trigger class_alert  -> managers   (answers right low two lessons running, attendance falling,
--                                                              teacher started late)
--   8  Student care        trigger student_care -> the student's Learning Consultant (missed classes in a row, little
--                                                              time in class, leaving early again and again)
--   9  Good news           trigger good_news    -> the Learning Consultant (came first, every answer right, top rating),
--                                                              with a draft message for the parent
--   7  Progress cards      the "Progress card" tab of a student's details: public.progress_card(student, month) and
--                          public.mark_progress_card_sent(student, month).
--
-- Everything is read from the records of department 4 (automation.lesson_student_records_core: one row per child per
-- lesson, the same minutes / % / answers as the class report) and the existing tables; nothing is copied.
-- The alerts are found every 10 minutes by automation.detect_quality_alerts() (one row each in automation.quality_alerts,
-- never twice) and go through Automations like every other event: three flows per school are made here, on, telling
-- staff only. The thresholds are per school (app_settings 'class_quality', the "Teacher quality" page).
-- Who handles a student is now their Learning Consultant first, then the PIC (public.student_handled_by).

-- ---------------------------------------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------------------------------------

create or replace function automation.class_quality_defaults()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'alerts', jsonb_build_object(
      'low_score', true, 'attendance_drop', true, 'late_start', true,
      'absent_streak', true, 'low_participation', true, 'leaves_early', true,
      'first_place', true, 'all_correct', true, 'high_rating', true
    ),
    'low_score_percent', 50, 'low_score_lessons', 2,
    'attendance_drop_lessons', 3,
    'late_start_minutes', 5,
    'absent_lessons', 2,
    'participation_percent', 40,
    'early_minutes', 5, 'early_lessons', 2, 'early_window', 3,
    'all_correct_min', 3,
    'high_rating_percent', 90,
    'feedback_hours', 24,
    'recording_hours', 24,
    'red', jsonb_build_object('attendance', 80, 'participation', 60, 'right', 50, 'on_time', 90, 'recording', 90, 'feedback', 90),
    -- What parents read (the progress card, the good news message): 'zh' Malaysian Chinese, or 'en'. The screens stay
    -- in English either way.
    'parent_language', 'zh',
    'good_news_draft', '{parent}您好！跟您分享一个好消息：{child}{news} 🎉 继续加油哦！',
    'card_text', E'📚 {child}（{classes}）{month}学习报告\n✅ 出席：{attended}/{lessons} 堂课\n📝 Quiz 成绩：答对 {score} 题{right_change}\n⏱️ 上课时间：{time}%\n💬 {teacher}：「{remark}」\n\n谢谢您的支持，我们一起继续加油！— {school}'
  );
$$;

revoke all on function automation.class_quality_defaults() from public, anon, authenticated;

-- Alerts start from the lessons that end after this update (nothing is raised for the days before it).
insert into public.app_settings (key, value)
values ('class_quality', jsonb_build_object('since', timezone('utc', now())))
on conflict (key) do nothing;

-- The school's settings, the defaults filled in.
create or replace function public.class_quality_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select d || s
    || jsonb_build_object('alerts', (d -> 'alerts') || coalesce(s -> 'alerts', '{}'::jsonb))
    || jsonb_build_object('red', (d -> 'red') || coalesce(s -> 'red', '{}'::jsonb))
  from (select automation.class_quality_defaults() as d,
               coalesce((select value from public.app_settings where key = 'class_quality'), '{}'::jsonb) as s) x;
$$;

revoke all on function public.class_quality_settings() from public, anon;
grant execute on function public.class_quality_settings() to authenticated;

-- Changes some settings (only the keys given). Whoever may edit Teacher quality.
create or replace function public.set_class_quality(p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := coalesce((select value from public.app_settings where key = 'class_quality'), '{}'::jsonb);
  v_new jsonb;
  k text;
  lim record;
begin
  if not public.has_permission('quality', 'edit') then
    raise exception 'Only someone who may edit Teacher quality can change this.' using errcode = '42501';
  end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception 'The settings are not valid.';
  end if;
  for k in select jsonb_object_keys(p_value) loop
    if k not in (select jsonb_object_keys(automation.class_quality_defaults())) then
      raise exception 'Unknown setting %.', k;
    end if;
  end loop;

  for lim in
    select * from (values
      ('low_score_percent', 1, 100), ('low_score_lessons', 1, 10), ('attendance_drop_lessons', 2, 10),
      ('late_start_minutes', 1, 120), ('absent_lessons', 1, 20), ('participation_percent', 1, 100),
      ('early_minutes', 1, 120), ('early_lessons', 1, 10), ('early_window', 1, 20), ('all_correct_min', 1, 50),
      ('high_rating_percent', 1, 100), ('feedback_hours', 1, 336), ('recording_hours', 1, 336)
    ) t(key, lo, hi)
  loop
    if p_value ? lim.key and (
      jsonb_typeof(p_value -> lim.key) <> 'number'
      or (p_value ->> lim.key)::numeric <> round((p_value ->> lim.key)::numeric)
      or (p_value ->> lim.key)::integer not between lim.lo and lim.hi
    ) then
      raise exception 'The setting % must be a whole number from % to %.', lim.key, lim.lo, lim.hi;
    end if;
  end loop;
  if p_value ? 'early_lessons' or p_value ? 'early_window' then
    if coalesce((p_value ->> 'early_lessons')::integer, (public.class_quality_settings() ->> 'early_lessons')::integer)
       > coalesce((p_value ->> 'early_window')::integer, (public.class_quality_settings() ->> 'early_window')::integer) then
      raise exception 'Leaving early "times" cannot be more than the lessons looked at.';
    end if;
  end if;
  if p_value ? 'alerts' and (
    jsonb_typeof(p_value -> 'alerts') <> 'object'
    or exists (select 1 from jsonb_each(p_value -> 'alerts') e
               where e.key not in (select jsonb_object_keys(automation.class_quality_defaults() -> 'alerts'))
                  or jsonb_typeof(e.value) <> 'boolean')
  ) then
    raise exception 'The alert switches are not valid.';
  end if;
  if p_value ? 'red' and (
    jsonb_typeof(p_value -> 'red') <> 'object'
    or exists (select 1 from jsonb_each(p_value -> 'red') e
               where e.key not in (select jsonb_object_keys(automation.class_quality_defaults() -> 'red'))
                  or jsonb_typeof(e.value) <> 'number' or (e.value #>> '{}')::numeric not between 0 and 100)
  ) then
    raise exception 'The red lines of the scorecard must be 0 to 100.';
  end if;
  if p_value ? 'parent_language' and coalesce(p_value ->> 'parent_language', '') not in ('zh', 'en') then
    raise exception 'The language for parents must be zh or en.';
  end if;
  if p_value ? 'good_news_draft' and (
    jsonb_typeof(p_value -> 'good_news_draft') <> 'string' or char_length(btrim(p_value ->> 'good_news_draft')) not between 1 and 500
  ) then
    raise exception 'The good news message needs text (up to 500 characters).';
  end if;
  if p_value ? 'card_text' and (
    jsonb_typeof(p_value -> 'card_text') <> 'string' or char_length(btrim(p_value ->> 'card_text')) not between 1 and 1500
  ) then
    raise exception 'The progress card text needs text (up to 1500 characters).';
  end if;

  v_new := v_old || (p_value - 'alerts' - 'red')
    || case when p_value ? 'alerts' then jsonb_build_object('alerts', coalesce(v_old -> 'alerts', '{}'::jsonb) || (p_value -> 'alerts')) else '{}'::jsonb end
    || case when p_value ? 'red' then jsonb_build_object('red', coalesce(v_old -> 'red', '{}'::jsonb) || (p_value -> 'red')) else '{}'::jsonb end;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('class_quality', v_new, timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  return public.class_quality_settings();
end;
$$;

revoke all on function public.set_class_quality(jsonb) from public, anon;
grant execute on function public.set_class_quality(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2. Two new ticks. Same as 20261030300000_fee_calculator.sql (the latest valid_account_permissions) plus
--    'quality' (view / edit) and 'progress_cards' (view / edit; "whose": all or own students).
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.valid_account_permissions(p jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(p) = 'object' and not exists (
    select 1
    from jsonb_each(p) as e(module, value)
    where e.module not in (
        'calendar', 'classrooms', 'students', 'leads', 'forms', 'activity', 'team_replies',
        'inbox', 'automations', 'ai_knowledge', 'videos', 'questions', 'app_logins', 'packages',
        'class_settings', 'staff_hours', 'content_studio', 'content_library', 'student_inbox',
        'fee_calculator', 'quality', 'progress_cards'
      )
      or jsonb_typeof(e.value) <> 'object'
      or coalesce(e.value ->> 'level', '') not in ('view', 'edit')
      or (e.value ? 'delete' and jsonb_typeof(e.value -> 'delete') <> 'boolean')
      or (e.value -> 'delete' = 'true'::jsonb and e.value ->> 'level' <> 'edit')
      -- Seen, never changed (Content Library: seeing it is what lets a person claim a post).
      or (e.module in ('activity', 'team_replies', 'staff_hours', 'content_library')
          and (e.value ->> 'level' <> 'view' or e.value -> 'delete' = 'true'::jsonb))
      -- Whose rows: only where the page has rows that belong to someone.
      or (e.value ? 'scope' and (
        jsonb_typeof(e.value -> 'scope') <> 'string'
        or case
          when e.module in ('leads', 'inbox') then e.value ->> 'scope' not in ('all', 'own_unassigned', 'own')
          when e.module in ('team_replies', 'progress_cards') then e.value ->> 'scope' not in ('all', 'own')
          else e.value ->> 'scope' <> 'all'
        end
      ))
      -- Only these keys.
      or exists (select 1 from jsonb_object_keys(e.value) k where k not in ('level', 'delete', 'scope'))
  );
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Which classes count for retention: the roster table's rule (department 3).
-- ---------------------------------------------------------------------------------------------------------

create or replace function automation.class_counts_for_roster(p_category text, p_category_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when jsonb_array_length(coalesce(s.value -> 'count_categories', '[]'::jsonb)) > 0
      then coalesce(s.value -> 'count_categories', '[]'::jsonb) ? coalesce(p_category_name, '')
    else coalesce(p_category, 'regular') = 'regular'
  end
  from (select (select value from public.app_settings where key = 'student_roster') as value) s;
$$;

revoke all on function automation.class_counts_for_roster(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 4. The scorecard: one row per lesson
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.quality_lessons(p_from date, p_to date)
returns table (
  session_id bigint,
  lesson_date date,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  classroom_id bigint,
  classroom_name text,
  teacher_id bigint,
  substitute boolean,
  has_zoom boolean,
  marked integer,
  attended integer,
  participation_sum integer,
  participation_count integer,
  correct integer,
  wrong integer,
  questions integer,
  teacher_joined_at timestamptz,
  started_on_time boolean,
  recording_at timestamptz,
  recording_on_time boolean,
  attendance_sent_at timestamptz,
  attendance_on_time boolean,
  present_logged integer,
  commented integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg jsonb := public.class_quality_settings();
  v_late integer := (cfg ->> 'late_start_minutes')::integer;
  v_rec_hours integer := (cfg ->> 'recording_hours')::integer;
  v_log_hours integer := (cfg ->> 'feedback_hours')::integer;
begin
  if not public.has_permission('quality') then
    raise exception 'Only someone who may see Teacher quality can read this.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Pick a range of up to 400 days.';
  end if;

  return query
  with recs as (
    select r.*, st.attended as is_attended
    from automation.lesson_student_records_core(null, null, p_from, p_to) r
    left join public.attendance_statuses st on st.key = r.attendance_status
  ),
  per as (
    select r.session_id,
      count(*) filter (where r.attendance_status is not null)::integer as marked,
      count(*) filter (where r.is_attended)::integer as attended,
      coalesce(sum(r.participation_percent) filter (
        where r.has_zoom and r.participation_percent is not null
          and (r.is_attended or (r.attendance_status is null and coalesce(r.zoom_minutes, 0) > 0))
      ), 0)::integer as part_sum,
      count(*) filter (
        where r.has_zoom and r.participation_percent is not null
          and (r.is_attended or (r.attendance_status is null and coalesce(r.zoom_minutes, 0) > 0))
      )::integer as part_n,
      coalesce(sum(r.correct), 0)::integer as correct,
      coalesce(sum(r.wrong), 0)::integer as wrong,
      coalesce(max(r.questions_total), 0)::integer as questions
    from recs r
    group by r.session_id
  ),
  logs as (
    select l.schedule_id, l.lesson_date, min(l.submitted_at) as first_at,
      (array_agg(l.id order by l.revision_number desc))[1] as latest_id
    from public.lesson_logs l
    where l.lesson_date between p_from and p_to
    group by l.schedule_id, l.lesson_date
  )
  select cs.id, cs.lesson_date, cs.status, cs.starts_at, cs.ends_at, cs.classroom_id, c.name,
    coalesce(sub.teacher_id, cs.teacher_id), sub.teacher_id is not null,
    z.session_id is not null,
    coalesce(per.marked, 0), coalesce(per.attended, 0), coalesce(per.part_sum, 0), coalesce(per.part_n, 0),
    coalesce(per.correct, 0), coalesce(per.wrong, 0), coalesce(per.questions, 0),
    host.joined_at,
    case when host.joined_at is null then null else host.joined_at <= cs.starts_at + make_interval(mins => v_late) end,
    rec.at,
    case when z.session_id is null then null
         else rec.at is not null and rec.at <= cs.ends_at + make_interval(hours => v_rec_hours) end,
    lg.first_at,
    case when lg.first_at is null then
           case when timezone('utc', now()) > cs.ends_at + make_interval(hours => v_log_hours) then false end
         else lg.first_at <= cs.ends_at + make_interval(hours => v_log_hours) end,
    coalesce(words.present, 0)::integer,
    coalesce(words.commented, 0)::integer
  from public.class_sessions cs
  left join public.classrooms c on c.id = cs.classroom_id
  left join public.lesson_substitutes sub on sub.schedule_id = cs.schedule_id and sub.lesson_date = cs.lesson_date
  left join lateral (select z1.session_id from public.class_session_zoom z1 where z1.session_id = cs.id limit 1) z on true
  left join per on per.session_id = cs.id
  left join lateral (
    select min(zp.joined_at) as joined_at from public.zoom_participation zp where zp.session_id = cs.id and zp.is_host
  ) host on true
  left join lateral (
    select min(r.created_at) as at from public.class_session_recordings r where r.session_id = cs.id
  ) rec on true
  left join logs lg on lg.schedule_id = cs.schedule_id and lg.lesson_date = cs.lesson_date
  left join lateral (
    select count(*) as present,
      count(*) filter (where exists (
        select 1 from public.lesson_review_scores rs where rs.lesson_log_id = lg.latest_id and rs.student_id = ls.student_id
      )) as commented
    from public.lesson_log_students ls
    join public.attendance_statuses a on a.key = ls.attendance_status and a.attended
    where ls.lesson_log_id = lg.latest_id
  ) words on true
  where cs.lesson_date between p_from and p_to
    and cs.starts_at <= timezone('utc', now())
  order by cs.lesson_date, cs.starts_at;
end;
$$;

revoke all on function public.quality_lessons(date, date) from public, anon;
grant execute on function public.quality_lessons(date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 5. Retention: the stays in a counted class around the range
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.quality_periods(p_from date, p_to date)
returns table (
  period_id bigint,
  student_id bigint,
  student_name text,
  student_code text,
  classroom_id bigint,
  classroom_name text,
  teacher_id bigint,
  start_date date,
  end_date date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('quality') then
    raise exception 'Only someone who may see Teacher quality can read this.' using errcode = '42501';
  end if;
  return query
  select p.id, p.student_id, st.full_name, st.student_code, p.classroom_id, c.name, c.teacher_id, p.start_date, p.end_date
  from public.student_classroom_periods p
  join public.classrooms c on c.id = p.classroom_id
  join public.students st on st.id = p.student_id
  where automation.class_counts_for_roster(c.category, c.category_name)
    and (p.start_date is null or p.start_date <= p_to)
    and (p.end_date is null or p.end_date >= p_from)
  order by c.teacher_id, c.name, st.full_name;
end;
$$;

revoke all on function public.quality_periods(date, date) from public, anon;
grant execute on function public.quality_periods(date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 6. Progress cards
-- ---------------------------------------------------------------------------------------------------------

create table if not exists public.progress_card_sends (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  sent_by bigint references public.teachers (id) on delete set null,
  sent_at timestamptz not null default timezone('utc', now())
);

create index if not exists progress_card_sends_student_idx on public.progress_card_sends (student_id, month);

alter table public.progress_card_sends enable row level security;
revoke all on public.progress_card_sends from public, anon, authenticated;
grant select on public.progress_card_sends to authenticated;
grant all on public.progress_card_sends to service_role;

drop policy if exists progress_card_sends_select on public.progress_card_sends;
create policy progress_card_sends_select on public.progress_card_sends for select to authenticated
  using ((select public.has_permission('progress_cards')));

-- May this person see this student's card? The tick, and (with "only own") being the student's Learning Consultant.
create or replace function automation.may_see_progress_card(p_student bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission('progress_cards')
    and (
      coalesce(public.permission_scope('progress_cards'), 'all') = 'all'
      or exists (select 1 from public.students s where s.id = p_student and s.consultant_id = public.current_teacher_id())
    );
$$;

revoke all on function automation.may_see_progress_card(bigint) from public, anon, authenticated;

-- One student's card: every lesson of the month and of the three months before (the trend), and the teacher's words.
create or replace function public.progress_card(p_student bigint, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from date := date_trunc('month', p_month)::date;
  v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_lessons jsonb;
  v_words jsonb;
  v_student jsonb;
begin
  if not automation.may_see_progress_card(p_student) then
    raise exception 'You cannot see this student''s card.' using errcode = '42501';
  end if;

  -- Who the card goes to: the same contact the automations write to (the parent first).
  select jsonb_build_object('id', s.id, 'name', s.full_name, 'code', s.student_code, 'consultant', t.full_name,
           'sendTo', jsonb_build_object(
             'phone', coalesce(sc.parent_phone, sc.child_phone),
             'name', coalesce(sc.parent_name, sc.child_name, s.full_name),
             'contactId', (select pe.chatwoot_contact_id from public.people pe where pe.id = sc.parent_person_id)))
    into v_student
  from public.students s
  left join public.teachers t on t.id = s.consultant_id
  left join lateral (
    select ct.* from automation.student_contacts ct where ct.student_id = s.id
    order by (ct.parent_phone is null), (ct.child_phone is null), ct.parent_person_id nulls last limit 1
  ) sc on true
  where s.id = p_student;

  -- Lessons run from the class console (time in class, quiz), and lessons that only have attendance (no console).
  select coalesce(jsonb_agg(x.lesson order by x.lesson_date, x.starts_at), '[]'::jsonb)
    into v_lessons
  from (
    select r.lesson_date, r.starts_at, jsonb_build_object(
      'sessionId', r.session_id,
      'date', r.lesson_date,
      'classroom', r.classroom_name,
      'subjectId', r.subject_id,
      'teacher', tt.full_name,
      'status', r.attendance_status,
      'attended', st.attended,
      'hasZoom', r.has_zoom,
      'participation', r.participation_percent,
      'questions', r.questions_total,
      'correct', r.correct,
      'wrong', r.wrong,
      'points', r.points
    ) as lesson
    from automation.lesson_student_records_core(null, p_student, (v_from - interval '3 months')::date, v_to) r
    join public.class_sessions cs on cs.id = r.session_id
    left join public.lesson_substitutes sub on sub.schedule_id = cs.schedule_id and sub.lesson_date = cs.lesson_date
    left join public.teachers tt on tt.id = coalesce(sub.teacher_id, r.teacher_id)
    left join public.attendance_statuses st on st.key = r.attendance_status
    where r.lesson_date <= v_to and r.starts_at <= timezone('utc', now())
    union all
    select lg.lesson_date, (lg.lesson_date + coalesce(sc.start_time, time '00:00')) at time zone 'Asia/Kuala_Lumpur',
      jsonb_build_object(
        'sessionId', null,
        'date', lg.lesson_date,
        'classroom', c.name,
        'subjectId', c.subject_id,
        'teacher', t.full_name,
        'status', ls.attendance_status,
        'attended', a.attended,
        'hasZoom', false,
        'participation', null,
        'questions', 0,
        'correct', 0,
        'wrong', 0,
        'points', coalesce((
          select sum(sp.points) from public.student_points sp
          where sp.student_id = p_student and sp.schedule_id = lg.schedule_id and sp.lesson_date = lg.lesson_date
        ), 0)
      )
    from (
      select distinct on (l.schedule_id, l.lesson_date) l.*
      from public.lesson_logs l
      where l.lesson_date between (v_from - interval '3 months')::date and v_to
      order by l.schedule_id, l.lesson_date, l.revision_number desc
    ) lg
    join public.lesson_log_students ls on ls.lesson_log_id = lg.id and ls.student_id = p_student
    join public.schedules sc on sc.id = lg.schedule_id
    left join public.classrooms c on c.id = sc.classroom_id
    left join public.lesson_substitutes sub on sub.schedule_id = lg.schedule_id and sub.lesson_date = lg.lesson_date
    left join public.teachers t on t.id = coalesce(sub.teacher_id, lg.teacher_id)
    left join public.attendance_statuses a on a.key = ls.attendance_status
    where not exists (
      select 1 from public.class_sessions cs where cs.schedule_id = lg.schedule_id and cs.lesson_date = lg.lesson_date
    )
  ) x;

  -- The teacher's words of each lesson of the month (the child's own remarks, else the remark for the class),
  -- newest first; the same reading as the class report.
  select coalesce(jsonb_agg(w order by (w ->> 'date') desc), '[]'::jsonb)
    into v_words
  from (
    select jsonb_build_object(
      'date', lg.lesson_date,
      'teacher', t.full_name,
      'text', coalesce(
        (select string_agg(btrim(rs.remark), ' ' order by c.sort_order, c.id)
         from public.lesson_review_scores rs join public.review_criteria c on c.id = rs.criterion_id
         where rs.lesson_log_id = lg.id and rs.student_id = p_student and nullif(btrim(rs.remark), '') is not null),
        nullif(btrim(lg.lesson_remark), '')
      )
    ) as w
    from (
      select distinct on (l.schedule_id, l.lesson_date) l.*
      from public.lesson_logs l
      join public.lesson_log_students ls on ls.lesson_log_id = l.id and ls.student_id = p_student
      where l.lesson_date between v_from and v_to
      order by l.schedule_id, l.lesson_date, l.revision_number desc
    ) lg
    left join public.lesson_substitutes sub on sub.schedule_id = lg.schedule_id and sub.lesson_date = lg.lesson_date
    left join public.teachers t on t.id = coalesce(sub.teacher_id, lg.teacher_id)
  ) x
  where nullif(x.w ->> 'text', '') is not null;

  return jsonb_build_object('student', v_student, 'month', v_from, 'lessons', v_lessons, 'words', v_words,
    'sentAt', (select max(ps.sent_at) from public.progress_card_sends ps where ps.student_id = p_student and ps.month = v_from));
end;
$$;

revoke all on function public.progress_card(bigint, date) from public, anon;
grant execute on function public.progress_card(bigint, date) to authenticated;

-- "Sent": the person pressed Send to parent (the text went into the chat for them to send).
create or replace function public.mark_progress_card_sent(p_student bigint, p_month date)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz;
begin
  if not automation.may_see_progress_card(p_student) then
    raise exception 'You cannot send this student''s card.' using errcode = '42501';
  end if;
  insert into public.progress_card_sends (student_id, month, sent_by)
  values (p_student, date_trunc('month', p_month)::date, public.current_teacher_id())
  returning sent_at into v_at;
  return v_at;
end;
$$;

revoke all on function public.mark_progress_card_sent(bigint, date) from public, anon;
grant execute on function public.mark_progress_card_sent(bigint, date) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 7. Alerts: found every 10 minutes, one row each
-- ---------------------------------------------------------------------------------------------------------

create table if not exists automation.quality_alerts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in (
    'low_score', 'attendance_drop', 'late_start',
    'absent_streak', 'low_participation', 'leaves_early',
    'first_place', 'all_correct', 'high_rating'
  )),
  trigger_type text not null check (trigger_type in ('class_alert', 'student_care', 'good_news')),
  dedupe_key text not null unique,
  session_id bigint references public.class_sessions (id) on delete cascade,
  classroom_id bigint references public.classrooms (id) on delete set null,
  student_id bigint references public.students (id) on delete cascade,
  teacher_id bigint references public.teachers (id) on delete set null,
  lesson_date date,
  -- A sentence for staff, and (good news) what happened, to finish "{child} {news}".
  reason text not null check (char_length(reason) <= 500),
  news text check (news is null or char_length(news) <= 300),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists quality_alerts_time_idx on automation.quality_alerts (created_at desc);

-- Which lessons were looked at: once after the lesson, once more when the attendance came in.
create table if not exists automation.quality_checked (
  session_id bigint primary key references public.class_sessions (id) on delete cascade,
  after_end boolean not null default false,
  with_roll_call boolean not null default false,
  checked_at timestamptz not null default timezone('utc', now())
);

revoke all on automation.quality_alerts, automation.quality_checked from public, anon, authenticated;

create or replace function automation.add_quality_alert(
  p_kind text, p_key text, p_session bigint, p_classroom bigint, p_student bigint, p_teacher bigint,
  p_date date, p_reason text, p_news text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into automation.quality_alerts (kind, trigger_type, dedupe_key, session_id, classroom_id, student_id, teacher_id, lesson_date, reason, news)
  values (
    p_kind,
    case when p_kind in ('low_score', 'attendance_drop', 'late_start') then 'class_alert'
         when p_kind in ('absent_streak', 'low_participation', 'leaves_early') then 'student_care'
         else 'good_news' end,
    p_kind || ':' || p_key, p_session, p_classroom, p_student, p_teacher, p_date, left(p_reason, 500), left(p_news, 300)
  )
  on conflict (dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function automation.add_quality_alert(text, text, bigint, bigint, bigint, bigint, date, text, text) from public, anon, authenticated;

create or replace function automation.detect_quality_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg jsonb := public.class_quality_settings();
  on_ jsonb := cfg -> 'alerts';
  v_since timestamptz := coalesce((cfg ->> 'since')::timestamptz, timezone('utc', now()));
  v_today date := (timezone('utc', now()) at time zone 'Asia/Kuala_Lumpur')::date;
  s record;
  r record;
  v_made integer := 0;
  v_host timestamptz;
  v_pcts integer[];
  v_n integer;
  v_x integer;
  v_day text;
  v_count integer;
  v_top integer;
  v_zh boolean := coalesce(cfg ->> 'parent_language', 'zh') = 'zh';
  v_day_zh text;
begin
  for s in
    select cs.id, cs.schedule_id, cs.lesson_date, cs.starts_at, cs.ends_at, cs.classroom_id,
      coalesce(c.name, 'the class') as class_name,
      coalesce(sub.teacher_id, cs.teacher_id) as teacher_id,
      coalesce(t.full_name, 'The teacher') as teacher_name,
      coalesce(qc.after_end, false) as done_end,
      coalesce(qc.with_roll_call, false) as done_roll,
      (select l.id from public.lesson_logs l where l.schedule_id = cs.schedule_id and l.lesson_date = cs.lesson_date
       order by l.revision_number desc limit 1) as log_id
    from public.class_sessions cs
    left join public.classrooms c on c.id = cs.classroom_id
    left join public.lesson_substitutes sub on sub.schedule_id = cs.schedule_id and sub.lesson_date = cs.lesson_date
    left join public.teachers t on t.id = coalesce(sub.teacher_id, cs.teacher_id)
    left join automation.quality_checked qc on qc.session_id = cs.id
    where cs.lesson_date >= v_today - 3
      and coalesce(cs.ended_at, cs.ends_at) > v_since
      and (cs.status = 'ended' or cs.ends_at < timezone('utc', now()) - interval '10 minutes')
      and not (coalesce(qc.after_end, false) and coalesce(qc.with_roll_call, false))
    order by cs.starts_at
  loop
    v_day := to_char(s.lesson_date, 'FMDD Mon');
    v_day_zh := to_char(s.lesson_date, 'FMMM"月"FMDD"日"');

    -- After the lesson: the teacher's start, the class's answers, each child's time and answers.
    if not s.done_end then
      if (on_ ->> 'late_start')::boolean and exists (select 1 from public.class_session_zoom z where z.session_id = s.id) then
        select min(zp.joined_at) into v_host from public.zoom_participation zp where zp.session_id = s.id and zp.is_host;
        v_x := (cfg ->> 'late_start_minutes')::integer;
        if v_host is not null and v_host > s.starts_at + make_interval(mins => v_x) then
          v_made := v_made + automation.add_quality_alert('late_start', s.id::text, s.id, s.classroom_id, null, s.teacher_id, s.lesson_date,
            format('%s started the %s class %s minutes late (%s, %s).', s.teacher_name, s.class_name,
              floor(extract(epoch from (v_host - s.starts_at)) / 60)::integer, v_day,
              to_char(s.starts_at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI am')));
        end if;
      end if;

      if (on_ ->> 'low_score')::boolean and s.classroom_id is not null then
        v_n := (cfg ->> 'low_score_lessons')::integer;
        v_x := (cfg ->> 'low_score_percent')::integer;
        -- The answers right of this lesson and the lessons before it (only lessons with marked answers).
        select array_agg(q.pct order by q.starts_at desc) into v_pcts
        from (
          select x.id, x.starts_at,
            round(100.0 * count(*) filter (where a.result = 'correct') / count(*))::integer as pct
          from public.class_sessions x
          join public.live_answers a on a.session_id = x.id and a.result in ('correct', 'wrong')
          where x.classroom_id = s.classroom_id and x.starts_at <= s.starts_at
          group by x.id, x.starts_at
          order by x.starts_at desc
          limit v_n + 1
        ) q;
        if coalesce(array_length(v_pcts, 1), 0) >= v_n
           and exists (select 1 from public.live_answers a where a.session_id = s.id and a.result in ('correct', 'wrong'))
           and (select bool_and(p < v_x) from unnest(v_pcts[1:v_n]) p)
           and (coalesce(array_length(v_pcts, 1), 0) = v_n or v_pcts[v_n + 1] >= v_x) then
          v_made := v_made + automation.add_quality_alert('low_score', s.id::text, s.id, s.classroom_id, null, s.teacher_id, s.lesson_date,
            format('Answers right were below %s%% in the last %s lessons of %s (%s), the last on %s.', v_x, v_n, s.class_name,
              (select string_agg(p::text || '%', ', ') from unnest(v_pcts[1:v_n]) p), v_day));
        end if;
      end if;

      for r in
        select rc.*, st.full_name as student_name, ast.attended as is_attended
        from automation.lesson_student_records_core(s.id, null, null, null) rc
        join public.students st on st.id = rc.student_id
        left join public.attendance_statuses ast on ast.key = rc.attendance_status
      loop
        -- Little time in class (only children who came into the Zoom).
        if (on_ ->> 'low_participation')::boolean and r.has_zoom and coalesce(r.zoom_minutes, 0) > 0
           and r.participation_percent is not null and r.participation_percent < (cfg ->> 'participation_percent')::integer then
          v_made := v_made + automation.add_quality_alert('low_participation', s.id || ':' || r.student_id, s.id, s.classroom_id,
            r.student_id, s.teacher_id, s.lesson_date,
            format('%s was in the %s class only %s%% of the time (%s).', r.student_name, s.class_name, r.participation_percent, v_day));
        end if;

        -- Left early again: this lesson, and as many times as set in the last lessons (alerted when it reaches that).
        if (on_ ->> 'leaves_early')::boolean and coalesce(r.left_early_minutes, 0) >= (cfg ->> 'early_minutes')::integer then
          select count(*) filter (where coalesce(h.left_early_minutes, 0) >= (cfg ->> 'early_minutes')::integer)
            into v_count
          from (
            select h0.left_early_minutes
            from automation.lesson_student_records_core(null, r.student_id, s.lesson_date - 120, s.lesson_date) h0
            where h0.starts_at <= s.starts_at and h0.has_zoom and coalesce(h0.zoom_minutes, 0) > 0
            order by h0.starts_at desc
            limit (cfg ->> 'early_window')::integer
          ) h;
          if v_count = (cfg ->> 'early_lessons')::integer then
            v_made := v_made + automation.add_quality_alert('leaves_early', s.id || ':' || r.student_id, s.id, s.classroom_id,
              r.student_id, s.teacher_id, s.lesson_date,
              format('%s left early in %s of the last %s classes (%s, last on %s).', r.student_name, v_count,
                (cfg ->> 'early_window')::integer, s.class_name, v_day));
          end if;
        end if;

        -- Every answer right.
        if (on_ ->> 'all_correct')::boolean and r.questions_total >= (cfg ->> 'all_correct_min')::integer
           and r.correct = r.questions_total and r.pending = 0 then
          v_made := v_made + automation.add_quality_alert('all_correct', s.id || ':' || r.student_id, s.id, s.classroom_id,
            r.student_id, s.teacher_id, s.lesson_date,
            format('%s got every answer right (%s of %s) in the %s class on %s.', r.student_name, r.correct, r.questions_total, s.class_name, v_day),
            case when v_zh then format('在 %s（%s）的 quiz 全部答对（%s/%s）', s.class_name, v_day_zh, r.correct, r.questions_total)
                 else format('got every answer right (%s of %s) in the %s class on %s', r.correct, r.questions_total, s.class_name, v_day) end);
        end if;
      end loop;

      -- First place: the most answer points of the lesson (a tie is first for everyone in it).
      if (on_ ->> 'first_place')::boolean then
        select max(x.pts) into v_top
        from (select sum(a.points) as pts from public.live_answers a where a.session_id = s.id group by a.student_id) x;
        if coalesce(v_top, 0) > 0 then
          for r in
            select a.student_id, st.full_name as student_name
            from public.live_answers a join public.students st on st.id = a.student_id
            where a.session_id = s.id
            group by a.student_id, st.full_name
            having sum(a.points) = v_top
          loop
            v_made := v_made + automation.add_quality_alert('first_place', s.id || ':' || r.student_id, s.id, s.classroom_id,
              r.student_id, s.teacher_id, s.lesson_date,
              format('%s came first in the %s class on %s.', r.student_name, s.class_name, v_day),
              case when v_zh then format('在 %s（%s）拿到第一名', s.class_name, v_day_zh)
                   else format('came first in the %s class on %s', s.class_name, v_day) end);
          end loop;
        end if;
      end if;
    end if;

    -- When the attendance is in: the class's attendance trend, absences, the teacher's ratings.
    if s.log_id is not null and not s.done_roll then
      if (on_ ->> 'attendance_drop')::boolean and s.classroom_id is not null then
        v_n := (cfg ->> 'attendance_drop_lessons')::integer;
        select array_agg(q.pct order by q.lesson_date desc) into v_pcts
        from (
          select lg.lesson_date,
            round(100.0 * count(*) filter (where a.attended) / nullif(count(*), 0))::integer as pct
          from (
            select distinct on (l.schedule_id, l.lesson_date) l.id, l.lesson_date
            from public.lesson_logs l
            join public.schedules sc on sc.id = l.schedule_id and sc.classroom_id = s.classroom_id
            where l.lesson_date <= s.lesson_date
            order by l.schedule_id, l.lesson_date, l.revision_number desc
          ) lg
          join public.lesson_log_students ls on ls.lesson_log_id = lg.id
          join public.attendance_statuses a on a.key = ls.attendance_status
          group by lg.lesson_date
          order by lg.lesson_date desc
          limit v_n + 1
        ) q;
        -- Each of the last v_n lessons lower than the one before it, and this is the lesson that makes it v_n.
        if coalesce(array_length(v_pcts, 1), 0) >= v_n
           and (select bool_and(v_pcts[i] < v_pcts[i + 1]) from generate_series(1, v_n - 1) i)
           and (coalesce(array_length(v_pcts, 1), 0) = v_n or not (v_pcts[v_n] < v_pcts[v_n + 1])) then
          v_made := v_made + automation.add_quality_alert('attendance_drop', s.id::text, s.id, s.classroom_id, null, s.teacher_id, s.lesson_date,
            format('Attendance of %s fell %s lessons in a row (%s), the last on %s.', s.class_name, v_n,
              (select string_agg(v_pcts[i]::text || '%', ' → ' order by i desc) from generate_series(1, v_n) i), v_day));
        end if;
      end if;

      for r in
        select ls.student_id, st.full_name as student_name, coalesce(a.attended, true) as is_attended
        from public.lesson_log_students ls
        join public.students st on st.id = ls.student_id
        left join public.attendance_statuses a on a.key = ls.attendance_status
        where ls.lesson_log_id = s.log_id
      loop
        if (on_ ->> 'absent_streak')::boolean and not r.is_attended then
          v_count := automation.absent_streak(r.student_id, s.lesson_date);
          if v_count = (cfg ->> 'absent_lessons')::integer then
            v_made := v_made + automation.add_quality_alert('absent_streak', s.id || ':' || r.student_id, s.id, s.classroom_id,
              r.student_id, s.teacher_id, s.lesson_date,
              format('%s missed %s classes in a row (%s, last on %s).', r.student_name, v_count, s.class_name, v_day));
          end if;
        end if;

        if (on_ ->> 'high_rating')::boolean and r.is_attended then
          select round(100.0 * avg(rs.score::numeric / c.max_score))::integer into v_x
          from public.lesson_review_scores rs
          join public.review_criteria c on c.id = rs.criterion_id
          where rs.lesson_log_id = s.log_id and rs.student_id = r.student_id;
          if v_x is not null and v_x >= (cfg ->> 'high_rating_percent')::integer then
            v_made := v_made + automation.add_quality_alert('high_rating', s.id || ':' || r.student_id, s.id, s.classroom_id,
              r.student_id, s.teacher_id, s.lesson_date,
              format('%s got a top rating from %s in the %s class on %s (%s%%).', r.student_name, s.teacher_name, s.class_name, v_day, v_x),
              case when v_zh then format('在 %s（%s）得到老师很高的评价', s.class_name, v_day_zh)
                   else format('got a top rating from the teacher in the %s class on %s', s.class_name, v_day) end);
          end if;
        end if;
      end loop;
    end if;

    insert into automation.quality_checked (session_id, after_end, with_roll_call, checked_at)
    values (s.id, true, s.log_id is not null, timezone('utc', now()))
    on conflict (session_id) do update
      set after_end = true,
          with_roll_call = automation.quality_checked.with_roll_call or excluded.with_roll_call,
          checked_at = excluded.checked_at;
  end loop;
  return v_made;
end;
$$;

revoke all on function automation.detect_quality_alerts() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'class-quality-alerts') then
    perform cron.unschedule('class-quality-alerts');
  end if;
  perform cron.schedule('class-quality-alerts', '*/10 * * * *', 'select automation.detect_quality_alerts()');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 8. The three triggers
-- ---------------------------------------------------------------------------------------------------------

alter table public.automation_flows drop constraint if exists automation_flows_trigger_type_check;
alter table public.automation_flows
  add constraint automation_flows_trigger_type_check
  check (trigger_type in (
    'class_start', 'replacement_start', 'trial_start', 'zoom_start',
    'lesson_expiry', 'account_fee_expiry', 'club_fee_expiry', 'lead_created', 'form_submitted',
    'parent_no_reply', 'parent_waiting',
    'trial_booked', 'package_start', 'lead_idle', 'task_due',
    'message_keyword',
    'trial_attended', 'trial_absent',
    'class_absent', 'lessons_left', 'birthday', 'student_created', 'app_account', 'lead_stage', 'lead_tag',
    'first_message_keyword',
    'class_alert', 'student_care', 'good_news'
  ));

create or replace view automation.quality_events as
select
  qa.trigger_type,
  'qa:' || qa.id as event_key,
  coalesce(sc.child_phone, sc.parent_phone) as phone,
  sc.parent_name,
  coalesce(sc.child_name, st.full_name) as child_name,
  qa.student_id,
  case when qa.student_id is not null then automation.student_lead(qa.student_id) end as lead_id,
  qa.created_at as starts_at,
  to_char(qa.created_at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI am') as start_label,
  qa.lesson_date as class_date,
  c.name as class_label,
  qa.classroom_id,
  st.age,
  st.remaining_hours::numeric as hours_left,
  (select l.status from public.leads l where l.id = automation.student_lead(qa.student_id)) as lead_status,
  'qa:' || qa.id as group_key
from automation.quality_alerts qa
left join public.students st on st.id = qa.student_id
left join public.classrooms c on c.id = qa.classroom_id
left join lateral (
  select ct.* from automation.student_contacts ct where ct.student_id = qa.student_id
  order by (ct.parent_phone is null), (ct.child_phone is null), ct.parent_person_id nulls last limit 1
) sc on true
where qa.created_at > timezone('utc', now()) - interval '62 days';

revoke all on automation.quality_events from public, anon, authenticated;

create or replace view automation.rule_events as
select
  b.trigger_type,
  b.event_key,
  b.phone,
  b.parent_name,
  b.child_name,
  b.student_id,
  b.lead_id,
  b.starts_at,
  b.start_label,
  b.class_date,
  b.class_label,
  b.classroom_id,
  b.age,
  b.hours_left,
  b.lead_status,
  b.group_key,
  x.source_id,
  x.pic_id,
  x.tag_ids,
  x.form_ids,
  x.keyword_id
from (
  select * from automation.rule_events_base
  union all
  select * from automation.trial_result_events
  union all
  select * from automation.phase1_events
  union all
  select * from automation.quality_events
) b
left join lateral (
  select
    l.source_id,
    l.pic_id,
    l.source_rule_id as keyword_id,
    coalesce(l.tag_ids, '{}')::bigint[] as tag_ids,
    coalesce(
      (
        select array_agg(distinct fs.form_id::text)
        from public.form_submissions fs
        where fs.lead_id = l.id and fs.status = 'completed'
      ),
      '{}'::text[]
    ) as form_ids
  from public.leads l
  where l.id = coalesce(
    b.lead_id,
    (
      select par.lead_id
      from public.people ch
      join public.people par on par.id = ch.parent_id
      where ch.student_id = b.student_id and par.lead_id is not null
      limit 1
    )
  )
) x on true;

revoke all on automation.rule_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 9. Who a team step tells: the student's Learning Consultant first, then the PIC; and the managers
-- ---------------------------------------------------------------------------------------------------------

create or replace function automation.flow_staff_targets(
  p_to text,
  p_lead bigint,
  p_student bigint,
  p_event_key text
)
returns bigint[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids bigint[];
  v_classroom bigint;
begin
  if p_to = 'pic' then
    -- A student is handled by their Learning Consultant, else the PIC of their lead; a lead by its PIC.
    select array_remove(array[coalesce(
      case when p_student is not null then public.student_handled_by(p_student) end,
      (select o.teacher_id from public.leads l join public.lead_options o on o.id = l.pic_id where l.id = p_lead),
      (select s.consultant_id from public.students s where s.id = p_student)
    )], null) into v_ids;
  elsif p_to = 'managers' then
    select coalesce(array_agg(t.id), '{}') into v_ids
    from public.teachers t
    where t.is_active and (t.role = 'admin' or t.effective_permissions -> 'quality' ->> 'level' in ('view', 'edit'));
  elsif p_to = 'teachers' then
    if p_event_key ~ '^absent:[0-9]+:' then
      select sch.classroom_id into v_classroom from public.schedules sch where sch.id = split_part(p_event_key, ':', 2)::bigint;
    elsif p_event_key ~ '^qa:[0-9]+$' then
      select qa.classroom_id into v_classroom from automation.quality_alerts qa where qa.id = split_part(p_event_key, ':', 2)::bigint;
    end if;
    select coalesce(array_agg(distinct ct.teacher_id), '{}') into v_ids
    from public.classroom_teachers ct
    where ct.classroom_id = v_classroom
       or (v_classroom is null and ct.classroom_id in (
         select p.classroom_id from public.student_classroom_periods p
         where p.student_id = p_student
           and (p.start_date is null or p.start_date <= (now() at time zone 'Asia/Kuala_Lumpur')::date)
           and (p.end_date is null or p.end_date > (now() at time zone 'Asia/Kuala_Lumpur')::date)
       ));
  elsif p_to ~ '^[0-9]{1,12}$' then
    v_ids := array[p_to::bigint];
  else
    v_ids := '{}';
  end if;
  return array(select t.id from public.teachers t where t.id = any (v_ids) and t.is_active);
end;
$$;

revoke all on function automation.flow_staff_targets(text, bigint, bigint, text) from public, anon, authenticated;

-- A team step's text: {child} {parent}, and for a quality alert {class} {reason} {news} {draft}.
create or replace function automation.fill_alert_text(p_text text, p_event_key text, p_parent text, p_child text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  qa record;
  v_text text := automation.fill_staff_text(p_text, p_parent, p_child);
  v_draft text;
  v_zh boolean;
begin
  if p_event_key !~ '^qa:[0-9]+$' then
    return v_text;
  end if;
  select a.*, c.name as class_name into qa
  from automation.quality_alerts a left join public.classrooms c on c.id = a.classroom_id
  where a.id = split_part(p_event_key, ':', 2)::bigint;
  if not found then
    return v_text;
  end if;
  v_zh := coalesce(public.class_quality_settings() ->> 'parent_language', 'zh') = 'zh';
  v_draft := replace(replace(replace(public.class_quality_settings() ->> 'good_news_draft',
    '{news}', coalesce(qa.news, '')),
    '{parent}', coalesce(nullif(btrim(p_parent), ''), case when v_zh then '家长' else 'the parent' end)),
    '{child}', coalesce(nullif(btrim(p_child), ''), case when v_zh then '孩子' else 'your child' end));
  return replace(replace(replace(replace(v_text,
    '{class}', coalesce(qa.class_name, 'the class')),
    '{reason}', qa.reason),
    '{news}', coalesce(qa.news, '')),
    '{draft}', v_draft);
end;
$$;

revoke all on function automation.fill_alert_text(text, text, text, text) from public, anon, authenticated;

create or replace function automation.do_staff_step(
  p_flow bigint,
  p_action text,
  p_value text,
  p_lead bigint,
  p_student bigint,
  p_event_key text,
  p_parent text,
  p_child text,
  out kind text,
  out detail text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
  v_to bigint[];
  v_text text;
  v_title text;
  v_days integer;
  v_flow_name text;
  v_session bigint;
begin
  begin
    v := p_value::jsonb;
  exception when others then
    kind := 'action_skipped';
    detail := 'This step is not set up properly.';
    return;
  end;
  v_to := automation.flow_staff_targets(v ->> 'to', p_lead, p_student, p_event_key);
  if cardinality(v_to) = 0 then
    kind := 'action_skipped';
    detail := case v ->> 'to'
      when 'pic' then 'Nobody is in charge of this family yet (no Learning Consultant or PIC), so nobody was told.'
      when 'teachers' then 'No class teacher was found for this child, so nobody was told.'
      when 'managers' then 'Nobody has the Teacher quality tick, so nobody was told.'
      else 'That person is no longer active, so nobody was told.'
    end;
    return;
  end if;
  select f.name into v_flow_name from public.automation_flows f where f.id = p_flow;
  if p_event_key ~ '^qa:[0-9]+$' then
    select qa.session_id into v_session from automation.quality_alerts qa where qa.id = split_part(p_event_key, ':', 2)::bigint;
  end if;

  if p_action = 'notify_staff' then
    v_text := left(automation.fill_alert_text(v ->> 'text', p_event_key, p_parent, p_child), 2000);
    insert into public.staff_notifications (teacher_id, title, body, lead_id, student_id, flow_id, class_session_id)
    select t, left(coalesce(nullif(btrim(split_part(v_text, chr(10), 1)), ''), coalesce(v_flow_name, 'Automation')), 200),
      v_text, p_lead, p_student, p_flow, v_session
    from unnest(v_to) t;
    kind := 'action_done';
    detail := format('Told %s staff member(s) in the CRM.', cardinality(v_to));
  else
    v_title := left(coalesce(nullif(btrim(automation.fill_alert_text(v ->> 'title', p_event_key, p_parent, p_child)), ''), 'Follow up'), 160);
    v_days := least(greatest(coalesce((v ->> 'days')::integer, 1), 0), 60);
    insert into public.calendar_items (kind, title, notes, item_date, assignee_id, lead_id)
    select 'task', v_title, left(coalesce('From the automation "' || v_flow_name || '"', ''), 2000),
      (now() at time zone 'Asia/Kuala_Lumpur')::date + v_days, t, p_lead
    from unnest(v_to) t;
    kind := 'action_done';
    detail := format('Made the task "%s" for %s staff member(s), due in %s day(s).', v_title, cardinality(v_to), v_days);
  end if;
exception when others then
  kind := 'action_skipped';
  detail := left('Could not do this step: ' || sqlerrm, 480);
end;
$$;

revoke all on function automation.do_staff_step(bigint, text, text, bigint, bigint, text, text, text) from public, anon, authenticated;

-- The flow check accepts "managers" as who a team step is for.
do $$
declare
  v_def text := replace(pg_get_functiondef('public.automation_flows_validate()'::regprocedure), chr(13), '');
  v_from text := $x$coalesce(sv ->> 'to', '') !~ '^(pic|teachers|[0-9]{1,12})$'$x$;
begin
  if position('(pic|teachers|managers|' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from) <> 1 then
    raise exception 'automation_flows_validate: the team step check was not found once.';
  end if;
  execute replace(v_def, v_from, $x$coalesce(sv ->> 'to', '') !~ '^(pic|teachers|managers|[0-9]{1,12})$'$x$);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 10. Three flows per school, on, telling staff only (anyone may change, add a message for the parent, or turn off)
-- ---------------------------------------------------------------------------------------------------------

do $$
declare
  f record;
begin
  for f in
    select * from (values
      ('Class alerts → managers', 'class_alert',
       jsonb_build_object('to', 'managers', 'text', E'Class needs attention: {class}\n{reason}')),
      ('Student care → Learning Consultant', 'student_care',
       jsonb_build_object('to', 'pic', 'text', E'Please check on {child}\n{reason}')),
      ('Good news → Learning Consultant', 'good_news',
       jsonb_build_object('to', 'pic', 'text', E'Good news: {child} {news}\nSuggested message to the parent:\n{draft}'))
    ) t(name, trigger_type, step)
  loop
    if not exists (select 1 from public.automation_flows a where a.trigger_type = f.trigger_type) then
      insert into public.automation_flows (name, trigger_type, enabled, graph)
      values (f.name, f.trigger_type, true, jsonb_build_object(
        'trigger', jsonb_build_object('x', 24, 'y', 140),
        'nodes', jsonb_build_array(jsonb_build_object(
          'id', 'a1', 'type', 'action', 'action', 'notify_staff', 'value', f.step::text,
          'mins', 0, 'after', true, 'x', 300, 'y', 140)),
        'edges', jsonb_build_array(jsonb_build_object('from', 'trigger', 'port', 'out', 'to', 'a1'))
      ));
    end if;
  end loop;
end;
$$;
