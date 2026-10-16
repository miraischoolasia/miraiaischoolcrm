-- Questions by subject and age (after 20261021160000_question_bank.sql), so
-- the system knows which questions fit which class. Both lists belong to the
-- school (white-label): an admin adds, renames, orders and hides them.
--
-- subjects: Coding, AI, Maths, English, ...; hidden instead of deleted.
-- age_groups: the age groups classes are sorted by. Seeded with the four the
--   CRM always had ('6-8 Years Old', ...). classrooms.age_group now points at
--   this list instead of a fixed one; renaming a group renames it on every
--   class and question.
-- questions.subject_id: the question's subject (empty = any subject).
-- questions.age_groups: the groups it suits (empty = every age).
-- classrooms.subject_id: what the class studies. A class then finds the
--   questions of its subject (or with none) that suit its age group.

create table public.age_groups (
  name text primary key check (char_length(btrim(name)) between 1 and 40 and name = btrim(name)),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger set_age_groups_updated_at
  before update on public.age_groups
  for each row execute function public.set_current_timestamp_updated_at();

insert into public.age_groups (name, sort_order) values
  ('6-8 Years Old', 10),
  ('9-11 Years Old', 20),
  ('12-14 Years Old', 30),
  ('15-17 Years Old', 40);

-- Any age group a class already uses stays valid.
insert into public.age_groups (name, sort_order)
select distinct c.age_group, 100 from public.classrooms c
where not exists (select 1 from public.age_groups g where g.name = c.age_group);

alter table public.classrooms drop constraint if exists classrooms_age_group_check;
alter table public.classrooms
  add constraint classrooms_age_group_fkey
  foreign key (age_group) references public.age_groups (name) on update cascade;

alter table public.age_groups enable row level security;
revoke all on public.age_groups from public, anon, authenticated;
grant select on public.age_groups to authenticated;
grant all on public.age_groups to service_role;

create policy age_groups_select_staff
  on public.age_groups for select to authenticated
  using ((select public.current_teacher_id()) is not null);

-- Add (p_name null) or change one (p_name = its current name). Admin only.
create or replace function public.save_age_group(p_name text, p_new_name text, p_sort_order integer, p_is_active boolean)
returns public.age_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.age_groups%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admin can change age groups.';
  end if;

  if p_name is null then
    insert into public.age_groups (name, sort_order, is_active)
    values (
      btrim(p_new_name),
      coalesce(p_sort_order, (select coalesce(max(sort_order), 0) + 10 from public.age_groups)),
      coalesce(p_is_active, true)
    )
    returning * into v_row;
  else
    update public.age_groups
    set name = coalesce(nullif(btrim(p_new_name), ''), name),
        sort_order = coalesce(p_sort_order, sort_order),
        is_active = coalesce(p_is_active, is_active)
    where name = p_name
    returning * into v_row;
    if v_row.name is null then
      raise exception 'Age group not found.';
    end if;
  end if;
  return v_row;
exception
  when unique_violation then
    raise exception '"%" is already an age group.', btrim(p_new_name);
end;
$$;

revoke all on function public.save_age_group(text, text, integer, boolean) from public, anon;
grant execute on function public.save_age_group(text, text, integer, boolean) to authenticated;

create table public.subjects (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index subjects_active_name_idx on public.subjects (lower(btrim(name))) where is_active;

create trigger set_subjects_updated_at
  before update on public.subjects
  for each row execute function public.set_current_timestamp_updated_at();

alter table public.subjects enable row level security;
revoke all on public.subjects from public, anon, authenticated;
grant select on public.subjects to authenticated;
grant all on public.subjects to service_role;

create policy subjects_select_staff
  on public.subjects for select to authenticated
  using ((select public.current_teacher_id()) is not null);

create or replace function public.save_subject(p_id bigint, p_name text, p_sort_order integer, p_is_active boolean)
returns public.subjects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.subjects%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admin can change subjects.';
  end if;

  if p_id is null then
    insert into public.subjects (name, sort_order, is_active)
    values (
      btrim(p_name),
      coalesce(p_sort_order, (select coalesce(max(sort_order), 0) + 10 from public.subjects)),
      coalesce(p_is_active, true)
    )
    returning * into v_row;
  else
    update public.subjects
    set name = coalesce(btrim(p_name), name),
        sort_order = coalesce(p_sort_order, sort_order),
        is_active = coalesce(p_is_active, is_active)
    where id = p_id
    returning * into v_row;
    if v_row.id is null then
      raise exception 'Subject not found.';
    end if;
  end if;
  return v_row;
end;
$$;

revoke all on function public.save_subject(bigint, text, integer, boolean) from public, anon;
grant execute on function public.save_subject(bigint, text, integer, boolean) to authenticated;

alter table public.questions
  add column subject_id bigint references public.subjects (id) on delete set null,
  add column age_groups text[] not null default '{}';

-- A renamed age group is renamed in the questions too (classes follow by the
-- foreign key).
create or replace function public.rename_age_group_in_questions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name <> old.name then
    update public.questions
    set age_groups = array_replace(age_groups, old.name, new.name)
    where old.name = any (age_groups);
  end if;
  return new;
end;
$$;

revoke all on function public.rename_age_group_in_questions() from public, anon, authenticated;

create trigger age_groups_rename_in_questions
  after update of name on public.age_groups
  for each row execute function public.rename_age_group_in_questions();

create index questions_subject_idx on public.questions (subject_id) where not is_archived;

alter table public.classrooms
  add column subject_id bigint references public.subjects (id) on delete set null;

-- Does this question suit that class (same subject or none; its age group or
-- every age)?
create or replace function public.question_fits_classroom(p_question_id bigint, p_classroom_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.questions q
    join public.classrooms c on c.id = p_classroom_id
    where q.id = p_question_id
      and (q.subject_id is null or c.subject_id is null or q.subject_id = c.subject_id)
      and (cardinality(q.age_groups) = 0 or c.age_group = any (q.age_groups))
  );
$$;

revoke all on function public.question_fits_classroom(bigint, bigint) from public, anon;
grant execute on function public.question_fits_classroom(bigint, bigint) to authenticated;

-- save_question also takes subject_id and age_groups. Everything else is
-- unchanged from 20261021160000_question_bank.sql.
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
  v_subject_id bigint := nullif(p_question ->> 'subject_id', '')::bigint;
  v_ages text[];
  v_problem text;
begin
  if v_teacher_id is null then
    raise exception 'Only staff can keep questions.';
  end if;

  v_problem := public.question_problem(v_kind, v_options, v_accepted);
  if v_problem is not null then
    raise exception '%', v_problem;
  end if;

  if jsonb_typeof(coalesce(p_question -> 'age_groups', '[]'::jsonb)) <> 'array' then
    raise exception 'Age groups must be a list.';
  end if;
  select coalesce(array_agg(distinct value order by value), '{}')
  into v_ages
  from jsonb_array_elements_text(coalesce(p_question -> 'age_groups', '[]'::jsonb));

  if exists (
    select 1 from unnest(v_ages) a
    where not exists (select 1 from public.age_groups g where g.name = a)
  ) then
    raise exception 'Unknown age group (an admin keeps the list in Class Settings).';
  end if;

  if v_subject_id is not null and not exists (select 1 from public.subjects where id = v_subject_id) then
    raise exception 'Subject not found.';
  end if;

  if p_id is null then
    insert into public.questions (
      owner_id, is_shared, kind, prompt, options, accepted_answers, case_sensitive,
      points, time_limit_seconds, topic, explanation, subject_id, age_groups
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
      nullif(btrim(coalesce(p_question ->> 'explanation', '')), ''),
      v_subject_id,
      v_ages
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
        explanation = nullif(btrim(coalesce(p_question ->> 'explanation', '')), ''),
        subject_id = v_subject_id,
        age_groups = v_ages
    where id = p_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.save_question(bigint, jsonb) from public, anon;
grant execute on function public.save_question(bigint, jsonb) to authenticated;
