-- Daily check-in, daily tasks and daily practice in the student app.
--
-- A child signs in to the app each day and checks in for a few coins; a
-- list of daily tasks (watch a video, get a live question right, do some
-- practice) pays coins once each day when done; and daily practice brings
-- back the choice and fill-in questions their teachers asked in their
-- lessons, a few coins for each right answer. The coins are points in
-- student_points (new kinds checkin, task, practice), like every other point.
--
-- White-label: each school sets it in Class Settings > Student app
-- (app_settings 'student_daily', and the daily_tasks list; hide, never
-- delete). Mirai's defaults are seeded here.
-- The app reads and writes only through the portal_* functions below (a
-- login acts only for its own children, portal_may_act_for); the school's
-- staff need Class Settings (view to read, edit to change).

-- ---------------------------------------------------------------------------
-- The new kinds of points

alter table public.student_points drop constraint if exists student_points_kind_check;
alter table public.student_points
  add constraint student_points_kind_check
  check (kind in ('attendance', 'award', 'redeem', 'adjust', 'question', 'checkin', 'task', 'practice'));

-- ---------------------------------------------------------------------------
-- Tables

create table public.daily_tasks (
  id bigint generated always as identity primary key,
  label text not null check (char_length(btrim(label)) between 1 and 60),
  -- What the app counts: videos watched (80% or more) today, live questions
  -- answered right today, practice questions done today.
  kind text not null check (kind in ('video', 'live_right', 'practice')),
  target integer not null check (target between 1 and 20),
  coins integer not null check (coins between 1 and 100),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.student_check_ins (
  student_id bigint not null references public.students (id) on delete cascade,
  day date not null,
  points_entry_id bigint references public.student_points (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (student_id, day)
);

create table public.student_task_claims (
  student_id bigint not null references public.students (id) on delete cascade,
  task_id bigint not null references public.daily_tasks (id) on delete cascade,
  day date not null,
  points_entry_id bigint references public.student_points (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (student_id, task_id, day)
);

create table public.practice_answers (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students (id) on delete cascade,
  live_question_id bigint not null references public.live_questions (id) on delete cascade,
  day date not null,
  answer_text text check (answer_text is null or char_length(answer_text) <= 300),
  answer_choices integer[],
  correct boolean not null,
  coins integer not null default 0 check (coins >= 0),
  points_entry_id bigint references public.student_points (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (student_id, live_question_id, day)
);

create index practice_answers_student_day_idx on public.practice_answers (student_id, day);

alter table public.daily_tasks enable row level security;
alter table public.student_check_ins enable row level security;
alter table public.student_task_claims enable row level security;
alter table public.practice_answers enable row level security;
revoke all on public.daily_tasks, public.student_check_ins, public.student_task_claims, public.practice_answers from public, anon, authenticated;

-- Mirai's defaults (each school changes them in the CRM).
insert into public.daily_tasks (label, kind, target, coins, sort_order) values
  ('Watch a learning video', 'video', 1, 3, 1),
  ('Get a live question right', 'live_right', 1, 3, 2),
  ('Do 3 practice questions', 'practice', 3, 3, 3);

-- ---------------------------------------------------------------------------
-- Helpers

-- Today in Malaysia (the day a check-in or a task belongs to).
create or replace function public.daily_today()
returns date
language sql
stable
set search_path = public
as $$
  select (timezone('Asia/Kuala_Lumpur', now()))::date;
$$;

-- The school's settings, with the defaults filled in.
create or replace function public.student_daily_config()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'checkin_enabled', coalesce((s.value ->> 'checkin_enabled')::boolean, true),
    'checkin_coins', coalesce((s.value ->> 'checkin_coins')::integer, 2),
    'tasks_enabled', coalesce((s.value ->> 'tasks_enabled')::boolean, true),
    'practice_enabled', coalesce((s.value ->> 'practice_enabled')::boolean, true),
    'practice_per_day', coalesce((s.value ->> 'practice_per_day')::integer, 5),
    'practice_coins', coalesce((s.value ->> 'practice_coins')::integer, 1)
  )
  from (select (select value from public.app_settings where key = 'student_daily') as value) s;
$$;

revoke all on function public.daily_today() from public, anon;
grant execute on function public.daily_today() to authenticated;
revoke all on function public.student_daily_config() from public, anon, authenticated;

-- How far a child is with one kind of task today.
create or replace function public.daily_task_progress(p_student_id bigint, p_kind text, p_day date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case p_kind
    when 'video' then (
      select count(*)::integer from public.class_video_progress p
      where p.student_id = p_student_id
        and p.watch_percentage >= 80
        and (timezone('Asia/Kuala_Lumpur', p.last_watched_at))::date = p_day)
    when 'live_right' then (
      select count(*)::integer from public.live_answers a
      where a.student_id = p_student_id
        and a.result = 'correct'
        and (timezone('Asia/Kuala_Lumpur', a.submitted_at))::date = p_day)
    when 'practice' then (
      select count(*)::integer from public.practice_answers a
      where a.student_id = p_student_id and a.day = p_day)
    else 0
  end;
$$;

revoke all on function public.daily_task_progress(bigint, text, date) from public, anon, authenticated;

-- Days in a row the child checked in, ending today (or yesterday, before today's check-in).
create or replace function public.daily_check_in_streak(p_student_id bigint, p_day date)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_day date := p_day;
  v_count integer := 0;
begin
  if not exists (select 1 from public.student_check_ins where student_id = p_student_id and day = v_day) then
    v_day := v_day - 1;
  end if;
  while exists (select 1 from public.student_check_ins where student_id = p_student_id and day = v_day) loop
    v_count := v_count + 1;
    v_day := v_day - 1;
    exit when v_count >= 366;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.daily_check_in_streak(bigint, date) from public, anon, authenticated;

-- The questions daily practice can bring back for a child: closed live
-- questions of their lessons (the last 180 days) that have a right answer
-- the app can check (choice with right options, fill-in with answers).
create or replace function public.practice_pool(p_student_id bigint)
returns setof public.live_questions
language sql
stable
security definer
set search_path = public
as $$
  select q.*
  from public.live_questions q
  join public.class_sessions s on s.id = q.session_id
  join public.live_question_keys k on k.live_question_id = q.id
  where q.status = 'closed'
    and q.kind in ('choice', 'fill')
    and s.lesson_date >= public.daily_today() - 180
    and (
      (q.kind = 'choice' and coalesce(array_length(k.correct_options, 1), 0) > 0)
      or (q.kind = 'fill' and jsonb_array_length(coalesce(k.accepted_answers, '[]'::jsonb)) > 0)
    )
    and public.is_class_session_student(s.id, p_student_id);
$$;

revoke all on function public.practice_pool(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The app

-- Today for one child: check-in, the tasks with their progress, practice.
create or replace function public.portal_daily(p_student_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_config jsonb := public.student_daily_config();
  v_day date := public.daily_today();
  v_done_today integer;
begin
  if not public.portal_may_act_for(p_student_id) then
    raise exception 'Not found.';
  end if;
  select count(*)::integer into v_done_today from public.practice_answers where student_id = p_student_id and day = v_day;
  return jsonb_build_object(
    'day', v_day,
    'checkin', jsonb_build_object(
      'enabled', (v_config ->> 'checkin_enabled')::boolean,
      'coins', (v_config ->> 'checkin_coins')::integer,
      'done', exists (select 1 from public.student_check_ins where student_id = p_student_id and day = v_day),
      'streak', public.daily_check_in_streak(p_student_id, v_day)
    ),
    'tasks', case when (v_config ->> 'tasks_enabled')::boolean then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'label', t.label,
        'kind', t.kind,
        'target', t.target,
        'coins', t.coins,
        'progress', least(t.target, public.daily_task_progress(p_student_id, t.kind, v_day)),
        'claimed', exists (select 1 from public.student_task_claims c where c.student_id = p_student_id and c.task_id = t.id and c.day = v_day)
      ) order by t.sort_order, t.id)
      from public.daily_tasks t
      where t.is_active
        and (t.kind <> 'practice' or (v_config ->> 'practice_enabled')::boolean)
    ), '[]'::jsonb) else '[]'::jsonb end,
    'practice', jsonb_build_object(
      'enabled', (v_config ->> 'practice_enabled')::boolean,
      'per_day', (v_config ->> 'practice_per_day')::integer,
      'coins', (v_config ->> 'practice_coins')::integer,
      'done_today', v_done_today,
      'right_today', (select count(*)::integer from public.practice_answers where student_id = p_student_id and day = v_day and correct),
      'has_questions', exists (select 1 from public.practice_pool(p_student_id))
    )
  );
end;
$$;

revoke all on function public.portal_daily(bigint) from public, anon;
grant execute on function public.portal_daily(bigint) to authenticated;

-- Check in for today: the coins once a day.
create or replace function public.portal_check_in(p_student_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config jsonb := public.student_daily_config();
  v_day date := public.daily_today();
  v_coins integer := (v_config ->> 'checkin_coins')::integer;
  v_entry bigint;
begin
  if not public.portal_may_act_for(p_student_id) then
    raise exception 'Not found.';
  end if;
  if not (v_config ->> 'checkin_enabled')::boolean then
    raise exception 'Check-in is not on at this school.';
  end if;
  if exists (select 1 from public.student_check_ins where student_id = p_student_id and day = v_day) then
    raise exception 'You already checked in today.';
  end if;
  insert into public.student_points (student_id, points, kind, reason)
  values (p_student_id, v_coins, 'checkin', 'Daily check-in')
  returning id into v_entry;
  insert into public.student_check_ins (student_id, day, points_entry_id) values (p_student_id, v_day, v_entry);
  return jsonb_build_object('coins', v_coins, 'streak', public.daily_check_in_streak(p_student_id, v_day));
exception
  when unique_violation then
    raise exception 'You already checked in today.';
end;
$$;

revoke all on function public.portal_check_in(bigint) from public, anon;
grant execute on function public.portal_check_in(bigint) to authenticated;

-- Claim a finished task's coins (once a day).
create or replace function public.portal_claim_task(p_student_id bigint, p_task_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config jsonb := public.student_daily_config();
  v_day date := public.daily_today();
  v_task public.daily_tasks%rowtype;
  v_entry bigint;
begin
  if not public.portal_may_act_for(p_student_id) then
    raise exception 'Not found.';
  end if;
  if not (v_config ->> 'tasks_enabled')::boolean then
    raise exception 'Daily tasks are not on at this school.';
  end if;
  select * into v_task from public.daily_tasks where id = p_task_id and is_active;
  if not found or (v_task.kind = 'practice' and not (v_config ->> 'practice_enabled')::boolean) then
    raise exception 'That task is not on the list today.';
  end if;
  if public.daily_task_progress(p_student_id, v_task.kind, v_day) < v_task.target then
    raise exception 'Finish the task first.';
  end if;
  if exists (select 1 from public.student_task_claims where student_id = p_student_id and task_id = v_task.id and day = v_day) then
    raise exception 'You already got the coins for this task today.';
  end if;
  insert into public.student_points (student_id, points, kind, reason)
  values (p_student_id, v_task.coins, 'task', left('Task: ' || v_task.label, 120))
  returning id into v_entry;
  insert into public.student_task_claims (student_id, task_id, day, points_entry_id) values (p_student_id, v_task.id, v_day, v_entry);
  return jsonb_build_object('coins', v_task.coins);
exception
  when unique_violation then
    raise exception 'You already got the coins for this task today.';
end;
$$;

revoke all on function public.portal_claim_task(bigint, bigint) from public, anon;
grant execute on function public.portal_claim_task(bigint, bigint) to authenticated;

-- The next practice question for today (null when today's are done or there are none).
-- Questions never answered right come first; none twice in a day.
create or replace function public.portal_practice_next(p_student_id bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_config jsonb := public.student_daily_config();
  v_day date := public.daily_today();
  v_done integer;
  v_question public.live_questions%rowtype;
  v_class text;
  v_date date;
begin
  if not public.portal_may_act_for(p_student_id) then
    raise exception 'Not found.';
  end if;
  if not (v_config ->> 'practice_enabled')::boolean then
    raise exception 'Daily practice is not on at this school.';
  end if;
  select count(*)::integer into v_done from public.practice_answers where student_id = p_student_id and day = v_day;
  if v_done >= (v_config ->> 'practice_per_day')::integer then
    return jsonb_build_object('question', null, 'done_today', v_done, 'per_day', (v_config ->> 'practice_per_day')::integer);
  end if;
  select q.* into v_question
  from public.practice_pool(p_student_id) q
  where not exists (select 1 from public.practice_answers a where a.student_id = p_student_id and a.live_question_id = q.id and a.day = v_day)
  order by
    exists (select 1 from public.practice_answers a where a.student_id = p_student_id and a.live_question_id = q.id and a.correct),
    random()
  limit 1;
  if not found then
    return jsonb_build_object('question', null, 'done_today', v_done, 'per_day', (v_config ->> 'practice_per_day')::integer);
  end if;
  select c.name, s.lesson_date into v_class, v_date
  from public.class_sessions s left join public.classrooms c on c.id = s.classroom_id
  where s.id = v_question.session_id;
  return jsonb_build_object(
    'question', jsonb_build_object(
      'id', v_question.id,
      'kind', v_question.kind,
      'prompt', v_question.prompt,
      'options', v_question.options,
      'class', v_class,
      'lesson_date', v_date
    ),
    'done_today', v_done,
    'per_day', (v_config ->> 'practice_per_day')::integer
  );
end;
$$;

revoke all on function public.portal_practice_next(bigint) from public, anon;
grant execute on function public.portal_practice_next(bigint) to authenticated;

-- Answer a practice question: right or wrong at once, the right answer, the coins.
create or replace function public.portal_practice_answer(p_student_id bigint, p_live_question_id bigint, p_answer jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config jsonb := public.student_daily_config();
  v_day date := public.daily_today();
  v_question public.live_questions%rowtype;
  v_key public.live_question_keys%rowtype;
  v_text text := nullif(btrim(coalesce(p_answer ->> 'text', '')), '');
  v_choices integer[];
  v_correct boolean;
  v_coins integer := 0;
  v_entry bigint;
begin
  if not public.portal_may_act_for(p_student_id) then
    raise exception 'Not found.';
  end if;
  if not (v_config ->> 'practice_enabled')::boolean then
    raise exception 'Daily practice is not on at this school.';
  end if;
  select q.* into v_question from public.practice_pool(p_student_id) q where q.id = p_live_question_id;
  if not found then
    raise exception 'Not found.';
  end if;
  if (select count(*) from public.practice_answers where student_id = p_student_id and day = v_day) >= (v_config ->> 'practice_per_day')::integer then
    raise exception 'That is all the practice for today. Come back tomorrow!';
  end if;
  select * into v_key from public.live_question_keys where live_question_id = v_question.id;

  if v_question.kind = 'choice' then
    if jsonb_typeof(p_answer -> 'choices') is distinct from 'array' or jsonb_array_length(p_answer -> 'choices') = 0 then
      raise exception 'Pick an answer first.';
    end if;
    begin
      v_choices := array(select distinct (c.value #>> '{}')::integer from jsonb_array_elements(p_answer -> 'choices') c order by 1);
    exception when others then
      raise exception 'Pick an answer first.';
    end;
    if exists (select 1 from unnest(v_choices) c where c is null or c < 0 or c >= jsonb_array_length(v_question.options)) then
      raise exception 'Pick an answer first.';
    end if;
    v_correct := v_choices = (select array(select unnest(v_key.correct_options) order by 1));
    v_text := null;
  else
    if v_text is null then
      raise exception 'Write an answer first.';
    end if;
    if char_length(v_text) > 300 then
      raise exception 'That answer is too long.';
    end if;
    v_correct := public.answer_matches(v_text, v_key.accepted_answers, v_key.case_sensitive);
  end if;

  if v_correct then
    v_coins := (v_config ->> 'practice_coins')::integer;
  end if;
  if v_coins > 0 then
    insert into public.student_points (student_id, points, kind, reason)
    values (p_student_id, v_coins, 'practice', left('Practice: ' || regexp_replace(btrim(v_question.prompt), '\s+', ' ', 'g'), 120))
    returning id into v_entry;
  end if;
  insert into public.practice_answers (student_id, live_question_id, day, answer_text, answer_choices, correct, coins, points_entry_id)
  values (p_student_id, v_question.id, v_day, v_text, v_choices, v_correct, v_coins, v_entry);

  return jsonb_build_object(
    'correct', v_correct,
    'coins', v_coins,
    'right_options', case when v_question.kind = 'choice' then to_jsonb(v_key.correct_options) end,
    'right_answer', case when v_question.kind = 'fill' then v_key.accepted_answers -> 0 ->> 'text' end,
    'explanation', v_key.explanation
  );
exception
  when unique_violation then
    raise exception 'You already did this question today.';
end;
$$;

revoke all on function public.portal_practice_answer(bigint, bigint, jsonb) from public, anon;
grant execute on function public.portal_practice_answer(bigint, bigint, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- The CRM (Class Settings > Student app)

-- The settings and the whole task list (hidden ones too).
create or replace function public.student_daily_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('class_settings', 'view') then
    raise exception 'Only staff who may see Class Settings can see this.';
  end if;
  return jsonb_build_object(
    'settings', public.student_daily_config(),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'label', t.label, 'kind', t.kind, 'target', t.target, 'coins', t.coins,
        'is_active', t.is_active, 'sort_order', t.sort_order
      ) order by t.sort_order, t.id)
      from public.daily_tasks t
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.student_daily_settings() from public, anon;
grant execute on function public.student_daily_settings() to authenticated;

create or replace function public.set_student_daily_settings(p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_number integer;
begin
  if not public.has_permission('class_settings', 'edit') then
    raise exception 'Only staff who may edit Class Settings can change this.';
  end if;
  if jsonb_typeof(p_settings) <> 'object' then
    raise exception 'These settings are not valid.';
  end if;
  foreach v_key in array array['checkin_enabled', 'tasks_enabled', 'practice_enabled'] loop
    if jsonb_typeof(p_settings -> v_key) is distinct from 'boolean' then
      raise exception 'These settings are not valid.';
    end if;
  end loop;
  foreach v_key in array array['checkin_coins', 'practice_per_day', 'practice_coins'] loop
    if jsonb_typeof(p_settings -> v_key) is distinct from 'number' or (p_settings ->> v_key) !~ '^[0-9]+$' then
      raise exception 'These settings are not valid.';
    end if;
    v_number := (p_settings ->> v_key)::integer;
    if v_number < 1 or v_number > (case v_key when 'practice_per_day' then 30 else 100 end) then
      raise exception 'These settings are not valid.';
    end if;
  end loop;
  if exists (select 1 from jsonb_object_keys(p_settings) k where k not in ('checkin_enabled', 'checkin_coins', 'tasks_enabled', 'practice_enabled', 'practice_per_day', 'practice_coins')) then
    raise exception 'These settings are not valid.';
  end if;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('student_daily', p_settings, timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_student_daily_settings(jsonb) from public, anon;
grant execute on function public.set_student_daily_settings(jsonb) to authenticated;

-- Add a task (p_id null) or change one; hiding is is_active false. Returns its id.
create or replace function public.save_daily_task(
  p_id bigint,
  p_label text,
  p_kind text,
  p_target integer,
  p_coins integer,
  p_is_active boolean default true,
  p_sort_order integer default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.has_permission('class_settings', 'edit') then
    raise exception 'Only staff who may edit Class Settings can change this.';
  end if;
  if char_length(btrim(coalesce(p_label, ''))) not between 1 and 60 then
    raise exception 'Give the task a name (up to 60 letters).';
  end if;
  if coalesce(p_kind, '') not in ('video', 'live_right', 'practice') then
    raise exception 'Pick what the task counts.';
  end if;
  if coalesce(p_target, 0) not between 1 and 20 then
    raise exception 'How many times: 1 to 20.';
  end if;
  if coalesce(p_coins, 0) not between 1 and 100 then
    raise exception 'Coins: 1 to 100.';
  end if;

  if p_id is null then
    insert into public.daily_tasks (label, kind, target, coins, is_active, sort_order)
    values (btrim(p_label), p_kind, p_target, p_coins, coalesce(p_is_active, true),
            coalesce(p_sort_order, (select coalesce(max(sort_order), 0) + 1 from public.daily_tasks)))
    returning id into v_id;
  else
    update public.daily_tasks
      set label = btrim(p_label), kind = p_kind, target = p_target, coins = p_coins,
          is_active = coalesce(p_is_active, is_active), sort_order = coalesce(p_sort_order, sort_order)
      where id = p_id
      returning id into v_id;
    if v_id is null then
      raise exception 'That task is not there any more.';
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_daily_task(bigint, text, text, integer, integer, boolean, integer) from public, anon;
grant execute on function public.save_daily_task(bigint, text, text, integer, integer, boolean, integer) to authenticated;
