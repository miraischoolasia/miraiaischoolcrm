-- Question bank (phase 3B of the classroom plan). Teachers write and keep the
-- questions they will pop up in class (phase 3C), alone or shared with the
-- whole school.
--
-- kinds:
--   choice     - options [{text, correct}], one or more correct
--   fill       - a word or number; accepted answers [{text, match}]
--   short      - a sentence; accepted answers, else the teacher decides
--   screenshot - the student uploads a picture of their work; teacher decides
--   link       - the student sends a link to their work; teacher decides
-- match (after Oppia's answer rules): 'exact' (same text, spaces and case
-- ignored unless case_sensitive), 'contains' (the answer holds it), 'close'
-- (at most one or two letters off, for spelling). Marking itself runs where
-- the answers come in (3C); the page uses the same rules to try an answer.
--
-- Who: any staff account keeps its own questions; a shared one every staff
-- account can read and copy; its owner and admins change it. Archived instead
-- of deleted, so lessons that used it keep it.

create table public.questions (
  id bigint generated always as identity primary key,
  owner_id bigint not null references public.teachers (id) on delete restrict,
  is_shared boolean not null default false,
  kind text not null check (kind in ('choice', 'fill', 'short', 'screenshot', 'link')),
  prompt text not null check (char_length(btrim(prompt)) between 1 and 2000),
  options jsonb not null default '[]'::jsonb,
  accepted_answers jsonb not null default '[]'::jsonb,
  case_sensitive boolean not null default false,
  points integer not null default 10 check (points between 1 and 100),
  time_limit_seconds integer not null default 60 check (time_limit_seconds between 5 and 1800),
  topic text check (topic is null or char_length(topic) <= 60),
  explanation text check (explanation is null or char_length(explanation) <= 1000),
  is_archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index questions_owner_idx on public.questions (owner_id) where not is_archived;
create index questions_shared_idx on public.questions (is_shared) where is_shared and not is_archived;

create trigger set_questions_updated_at
  before update on public.questions
  for each row execute function public.set_current_timestamp_updated_at();

-- Is this question well formed for its kind? Returns the problem, or null.
create or replace function public.question_problem(
  p_kind text, p_options jsonb, p_accepted jsonb
)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_kind = 'choice' then
    if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) not between 2 and 8 then
      return 'A choice question needs 2 to 8 options.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_options) o
      where jsonb_typeof(o.value) <> 'object'
        or char_length(btrim(coalesce(o.value ->> 'text', ''))) not between 1 and 300
        or jsonb_typeof(o.value -> 'correct') <> 'boolean'
    ) then
      return 'Every option needs its text (up to 300 letters) and whether it is correct.';
    end if;
    if not exists (select 1 from jsonb_array_elements(p_options) o where (o.value ->> 'correct')::boolean) then
      return 'Mark at least one option as correct.';
    end if;
  elsif p_kind in ('fill', 'short') then
    if jsonb_typeof(p_accepted) <> 'array' or jsonb_array_length(p_accepted) > 20 then
      return 'Give up to 20 accepted answers.';
    end if;
    if p_kind = 'fill' and jsonb_array_length(p_accepted) = 0 then
      return 'A fill-in question needs at least one accepted answer.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_accepted) a
      where jsonb_typeof(a.value) <> 'object'
        or char_length(btrim(coalesce(a.value ->> 'text', ''))) not between 1 and 300
        or coalesce(a.value ->> 'match', '') not in ('exact', 'contains', 'close')
    ) then
      return 'Every accepted answer needs its text and how it matches (exact, contains or close).';
    end if;
  end if;
  return null;
end;
$$;

