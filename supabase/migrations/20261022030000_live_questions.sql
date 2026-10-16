-- Live questions in class (phase 3C of the classroom plan). The teacher pops a
-- question from the question bank into a lesson; the children answer it in the
-- student app before the timer runs out; the teacher shows the right answer
-- when they are ready to explain it.
--
-- A popped question is a copy (live_questions), so changing the bank later
-- does not change a lesson that used it. Its answer key sits in its own table
-- (live_question_keys) that only staff read: the app gets the right answer
-- only after the teacher reveals it, through portal_live_state.
--
-- Marking: choice and fill-in answers are marked at once; a short answer that
-- matches an accepted answer is right at once; anything else (short,
-- screenshot, link) waits for the teacher, with an AI suggestion when the
-- school has AI marking on (the live-answer-mark function). Points for a right
-- answer go into the student_points ledger (kind 'question') and follow the
-- marking if the teacher changes it.
--
-- Per school (app_settings 'live_questions'):
--   scoring          'speed' (faster = more, at least half) or 'fixed'
--   leaderboard_top  how many of the top places the children see (0 = none)
--   ai_marking       ask the AI for a suggestion on answers the teacher marks

-- ---------------------------------------------------------------------------
-- Settings

insert into public.app_settings (key, value)
values ('live_questions', '{"scoring": "speed", "leaderboard_top": 3, "ai_marking": true}'::jsonb)
on conflict (key) do nothing;

