-- Tags on students and parents, the same tags the leads use.
--
-- A tag is one row of lead_options (kind 'tag') in the school's own database, so "the same name is the same
-- tag" for leads, students and parents, and each school keeps its own list.
--
-- * The tags live on the family table (people), one list per person: a parent has their tags, and a student
--   has theirs on the people row tied to the enrolled student (people.student_id). The student list, the
--   student details and the Inbox's Family card all read and write that one place.
-- * A lead that becomes a student hands its tags to that student (every way a lead is converted sets
--   leads.converted_student_id, so one trigger on that column covers them all). Students converted before
--   this stay as they are.
-- * Who may do what follows the Students ticks: view = see the tags, edit = add and take off. The tag names
--   themselves stay readable and addable by whoever has Leads access, and now also by Students access (only
--   rows of kind 'tag').

alter table public.people
  add column if not exists tag_ids bigint[] not null default '{}';

comment on column public.people.tag_ids is
  'lead_options (kind tag) ids; the tags of this parent or student.';

-- Only real tags (the same check a lead's tags get).
create or replace function public.people_check_tags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(array_length(new.tag_ids, 1), 0) > 0 and (
    select count(distinct o.id)
    from public.lead_options o
    where o.kind = 'tag' and o.id = any (new.tag_ids)
  ) <> (select count(distinct t) from unnest(new.tag_ids) t) then
    raise exception 'That is not a tag.';
  end if;
  return new;
end;
$$;

revoke all on function public.people_check_tags() from public, anon, authenticated;

drop trigger if exists people_check_tags on public.people;
create trigger people_check_tags
before insert or update of tag_ids on public.people
for each row execute function public.people_check_tags();

create index if not exists people_tagged_idx on public.people using gin (tag_ids) where tag_ids <> '{}';

-- ---------------------------------------------------------------------------------------------------
-- The tag list for whoever has Students access (lead_options was only readable with Leads access).
-- Same shape as the existing lead_options policies.
-- ---------------------------------------------------------------------------------------------------
drop policy if exists lead_options_tags_select_students on public.lead_options;
create policy lead_options_tags_select_students on public.lead_options
for select to authenticated
using (kind = 'tag' and (select public.has_permission('students')));

drop policy if exists lead_options_tags_insert_students on public.lead_options;
create policy lead_options_tags_insert_students on public.lead_options
for insert to authenticated
with check (kind = 'tag' and (select public.has_permission('students', 'edit')));

-- ---------------------------------------------------------------------------------------------------
-- Setting the tags
-- ---------------------------------------------------------------------------------------------------
create or replace function public.set_student_tags(p_student_id bigint, p_tag_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person bigint;
begin
  if not public.has_permission('students', 'edit') then
    raise exception 'Your account is not allowed to change students.';
  end if;
  if not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'That student is not there.';
  end if;

  select id into v_person from public.people where student_id = p_student_id and kind = 'student' order by id limit 1;
  if v_person is null then
    perform public.sync_people_from_student(p_student_id);
    select id into v_person from public.people where student_id = p_student_id and kind = 'student' order by id limit 1;
  end if;
  if v_person is null then
    raise exception 'That student has no family record yet.';
  end if;

  update public.people
  set tag_ids = coalesce((select array_agg(distinct t order by t) from unnest(coalesce(p_tag_ids, '{}')) t), '{}')
  where id = v_person;
end;
$$;

create or replace function public.set_person_tags(p_person_id bigint, p_tag_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person public.people%rowtype;
begin
  select * into v_person from public.people where id = p_person_id;
  if not found then
    raise exception 'That person is not there.';
  end if;
  -- An enrolled student's tags follow the Students ticks; a parent's follow Leads or Students.
  if v_person.student_id is not null then
    if not public.has_permission('students', 'edit') then
      raise exception 'Your account is not allowed to change students.';
    end if;
  elsif not public.people_can_edit() then
    raise exception 'Not allowed.';
  end if;

  update public.people
  set tag_ids = coalesce((select array_agg(distinct t order by t) from unnest(coalesce(p_tag_ids, '{}')) t), '{}')
  where id = p_person_id;
end;
$$;

revoke all on function public.set_student_tags(bigint, bigint[]) from public, anon;
revoke all on function public.set_person_tags(bigint, bigint[]) from public, anon;
grant execute on function public.set_student_tags(bigint, bigint[]) to authenticated;
grant execute on function public.set_person_tags(bigint, bigint[]) to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- A lead becomes a student: the lead's tags go with it (added to the student's own).
-- ---------------------------------------------------------------------------------------------------
create or replace function public.lead_tags_to_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.converted_student_id is null or coalesce(array_length(new.tag_ids, 1), 0) = 0 then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.converted_student_id is not distinct from new.converted_student_id then
    return null;
  end if;

  perform public.sync_people_from_student(new.converted_student_id);

  update public.people p
  set tag_ids = (select array_agg(distinct t order by t) from unnest(p.tag_ids || new.tag_ids) t)
  where p.student_id = new.converted_student_id
    and p.kind = 'student'
    and not (new.tag_ids <@ p.tag_ids);
  return null;
end;
$$;

revoke all on function public.lead_tags_to_student() from public, anon, authenticated;

drop trigger if exists leads_tags_to_student on public.leads;
create trigger leads_tags_to_student
after insert or update of converted_student_id on public.leads
for each row execute function public.lead_tags_to_student();
