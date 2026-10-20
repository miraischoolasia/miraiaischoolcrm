-- Four more things on a student (EduHero's master list, boss 2026-10-20):
--
-- 1. students.name_zh: the child's Chinese name.
-- 2. students.student_kind: new / renewing / returning student. The choices are the
--    school's own list (student_kinds, like class levels): added, renamed, ordered
--    and hidden in Class Settings; renaming one renames it on every student. Seeded
--    with 新生 / 续报 / 回流生; a school that does not use them hides them.
-- 3. students.consultant_id: the staff member who looks after the family (EduHero's
--    "负责顾问"), picked from My Team.
-- 4. students.second_parent_phone: a second parent's number.
--
-- Read and written like the rest of the student (the students policies).
--
-- Each school picks which of the four it shows (app_settings 'student_fields',
-- Class Settings > Student fields); all off unless switched on (Mirai).

create table public.student_kinds (
  name text primary key check (char_length(btrim(name)) between 1 and 40 and name = btrim(name)),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger set_student_kinds_updated_at
  before update on public.student_kinds
  for each row execute function public.set_current_timestamp_updated_at();

insert into public.student_kinds (name, sort_order) values
  ('新生', 10),
  ('续报', 20),
  ('回流生', 30);

alter table public.students
  add column if not exists name_zh text
    check (name_zh is null or char_length(btrim(name_zh)) between 1 and 60),
  add column if not exists student_kind text
    references public.student_kinds (name) on update cascade,
  add column if not exists consultant_id bigint
    references public.teachers (id) on delete set null,
  add column if not exists second_parent_phone text
    check (second_parent_phone is null or char_length(btrim(second_parent_phone)) between 6 and 30);

create index if not exists students_consultant_idx on public.students (consultant_id) where consultant_id is not null;

alter table public.student_kinds enable row level security;
revoke all on public.student_kinds from public, anon, authenticated;
grant select on public.student_kinds to authenticated;
grant all on public.student_kinds to service_role;

create policy student_kinds_select_staff
  on public.student_kinds for select to authenticated
  using ((select public.current_teacher_id()) is not null);

-- Add (p_name null) or change one (p_name = its current name). Admin only.
create or replace function public.save_student_kind(p_name text, p_new_name text, p_sort_order integer, p_is_active boolean)
returns public.student_kinds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.student_kinds%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the kinds of student.';
  end if;

  if p_name is null then
    insert into public.student_kinds (name, sort_order, is_active)
    values (
      btrim(p_new_name),
      coalesce(p_sort_order, (select coalesce(max(sort_order), 0) + 10 from public.student_kinds)),
      coalesce(p_is_active, true)
    )
    returning * into v_row;
  else
    update public.student_kinds
    set name = coalesce(nullif(btrim(p_new_name), ''), name),
        sort_order = coalesce(p_sort_order, sort_order),
        is_active = coalesce(p_is_active, is_active)
    where name = p_name
    returning * into v_row;
    if v_row.name is null then
      raise exception 'Kind of student not found.';
    end if;
  end if;
  return v_row;
exception
  when unique_violation then
    raise exception '"%" is already a kind of student.', btrim(p_new_name);
end;
$$;

revoke all on function public.save_student_kind(text, text, integer, boolean) from public, anon;
grant execute on function public.save_student_kind(text, text, integer, boolean) to authenticated;

-- The consultant is a staff member or admin of the school, never a teacher-only login.
create or replace function public.ensure_student_consultant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.consultant_id is not null and new.consultant_id is distinct from (case when tg_op = 'UPDATE' then old.consultant_id end)
     and not exists (select 1 from public.teachers t where t.id = new.consultant_id and t.role in ('staff', 'admin') and t.is_active) then
    raise exception 'The consultant must be an active staff member.';
  end if;
  return new;
end;
$$;

revoke all on function public.ensure_student_consultant() from public, anon, authenticated;

create trigger students_ensure_consultant
  before insert or update of consultant_id on public.students
  for each row execute function public.ensure_student_consultant();

-- Which of the four fields the school shows: all off unless switched on.
insert into public.app_settings (key, value)
values ('student_fields', '{"name_zh": false, "student_kind": false, "consultant": false, "second_parent_phone": false}'::jsonb)
on conflict (key) do nothing;

create or replace function public.set_student_fields(p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admin can choose which student fields are shown.';
  end if;

  v_value := jsonb_build_object(
    'name_zh', coalesce((p_value ->> 'name_zh')::boolean, false),
    'student_kind', coalesce((p_value ->> 'student_kind')::boolean, false),
    'consultant', coalesce((p_value ->> 'consultant')::boolean, false),
    'second_parent_phone', coalesce((p_value ->> 'second_parent_phone')::boolean, false)
  );

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('student_fields', v_value, timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  perform public.record_admin_activity('student_fields_changed', 'student', null, 'Student fields', v_value);
end;
$$;

revoke all on function public.set_student_fields(jsonb) from public, anon;
grant execute on function public.set_student_fields(jsonb) to authenticated;