create or replace function public.set_live_question_settings(p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scoring text := p_settings ->> 'scoring';
  v_top integer;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change the live question settings.';
  end if;
  if coalesce(v_scoring, '') not in ('speed', 'fixed') then
    raise exception 'Scoring is speed or fixed.';
  end if;
  begin
    v_top := (p_settings ->> 'leaderboard_top')::integer;
  exception when others then
    v_top := null;
  end;
  if v_top is null or v_top not between 0 and 10 then
    raise exception 'The leaderboard shows 0 to 10 places.';
  end if;
  if jsonb_typeof(p_settings -> 'ai_marking') is distinct from 'boolean' then
    raise exception 'Say whether AI marking is on.';
  end if;

  insert into public.app_settings (key, value)
  values ('live_questions', jsonb_build_object('scoring', v_scoring, 'leaderboard_top', v_top, 'ai_marking', (p_settings ->> 'ai_marking')::boolean))
  on conflict (key) do update set value = excluded.value;
end;
$$;

revoke all on function public.set_live_question_settings(jsonb) from public, anon;
grant execute on function public.set_live_question_settings(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Matching typed answers (the same rules as the question bank page)

-- Spaces squeezed, ends trimmed, and lower case unless case matters.
create or replace function public.answer_normalize(p_text text, p_case_sensitive boolean)
returns text
language sql
immutable
set search_path = public
as $$
  select case when p_case_sensitive then v else lower(v) end
  from (select regexp_replace(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'), '^ | $', '', 'g') as v) squeezed;
$$;

-- Letters to add, drop or change to turn one text into the other.
create or replace function public.text_edit_distance(p_left text, p_right text)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v_left text := left(coalesce(p_left, ''), 300);
  v_right text := left(coalesce(p_right, ''), 300);
  v_previous integer[];
  v_current integer[];
  i integer;
  j integer;
begin
  if v_left = v_right then
    return 0;
  end if;
  if length(v_left) = 0 then
    return length(v_right);
  end if;
  if length(v_right) = 0 then
    return length(v_left);
  end if;
  v_previous := array(select generate_series(0, length(v_right)));
  for i in 1 .. length(v_left) loop
    v_current := array[i];
    for j in 1 .. length(v_right) loop
      v_current := v_current || least(
        v_previous[j + 1] + 1,
        v_current[j] + 1,
        v_previous[j] + case when substr(v_left, i, 1) = substr(v_right, j, 1) then 0 else 1 end
      );
    end loop;
    v_previous := v_current;
  end loop;
  return v_previous[length(v_right) + 1];
end;
$$;

-- Does a typed answer match one of the accepted answers [{text, match}]?
create or replace function public.answer_matches(p_answer text, p_accepted jsonb, p_case_sensitive boolean)
returns boolean
language sql
immutable
set search_path = public
as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce(p_accepted, '[]'::jsonb)) a,
      lateral (select public.answer_normalize(p_answer, p_case_sensitive) as given,
                      public.answer_normalize(a.value ->> 'text', p_case_sensitive) as wanted) n
    where n.given <> '' and n.wanted <> ''
      and case a.value ->> 'match'
        when 'exact' then n.given = n.wanted
        when 'contains' then strpos(n.given, n.wanted) > 0
        when 'close' then public.text_edit_distance(n.given, n.wanted) <= case when length(n.wanted) <= 6 then 1 else 2 end
        else false
      end
  );
$$;

-- Points for a right answer: the question's points, or (speed scoring) at
-- least half of them and more the faster it came.
create or replace function public.live_question_points(p_points integer, p_seconds numeric, p_limit integer, p_scoring text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when p_scoring = 'fixed' then p_points
    else greatest(
      ceil(p_points / 2.0)::integer,
      round(p_points * (1 - 0.5 * least(greatest(p_seconds, 0), p_limit) / greatest(p_limit, 1)))::integer
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- Tables

create table public.live_questions (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.class_sessions (id) on delete cascade,
  question_id bigint references public.questions (id) on delete set null,
  position integer not null check (position > 0),
  kind text not null check (kind in ('choice', 'fill', 'short', 'screenshot', 'link')),
  prompt text not null check (char_length(btrim(prompt)) between 1 and 2000),
  -- Choice questions: [{text}] only; which are right is in the key.
  options jsonb not null default '[]'::jsonb,
  points integer not null check (points between 1 and 100),
  time_limit_seconds integer not null check (time_limit_seconds between 5 and 1800),
  scoring text not null check (scoring in ('speed', 'fixed')),
  status text not null default 'live' check (status in ('live', 'closed')),
  opened_at timestamptz not null default timezone('utc', now()),
  closes_at timestamptz not null,
  closed_at timestamptz,
  revealed_at timestamptz,
  created_by bigint references public.teachers (id) on delete set null,
  unique (session_id, position),
  check (closes_at > opened_at)
);

-- One question at a time in a lesson.
create unique index live_questions_one_live_idx on public.live_questions (session_id) where status = 'live';

create table public.live_question_keys (
  live_question_id bigint primary key references public.live_questions (id) on delete cascade,
  correct_options integer[] not null default '{}',
  accepted_answers jsonb not null default '[]'::jsonb,
  case_sensitive boolean not null default false,
  explanation text
);

create table public.live_answers (
  id bigint generated always as identity primary key,
  live_question_id bigint not null references public.live_questions (id) on delete cascade,
  session_id bigint not null references public.class_sessions (id) on delete cascade,
  student_id bigint not null references public.students (id) on delete cascade,
  -- The child's own login, or a parent's (a child on the parent's phone).
  answered_by text not null check (answered_by in ('student', 'parent')),
  answer_text text check (answer_text is null or char_length(answer_text) <= 2000),
  answer_choices integer[],
  -- Screenshots: the file in the live-answers bucket.
  file_path text check (file_path is null or char_length(file_path) <= 500),
  submitted_at timestamptz not null default timezone('utc', now()),
  seconds_taken numeric(6, 1) not null check (seconds_taken >= 0),
  points_if_correct integer not null check (points_if_correct between 0 and 100),
  result text not null check (result in ('correct', 'wrong', 'pending')),
  points integer not null default 0,
  marked_by text check (marked_by in ('auto', 'teacher')),
  marked_at timestamptz,
  -- What the AI thinks (only a suggestion; the teacher decides).
  ai_suggestion text check (ai_suggestion in ('right', 'wrong', 'unsure')),
  ai_feedback text check (ai_feedback is null or char_length(ai_feedback) <= 500),
  ai_note text check (ai_note is null or char_length(ai_note) <= 500),
  ai_checked_at timestamptz,
  -- Shown to the child once the answer is revealed.
  feedback text check (feedback is null or char_length(feedback) <= 500),
  points_entry_id bigint references public.student_points (id) on delete set null,
  unique (live_question_id, student_id)
);

create index live_answers_session_idx on public.live_answers (session_id, student_id);
create index live_answers_pending_idx on public.live_answers (live_question_id) where result = 'pending';

-- Points for answers go into the same ledger as every other reward.
alter table public.student_points drop constraint if exists student_points_kind_check;
alter table public.student_points
  add constraint student_points_kind_check check (kind in ('attendance', 'award', 'redeem', 'adjust', 'question'));

-- ---------------------------------------------------------------------------
-- Who is who

-- The lesson's teacher, or anyone who may edit classes.
create or replace function public.can_run_class_session(p_session_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.class_sessions cs
    where cs.id = p_session_id
      and (cs.teacher_id = public.current_teacher_id() or public.can_edit_classes())
  );
$$;

-- The lesson's teacher, or anyone who may see classes.
create or replace function public.can_see_class_session(p_session_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.class_sessions cs
    where cs.id = p_session_id
      and (cs.teacher_id = public.current_teacher_id() or public.can_view_classes())
  );
$$;

-- May this app login (the child, or their parent) act for that child?
create or replace function public.portal_may_act_for(p_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_student_id is not null and exists (select 1 from public.portal_children() c where c.student_id = p_student_id);
$$;

-- Is one of this app login's children in that lesson?
create or replace function public.portal_in_session(p_session_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.portal_children() c
    where public.is_class_session_student(p_session_id, c.student_id)
  );
$$;

revoke all on function public.can_run_class_session(bigint) from public, anon;
revoke all on function public.can_see_class_session(bigint) from public, anon;
revoke all on function public.portal_may_act_for(bigint) from public, anon;
revoke all on function public.portal_in_session(bigint) from public, anon;
grant execute on function public.can_run_class_session(bigint) to authenticated;
grant execute on function public.can_see_class_session(bigint) to authenticated;
grant execute on function public.portal_may_act_for(bigint) to authenticated;
grant execute on function public.portal_in_session(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Who reads what. Writes only go through the functions below.

alter table public.live_questions enable row level security;
alter table public.live_question_keys enable row level security;
alter table public.live_answers enable row level security;

revoke all on public.live_questions from public, anon, authenticated;
revoke all on public.live_question_keys from public, anon, authenticated;
revoke all on public.live_answers from public, anon, authenticated;
grant select on public.live_questions to authenticated;
grant select on public.live_question_keys to authenticated;
grant select on public.live_answers to authenticated;
grant all on public.live_questions to service_role;
grant all on public.live_question_keys to service_role;
grant all on public.live_answers to service_role;

-- The app may see the question itself (it needs it in real time); never the key.
create policy live_questions_select_scoped
  on public.live_questions
  for select to authenticated
  using ((select public.can_see_class_session(session_id)) or (select public.portal_in_session(session_id)));

create policy live_question_keys_select_staff
  on public.live_question_keys
  for select to authenticated
  using (exists (
    select 1 from public.live_questions lq
    where lq.id = live_question_keys.live_question_id and public.can_see_class_session(lq.session_id)
  ));

-- Answers: staff only. The app reads its own through portal_live_state, which
-- holds back right / wrong until the teacher reveals.
create policy live_answers_select_staff
  on public.live_answers
  for select to authenticated
  using ((select public.can_see_class_session(session_id)));

-- ---------------------------------------------------------------------------
-- Points follow the marking

create or replace function public.sync_live_answer_points(p_answer_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answer public.live_answers%rowtype;
  v_session public.class_sessions%rowtype;
  v_prompt text;
  v_points integer;
  v_entry_id bigint;
begin
  select * into v_answer from public.live_answers where id = p_answer_id for update;
  if not found then
    return;
  end if;
  select * into v_session from public.class_sessions where id = v_answer.session_id;
  select prompt into v_prompt from public.live_questions where id = v_answer.live_question_id;
  v_points := case when v_answer.result = 'correct' then v_answer.points_if_correct else 0 end;

  if v_points > 0 and v_answer.points_entry_id is null then
    insert into public.student_points (student_id, points, kind, reason, schedule_id, lesson_date, created_by)
    values (
      v_answer.student_id, v_points, 'question',
      left('Question: ' || regexp_replace(btrim(v_prompt), '\s+', ' ', 'g'), 120),
      v_session.schedule_id, v_session.lesson_date, v_session.teacher_id
    )
    returning id into v_entry_id;
  elsif v_points > 0 then
    update public.student_points set points = v_points where id = v_answer.points_entry_id;
    v_entry_id := v_answer.points_entry_id;
  elsif v_answer.points_entry_id is not null then
    delete from public.student_points where id = v_answer.points_entry_id;
    v_entry_id := null;
  end if;

  update public.live_answers set points = v_points, points_entry_id = v_entry_id where id = p_answer_id;
end;
$$;

revoke all on function public.sync_live_answer_points(bigint) from public, anon, authenticated;

-- Question points change with the marking, so they are not undone by hand.
create or replace function public.undo_points(p_points_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.student_points%rowtype;
  v_id bigint;
begin
  select * into v_row from public.student_points where id = p_points_id;
  if not found then
    raise exception 'Points entry not found.';
  end if;
  if v_row.kind = 'attendance' then
    raise exception 'Attendance points change with the attendance itself.';
  end if;
  if v_row.kind = 'question' then
    raise exception 'Question points change when the answer is marked again.';
  end if;
  if v_row.reverses_id is not null then
    raise exception 'This entry is already an undo.';
  end if;
  if not (
    public.is_admin()
    or (v_row.created_by = public.current_teacher_id()
      and v_row.created_at > timezone('utc', now()) - interval '24 hours')
  ) then
    raise exception 'Only who gave these points can undo them, within 24 hours.';
  end if;

  insert into public.student_points (student_id, points, kind, reason, schedule_id, lesson_date, reverses_id, created_by)
  values (
    v_row.student_id, -v_row.points, 'adjust', left('Undo: ' || v_row.reason, 120),
    v_row.schedule_id, v_row.lesson_date, v_row.id, public.current_teacher_id()
  )
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'These points were already undone.';
end;
$$;

-- ---------------------------------------------------------------------------
-- The teacher

-- Pop a question from the bank into the lesson (any live one closes first).
create or replace function public.push_live_question(p_session_id bigint, p_question_id bigint, p_time_limit_seconds integer default null)
returns public.live_questions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.class_sessions%rowtype;
  v_question public.questions%rowtype;
  v_limit integer;
  v_scoring text;
  v_row public.live_questions%rowtype;
begin
  select * into v_session from public.class_sessions where id = p_session_id for update;
  if not found or not public.can_run_class_session(p_session_id) then
    raise exception 'Only this class''s teacher can pop questions in it.';
  end if;
  if v_session.status = 'ended' then
    raise exception 'This lesson has ended.';
  end if;

  select * into v_question from public.questions where id = p_question_id;
  if not found or v_question.is_archived
    or not (v_question.is_shared or v_question.owner_id = public.current_teacher_id() or public.is_admin()) then
    raise exception 'Question not found.';
  end if;

  v_limit := coalesce(p_time_limit_seconds, v_question.time_limit_seconds);
  if v_limit not between 5 and 1800 then
    raise exception 'The time limit is 5 seconds to 30 minutes.';
  end if;
  select coalesce(value ->> 'scoring', 'speed') into v_scoring from public.app_settings where key = 'live_questions';
  v_scoring := case when v_scoring = 'fixed' then 'fixed' else 'speed' end;

  update public.live_questions
  set status = 'closed', closed_at = least(timezone('utc', now()), closes_at)
  where session_id = p_session_id and status = 'live';

  insert into public.live_questions (
    session_id, question_id, position, kind, prompt, options, points, time_limit_seconds, scoring,
    opened_at, closes_at, created_by
  )
  values (
    p_session_id,
    v_question.id,
    coalesce((select max(position) from public.live_questions where session_id = p_session_id), 0) + 1,
    v_question.kind,
    v_question.prompt,
    case when v_question.kind = 'choice' then coalesce((
      select jsonb_agg(jsonb_build_object('text', o.value ->> 'text') order by o.ordinality)
      from jsonb_array_elements(v_question.options) with ordinality o
    ), '[]'::jsonb) else '[]'::jsonb end,
    v_question.points,
    v_limit,
    v_scoring,
    timezone('utc', now()),
    timezone('utc', now()) + make_interval(secs => v_limit),
    public.current_teacher_id()
  )
  returning * into v_row;

  insert into public.live_question_keys (live_question_id, correct_options, accepted_answers, case_sensitive, explanation)
  values (
    v_row.id,
    case when v_question.kind = 'choice' then coalesce(array(
      select (o.ordinality - 1)::integer
      from jsonb_array_elements(v_question.options) with ordinality o
      where (o.value ->> 'correct')::boolean
      order by o.ordinality
    ), '{}') else '{}' end,
    case when v_question.kind in ('fill', 'short') then v_question.accepted_answers else '[]'::jsonb end,
    v_question.case_sensitive,
    v_question.explanation
  );

  if v_session.status = 'scheduled' then
    update public.class_sessions
    set status = 'live', started_at = coalesce(started_at, timezone('utc', now()))
    where id = p_session_id;
  end if;

  return v_row;
end;
$$;

-- Stop taking answers now (the timer also stops them by itself).
create or replace function public.close_live_question(p_live_question_id bigint)
returns public.live_questions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.live_questions%rowtype;
begin
  select * into v_row from public.live_questions where id = p_live_question_id for update;
  if not found or not public.can_run_class_session(v_row.session_id) then
    raise exception 'Question not found.';
  end if;
  if v_row.status = 'live' then
    update public.live_questions
    set status = 'closed', closed_at = least(timezone('utc', now()), closes_at)
    where id = p_live_question_id
    returning * into v_row;
  end if;
  return v_row;
end;
$$;

-- Show the right answer (and each child's result) in the app.
create or replace function public.reveal_live_question(p_live_question_id bigint)
returns public.live_questions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.live_questions%rowtype;
begin
  v_row := public.close_live_question(p_live_question_id);
  update public.live_questions
  set revealed_at = coalesce(revealed_at, timezone('utc', now()))
  where id = p_live_question_id
  returning * into v_row;
  return v_row;
end;
$$;

-- The teacher marks an answer (or changes the mark); points follow.
create or replace function public.mark_live_answer(p_answer_id bigint, p_correct boolean, p_feedback text default null)
returns public.live_answers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.live_answers%rowtype;
begin
  select * into v_row from public.live_answers where id = p_answer_id for update;
  if not found or not public.can_run_class_session(v_row.session_id) then
    raise exception 'Answer not found.';
  end if;
  if p_correct is null then
    raise exception 'Say whether the answer is right.';
  end if;
  if p_feedback is not null and char_length(p_feedback) > 500 then
    raise exception 'Keep the feedback under 500 letters.';
  end if;

  update public.live_answers
  set result = case when p_correct then 'correct' else 'wrong' end,
      marked_by = 'teacher',
      marked_at = timezone('utc', now()),
      feedback = coalesce(nullif(btrim(coalesce(p_feedback, '')), ''), feedback)
  where id = p_answer_id;
  perform public.sync_live_answer_points(p_answer_id);

  select * into v_row from public.live_answers where id = p_answer_id;
  return v_row;
end;
$$;

-- The AI's suggestion for an answer that waits for the teacher. Only the
-- live-answer-mark function (server) calls it.
create or replace function public.apply_live_ai_mark(p_answer_id bigint, p_suggestion text, p_feedback text, p_note text)
returns public.live_answers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.live_answers%rowtype;
begin
  if p_suggestion not in ('right', 'wrong', 'unsure') then
    raise exception 'Unknown suggestion %.', p_suggestion;
  end if;
  update public.live_answers
  set ai_suggestion = p_suggestion,
      ai_feedback = left(nullif(btrim(coalesce(p_feedback, '')), ''), 500),
      ai_note = left(nullif(btrim(coalesce(p_note, '')), ''), 500),
      ai_checked_at = timezone('utc', now())
  where id = p_answer_id
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.push_live_question(bigint, bigint, integer) from public, anon;
revoke all on function public.close_live_question(bigint) from public, anon;
revoke all on function public.reveal_live_question(bigint) from public, anon;
revoke all on function public.mark_live_answer(bigint, boolean, text) from public, anon;
revoke all on function public.apply_live_ai_mark(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.push_live_question(bigint, bigint, integer) to authenticated;
grant execute on function public.close_live_question(bigint) to authenticated;
grant execute on function public.reveal_live_question(bigint) to authenticated;
grant execute on function public.mark_live_answer(bigint, boolean, text) to authenticated;
grant execute on function public.apply_live_ai_mark(bigint, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- The child (or the parent's phone)

-- p_answer: {"choices": [0, 2]} | {"text": "..."} | {"file": "<session>/<student>/<name>"}
create or replace function public.submit_live_answer(p_live_question_id bigint, p_student_id bigint, p_answer jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question public.live_questions%rowtype;
  v_key public.live_question_keys%rowtype;
  v_text text := nullif(btrim(coalesce(p_answer ->> 'text', '')), '');
  v_choices integer[];
  v_file text := nullif(btrim(coalesce(p_answer ->> 'file', '')), '');
  v_result text;
  v_seconds numeric;
  v_points integer;
  v_id bigint;
  v_option_count integer;
begin
  if not public.portal_may_act_for(p_student_id) then
    raise exception 'Not found.';
  end if;
  select * into v_question from public.live_questions where id = p_live_question_id;
  if not found or not public.is_class_session_student(v_question.session_id, p_student_id) then
    raise exception 'Not found.';
  end if;
  if v_question.status <> 'live' or timezone('utc', now()) > v_question.closes_at + interval '2 seconds' then
    raise exception 'Time is up for this question.';
  end if;
  if exists (select 1 from public.live_answers where live_question_id = v_question.id and student_id = p_student_id) then
    raise exception 'You already answered this question.';
  end if;
  select * into v_key from public.live_question_keys where live_question_id = v_question.id;

  if v_question.kind = 'choice' then
    if jsonb_typeof(p_answer -> 'choices') is distinct from 'array' or jsonb_array_length(p_answer -> 'choices') = 0 then
      raise exception 'Pick an answer first.';
    end if;
    v_option_count := jsonb_array_length(v_question.options);
    begin
      v_choices := array(select distinct (c.value #>> '{}')::integer from jsonb_array_elements(p_answer -> 'choices') c order by 1);
    exception when others then
      raise exception 'Pick an answer first.';
    end;
    if exists (select 1 from unnest(v_choices) c where c is null or c < 0 or c >= v_option_count) then
      raise exception 'Pick an answer first.';
    end if;
    v_result := case when v_choices = (select array(select unnest(v_key.correct_options) order by 1)) then 'correct' else 'wrong' end;
    v_text := null;
    v_file := null;
  elsif v_question.kind in ('fill', 'short') then
    if v_text is null then
      raise exception 'Write an answer first.';
    end if;
    if char_length(v_text) > (case when v_question.kind = 'fill' then 300 else 2000 end) then
      raise exception 'That answer is too long.';
    end if;
    if public.answer_matches(v_text, v_key.accepted_answers, v_key.case_sensitive) then
      v_result := 'correct';
    else
      v_result := case when v_question.kind = 'fill' then 'wrong' else 'pending' end;
    end if;
    v_file := null;
  elsif v_question.kind = 'link' then
    if v_text is null or v_text !~* '^https?://[^\s]+$' or char_length(v_text) > 1000 then
      raise exception 'Paste the link to your work (starting with http).';
    end if;
    v_result := 'pending';
    v_file := null;
  else
    if v_file is null or v_file not like (v_question.session_id || '/' || p_student_id || '/%') or v_file like '%..%' then
      raise exception 'Add a picture of your work first.';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'live-answers' and o.name = v_file) then
      raise exception 'Add a picture of your work first.';
    end if;
    v_result := 'pending';
    v_text := nullif(left(coalesce(v_text, ''), 2000), '');
  end if;

  v_seconds := least(v_question.time_limit_seconds, greatest(0, round(extract(epoch from (timezone('utc', now()) - v_question.opened_at))::numeric, 1)));
  v_points := public.live_question_points(v_question.points, v_seconds, v_question.time_limit_seconds, v_question.scoring);

  insert into public.live_answers (
    live_question_id, session_id, student_id, answered_by, answer_text, answer_choices, file_path,
    seconds_taken, points_if_correct, result, marked_by, marked_at
  )
  values (
    v_question.id, v_question.session_id, p_student_id,
    case when public.current_student_id() = p_student_id then 'student' else 'parent' end,
    v_text, v_choices, v_file, v_seconds, v_points, v_result,
    case when v_result <> 'pending' then 'auto' end,
    case when v_result <> 'pending' then timezone('utc', now()) end
  )
  returning id into v_id;

  if v_result = 'correct' then
    perform public.sync_live_answer_points(v_id);
  end if;

  return jsonb_build_object('id', v_id, 'status', 'received');
exception
  when unique_violation then
    raise exception 'You already answered this question.';
end;
$$;

-- What the app shows for one child right now: the lesson they are in today
-- with a question, the latest question, their answer (right or wrong only
-- after the reveal), the right answer once revealed, and the top places.
create or replace function public.portal_live_state(p_student_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_now timestamptz := timezone('utc', now());
  v_settings jsonb;
  v_top integer;
  v_session public.class_sessions%rowtype;
  v_question public.live_questions%rowtype;
  v_key public.live_question_keys%rowtype;
  v_answer public.live_answers%rowtype;
  v_revealed boolean;
  v_result jsonb;
  v_board jsonb;
  v_my_points integer;
  v_my_rank integer;
begin
  if not public.portal_may_act_for(p_student_id) then
    raise exception 'Not found.';
  end if;

  select cs.* into v_session
  from public.class_sessions cs
  join public.live_questions lq on lq.session_id = cs.id
  where cs.lesson_date = v_today
    and cs.status <> 'ended'
    and public.is_class_session_student(cs.id, p_student_id)
  order by lq.opened_at desc
  limit 1;

  if v_session.id is null then
    return jsonb_build_object('active', false, 'server_now', v_now);
  end if;

  select value into v_settings from public.app_settings where key = 'live_questions';
  v_top := coalesce((v_settings ->> 'leaderboard_top')::integer, 3);

  select * into v_question from public.live_questions
  where session_id = v_session.id
  order by position desc
  limit 1;
  select * into v_key from public.live_question_keys where live_question_id = v_question.id;
  select * into v_answer from public.live_answers where live_question_id = v_question.id and student_id = p_student_id;
  v_revealed := v_question.revealed_at is not null;

  v_result := jsonb_build_object(
    'active', true,
    'server_now', v_now,
    'session', jsonb_build_object(
      'id', v_session.id,
      'class', (select name from public.classrooms where id = v_session.classroom_id),
      'questions', (select count(*) from public.live_questions where session_id = v_session.id)
    ),
    'question', jsonb_build_object(
      'id', v_question.id,
      'number', v_question.position,
      'kind', v_question.kind,
      'prompt', v_question.prompt,
      'options', v_question.options,
      'points', v_question.points,
      'time_limit_seconds', v_question.time_limit_seconds,
      'opened_at', v_question.opened_at,
      'closes_at', v_question.closes_at,
      'open', v_question.status = 'live' and v_now <= v_question.closes_at,
      'revealed', v_revealed
    ),
    'answer', case when v_answer.id is null then null else jsonb_build_object(
      'text', v_answer.answer_text,
      'choices', to_jsonb(v_answer.answer_choices),
      'has_file', v_answer.file_path is not null,
      'submitted_at', v_answer.submitted_at,
      'result', case when v_revealed then v_answer.result end,
      'points', case when v_revealed then v_answer.points end,
      'feedback', case when v_revealed then v_answer.feedback end
    ) end,
    'key', case when v_revealed then jsonb_build_object(
      'correct_options', to_jsonb(v_key.correct_options),
      'answers', coalesce((select jsonb_agg(a.value ->> 'text') from jsonb_array_elements(v_key.accepted_answers) a), '[]'::jsonb),
      'explanation', v_key.explanation
    ) end
  );

  -- Points in this lesson so far, counting only revealed questions (so the
  -- board does not give away who is right before the teacher explains).
  with totals as (
    select a.student_id, sum(a.points)::integer as points, min(a.submitted_at) as first_at
    from public.live_answers a
    join public.live_questions lq on lq.id = a.live_question_id
    where a.session_id = v_session.id and lq.revealed_at is not null
    group by a.student_id
  ),
  ranked as (
    select t.*, rank() over (order by t.points desc) as place,
      row_number() over (order by t.points desc, t.first_at) as row_no
    from totals t
    where t.points > 0
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'place', r.place,
      'name', split_part(btrim(s.full_name), ' ', 1),
      'points', r.points,
      'me', r.student_id = p_student_id
    ) order by r.row_no) filter (where r.row_no <= v_top), '[]'::jsonb),
    max(r.points) filter (where r.student_id = p_student_id),
    max(r.place) filter (where r.student_id = p_student_id)
  into v_board, v_my_points, v_my_rank
  from ranked r
  join public.students s on s.id = r.student_id;

  return v_result || jsonb_build_object(
    'leaderboard', case when v_top > 0 then v_board else '[]'::jsonb end,
    'my_points', coalesce(v_my_points, 0),
    'my_place', v_my_rank
  );
end;
$$;

revoke all on function public.submit_live_answer(bigint, bigint, jsonb) from public, anon;
revoke all on function public.portal_live_state(bigint) from public, anon;
grant execute on function public.submit_live_answer(bigint, bigint, jsonb) to authenticated;
grant execute on function public.portal_live_state(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Screenshots of work: <session id>/<student id>/<file>, private

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('live-answers', 'live-answers', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- The session and student a file path belongs to (null when it is not one).
create or replace function public.live_answer_file_owner(p_name text, out session_id bigint, out student_id bigint)
language sql
immutable
set search_path = public
as $$
  select
    case when split_part(p_name, '/', 1) ~ '^[0-9]{1,18}$' then split_part(p_name, '/', 1)::bigint end,
    case when split_part(p_name, '/', 2) ~ '^[0-9]{1,18}$' then split_part(p_name, '/', 2)::bigint end;
$$;

-- An app login may add a picture for its child while a screenshot question is open.
create or replace function public.portal_may_upload_live_answer(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.live_answer_file_owner(p_name) f
    join public.live_questions lq on lq.session_id = f.session_id
    where lq.status = 'live' and lq.kind = 'screenshot' and timezone('utc', now()) <= lq.closes_at
      and public.portal_may_act_for(f.student_id)
      and public.is_class_session_student(f.session_id, f.student_id)
  );
$$;

create or replace function public.may_read_live_answer_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.live_answer_file_owner(p_name) f
    where f.session_id is not null and f.student_id is not null
      and (public.can_see_class_session(f.session_id) or public.portal_may_act_for(f.student_id))
  );
$$;

revoke all on function public.portal_may_upload_live_answer(text) from public, anon;
revoke all on function public.may_read_live_answer_file(text) from public, anon;
grant execute on function public.portal_may_upload_live_answer(text) to authenticated;
grant execute on function public.may_read_live_answer_file(text) to authenticated;

create policy "live_answers_files_insert_family"
on storage.objects
for insert to authenticated
with check (bucket_id = 'live-answers' and (select public.portal_may_upload_live_answer(name)));

create policy "live_answers_files_select_scoped"
on storage.objects
for select to authenticated
using (bucket_id = 'live-answers' and (select public.may_read_live_answer_file(name)));

-- ---------------------------------------------------------------------------
-- Real time: the app hears a new question, the teacher hears new answers.
-- What each login receives is still decided by the policies above.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['live_questions', 'live_answers'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
