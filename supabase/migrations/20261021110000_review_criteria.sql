-- Review criteria each school sets itself (phase 1 of the classroom plan).
--
-- Until now a present student's review had five fixed scores (logical
-- thinking, coding creativity, problem solving, expressiveness, sustained
-- focus) as columns on lesson_log_student_reviews. Every school (white-label)
-- now keeps its own list in review_criteria: a name, a top score, the score
-- at or below which a remark is required, an order, and on/off (never
-- deleted, like lead Sources, so old reviews keep their meaning).
-- Scores live one row per criterion in lesson_review_scores.
--
-- This step changes nothing the teacher sees: the five current criteria are
-- seeded with a legacy_key, every existing review is copied in, and a trigger
-- copies each new review the attendance form saves. The attendance form moves
-- to review_criteria in the next step; the old columns stay until then.

create table public.review_criteria (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text check (description is null or char_length(description) <= 300),
  max_score smallint not null default 5 check (max_score between 2 and 10),
  -- A score at or below this needs a remark (0 = never required).
  remark_required_at_or_below smallint not null default 2,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  -- Set only on the five criteria that came from the old columns.
  legacy_key text unique check (
    legacy_key in ('logical_thinking', 'coding_creativity', 'problem_solving', 'expressiveness', 'sustained_focus')
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (remark_required_at_or_below between 0 and max_score - 1)
);

create unique index review_criteria_active_name_idx
  on public.review_criteria (lower(btrim(name)))
  where is_active;

create trigger set_review_criteria_updated_at
  before update on public.review_criteria
  for each row execute function public.set_current_timestamp_updated_at();

insert into public.review_criteria (name, max_score, remark_required_at_or_below, sort_order, legacy_key) values
  ('Logical Thinking', 5, 2, 10, 'logical_thinking'),
  ('Coding Creativity', 5, 2, 20, 'coding_creativity'),
  ('Problem Solving', 5, 2, 30, 'problem_solving'),
  ('Expressiveness', 5, 2, 40, 'expressiveness'),
  ('Sustained Focus', 5, 2, 50, 'sustained_focus');

create table public.lesson_review_scores (
  id bigint generated always as identity primary key,
  lesson_log_id bigint not null references public.lesson_logs (id) on delete restrict,
  student_id bigint not null references public.students (id) on delete restrict,
  criterion_id bigint not null references public.review_criteria (id) on delete restrict,
  score smallint not null check (score >= 1),
  remark text check (remark is null or char_length(remark) <= 2000),
  created_at timestamptz not null default timezone('utc', now()),
  unique (lesson_log_id, student_id, criterion_id)
);

create index lesson_review_scores_student_idx on public.lesson_review_scores (student_id, criterion_id);

-- A score never goes above its criterion's top score.
create or replace function public.check_review_score_range()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_max smallint;
begin
  select max_score into v_max from public.review_criteria where id = new.criterion_id;
  if new.score > v_max then
    raise exception 'Score % is above the top score % for this criterion.', new.score, v_max;
  end if;
  return new;
end;
$$;

create trigger lesson_review_scores_range
  before insert or update on public.lesson_review_scores
  for each row execute function public.check_review_score_range();

-- The top score can only change while nobody has been scored on it yet.
create or replace function public.guard_review_criterion_scale()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.max_score <> old.max_score and (
    old.legacy_key is not null
    or exists (select 1 from public.lesson_review_scores s where s.criterion_id = old.id)
  ) then
    raise exception 'The top score cannot change once students have been scored on this criterion.';
  end if;
  if new.legacy_key is distinct from old.legacy_key then
    raise exception 'legacy_key cannot change.';
  end if;
  return new;
end;
$$;

create trigger review_criteria_guard_scale
  before update on public.review_criteria
  for each row execute function public.guard_review_criterion_scale();

-- Copy the five old columns of a review into lesson_review_scores.
create or replace function public.copy_legacy_review_scores()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.lesson_review_scores (lesson_log_id, student_id, criterion_id, score, remark)
  select new.lesson_log_id, new.student_id, c.id, v.score, v.remark
  from (values
    ('logical_thinking', new.logical_thinking_score, new.logical_thinking_remark),
    ('coding_creativity', new.coding_creativity_score, new.coding_creativity_remark),
    ('problem_solving', new.problem_solving_score, new.problem_solving_remark),
    ('expressiveness', new.expressiveness_score, new.expressiveness_remark),
    ('sustained_focus', new.sustained_focus_score, new.sustained_focus_remark)
  ) as v(legacy_key, score, remark)
  join public.review_criteria c on c.legacy_key = v.legacy_key
  where v.score is not null
  on conflict (lesson_log_id, student_id, criterion_id) do nothing;
  return new;
end;
$$;

create trigger lesson_log_student_reviews_copy_scores
  after insert on public.lesson_log_student_reviews
  for each row execute function public.copy_legacy_review_scores();

-- Existing reviews.
insert into public.lesson_review_scores (lesson_log_id, student_id, criterion_id, score, remark, created_at)
select r.lesson_log_id, r.student_id, c.id, v.score, v.remark, r.created_at
from public.lesson_log_student_reviews r
cross join lateral (values
  ('logical_thinking', r.logical_thinking_score, r.logical_thinking_remark),
  ('coding_creativity', r.coding_creativity_score, r.coding_creativity_remark),
  ('problem_solving', r.problem_solving_score, r.problem_solving_remark),
  ('expressiveness', r.expressiveness_score, r.expressiveness_remark),
  ('sustained_focus', r.sustained_focus_score, r.sustained_focus_remark)
) as v(legacy_key, score, remark)
join public.review_criteria c on c.legacy_key = v.legacy_key
where v.score is not null
on conflict (lesson_log_id, student_id, criterion_id) do nothing;

-- ---------------------------------------------------------------------------
-- Who can read and change

alter table public.review_criteria enable row level security;
alter table public.lesson_review_scores enable row level security;

revoke all on public.review_criteria from public, anon, authenticated;
revoke all on public.lesson_review_scores from public, anon, authenticated;
grant select on public.review_criteria to authenticated;
grant select on public.lesson_review_scores to authenticated;
grant all on public.review_criteria to service_role;
grant all on public.lesson_review_scores to service_role;

-- Any staff account (teachers fill reviews in; students will see their
-- report later, through its own rule).
create policy review_criteria_select_staff
  on public.review_criteria
  for select to authenticated
  using ((select public.current_teacher_id()) is not null);

-- Same as lesson_log_student_reviews.
create policy lesson_review_scores_select_scoped
  on public.lesson_review_scores
  for select to authenticated
  using (
    (select public.can_view_classes())
    or exists (
      select 1 from public.lesson_logs l
      where l.id = lesson_review_scores.lesson_log_id
        and l.teacher_id = (select public.current_teacher_id())
    )
  );

-- Add (p_id null) or change a criterion. Admin only.
create or replace function public.save_review_criterion(
  p_id bigint,
  p_name text,
  p_description text,
  p_max_score smallint,
  p_remark_required_at_or_below smallint,
  p_sort_order integer,
  p_is_active boolean
)
returns public.review_criteria
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.review_criteria%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admin can change review criteria.';
  end if;

  if p_id is null then
    insert into public.review_criteria (name, description, max_score, remark_required_at_or_below, sort_order, is_active)
    values (
      btrim(p_name),
      nullif(btrim(coalesce(p_description, '')), ''),
      coalesce(p_max_score, 5),
      coalesce(p_remark_required_at_or_below, 0),
      coalesce(p_sort_order, (select coalesce(max(sort_order), 0) + 10 from public.review_criteria)),
      coalesce(p_is_active, true)
    )
    returning * into v_row;
  else
    update public.review_criteria
    set name = btrim(p_name),
        description = nullif(btrim(coalesce(p_description, '')), ''),
        max_score = coalesce(p_max_score, max_score),
        remark_required_at_or_below = coalesce(p_remark_required_at_or_below, remark_required_at_or_below),
        sort_order = coalesce(p_sort_order, sort_order),
        is_active = coalesce(p_is_active, is_active)
    where id = p_id
    returning * into v_row;

    if v_row.id is null then
      raise exception 'Review criterion not found.';
    end if;
  end if;

  perform public.record_admin_activity(
    case when p_id is null then 'review_criterion_added' else 'review_criterion_changed' end,
    'classroom', null, 'Review criterion: ' || v_row.name, to_jsonb(v_row)
  );

  return v_row;
end;
$$;

revoke all on function public.save_review_criterion(bigint, text, text, smallint, smallint, integer, boolean) from public, anon;
grant execute on function public.save_review_criterion(bigint, text, text, smallint, smallint, integer, boolean) to authenticated;