-- Who may change a question: its owner, or an admin.
create or replace function public.can_edit_question(p_owner_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or (p_owner_id is not null and p_owner_id = public.current_teacher_id());
$$;

revoke all on function public.can_edit_question(bigint) from public, anon;
grant execute on function public.can_edit_question(bigint) to authenticated;

-- Add (p_id null) or change a question; p_question is the whole question:
-- {kind, prompt, options, accepted_answers, case_sensitive, points,
--  time_limit_seconds, topic, explanation, is_shared}.
create or replace function public.save_question(p_id bigint, p_question jsonb)
returns public.questions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_id bigint := public.current_teacher_id();
  v_row public.questions%rowtype;
  v_kind text := p_question ->> 'kind';
  v_options jsonb := case when v_kind = 'choice' then coalesce(p_question -> 'options', '[]'::jsonb) else '[]'::jsonb end;
  v_accepted jsonb := case when v_kind in ('fill', 'short') then coalesce(p_question -> 'accepted_answers', '[]'::jsonb) else '[]'::jsonb end;
  v_problem text;
begin
  if v_teacher_id is null then
    raise exception 'Only staff can keep questions.';
  end if;

  v_problem := public.question_problem(v_kind, v_options, v_accepted);
  if v_problem is not null then
    raise exception '%', v_problem;
  end if;

  if p_id is null then
    insert into public.questions (
      owner_id, is_shared, kind, prompt, options, accepted_answers, case_sensitive,
      points, time_limit_seconds, topic, explanation
    )
    values (
      v_teacher_id,
      coalesce((p_question ->> 'is_shared')::boolean, false),
      v_kind,
      btrim(p_question ->> 'prompt'),
      v_options,
      v_accepted,
      coalesce((p_question ->> 'case_sensitive')::boolean, false),
      coalesce((p_question ->> 'points')::int, 10),
      coalesce((p_question ->> 'time_limit_seconds')::int, 60),
      nullif(btrim(coalesce(p_question ->> 'topic', '')), ''),
      nullif(btrim(coalesce(p_question ->> 'explanation', '')), '')
    )
    returning * into v_row;
  else
    select * into v_row from public.questions where id = p_id;
    if not found then
      raise exception 'Question not found.';
    end if;
    if not public.can_edit_question(v_row.owner_id) then
      raise exception 'Only the teacher who wrote this question (or an admin) can change it.';
    end if;

    update public.questions
    set is_shared = coalesce((p_question ->> 'is_shared')::boolean, is_shared),
        kind = v_kind,
        prompt = btrim(p_question ->> 'prompt'),
        options = v_options,
        accepted_answers = v_accepted,
        case_sensitive = coalesce((p_question ->> 'case_sensitive')::boolean, false),
        points = coalesce((p_question ->> 'points')::int, points),
        time_limit_seconds = coalesce((p_question ->> 'time_limit_seconds')::int, time_limit_seconds),
        topic = nullif(btrim(coalesce(p_question ->> 'topic', '')), ''),
        explanation = nullif(btrim(coalesce(p_question ->> 'explanation', '')), '')
    where id = p_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.save_question(bigint, jsonb) from public, anon;
grant execute on function public.save_question(bigint, jsonb) to authenticated;

-- Many questions at once (import). All or nothing: the first bad one stops
-- the import and says which row it is (1 = the first question).
create or replace function public.import_questions(p_questions jsonb, p_share boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_index integer := 0;
begin
  if public.current_teacher_id() is null then
    raise exception 'Only staff can keep questions.';
  end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'Nothing to import.';
  end if;
  if jsonb_array_length(p_questions) > 500 then
    raise exception 'Import at most 500 questions at a time.';
  end if;

  for v_item in select value from jsonb_array_elements(p_questions)
  loop
    v_index := v_index + 1;
    begin
      perform public.save_question(null, v_item || jsonb_build_object('is_shared', coalesce(p_share, false)));
    exception when others then
      raise exception 'Row %: %', v_index, sqlerrm;
    end;
  end loop;

  return v_index;
end;
$$;

revoke all on function public.import_questions(jsonb, boolean) from public, anon;
grant execute on function public.import_questions(jsonb, boolean) to authenticated;

-- Archive or bring back (owner or admin). Sharing goes through save_question.
create or replace function public.set_question_archived(p_id bigint, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner bigint;
begin
  select owner_id into v_owner from public.questions where id = p_id;
  if not found then
    raise exception 'Question not found.';
  end if;
  if not public.can_edit_question(v_owner) then
    raise exception 'Only the teacher who wrote this question (or an admin) can archive it.';
  end if;
  update public.questions set is_archived = coalesce(p_archived, true) where id = p_id;
end;
$$;

revoke all on function public.set_question_archived(bigint, boolean) from public, anon;
grant execute on function public.set_question_archived(bigint, boolean) to authenticated;

-- Copy a question someone shared into your own list, to change it freely.
create or replace function public.copy_question(p_id bigint)
returns public.questions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.questions%rowtype;
begin
  select * into v_row from public.questions where id = p_id;
  if not found or not (v_row.is_shared or public.can_edit_question(v_row.owner_id)) then
    raise exception 'Question not found.';
  end if;
  return public.save_question(null, (to_jsonb(v_row) - 'id' - 'owner_id') || jsonb_build_object('is_shared', false));
end;
$$;

revoke all on function public.copy_question(bigint) from public, anon;
grant execute on function public.copy_question(bigint) to authenticated;

alter table public.questions enable row level security;
revoke all on public.questions from public, anon, authenticated;
grant select on public.questions to authenticated;
grant all on public.questions to service_role;

-- Your own, the shared ones, or all of them as admin. Students (later) never
-- read this table: the answers are in it.
create policy questions_select_staff
  on public.questions for select to authenticated
  using (
    (select public.current_teacher_id()) is not null
    and (
      owner_id = (select public.current_teacher_id())
      or is_shared
      or (select public.is_admin())
    )
  );
