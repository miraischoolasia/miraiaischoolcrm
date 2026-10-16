-- Class levels each school keeps itself (white-label), the same way as age
-- groups (20261021180000_question_subjects_ages.sql).
--
-- program_levels: the levels a class can be (Mirai: Coder Foundation, Coder
--   Pro, ...; a tuition centre: Standard 1, Form 4, ...). Seeded with the six
--   the CRM always had, plus any level a class already uses.
-- classrooms.program_level now points at this list instead of a fixed one;
-- renaming a level renames it on every class. Hidden instead of deleted.

create table public.program_levels (
  name text primary key check (char_length(btrim(name)) between 1 and 40 and name = btrim(name)),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger set_program_levels_updated_at
  before update on public.program_levels
  for each row execute function public.set_current_timestamp_updated_at();

insert into public.program_levels (name, sort_order) values
  ('Coder Foundation', 10),
  ('Coder Pro', 20),
  ('VibeTech Innovator', 30),
  ('VibeTech Pro', 40),
  ('VibeTech Future', 50),
  ('Software Engineer', 60);

insert into public.program_levels (name, sort_order)
select distinct c.program_level, 100 from public.classrooms c
where not exists (select 1 from public.program_levels l where l.name = c.program_level);

alter table public.classrooms drop constraint if exists classrooms_program_level_check;
alter table public.classrooms
  add constraint classrooms_program_level_fkey
  foreign key (program_level) references public.program_levels (name) on update cascade;

alter table public.program_levels enable row level security;
revoke all on public.program_levels from public, anon, authenticated;
grant select on public.program_levels to authenticated;
grant all on public.program_levels to service_role;

create policy program_levels_select_staff
  on public.program_levels for select to authenticated
  using ((select public.current_teacher_id()) is not null);

-- Add (p_name null) or change one (p_name = its current name). Admin only.
create or replace function public.save_program_level(p_name text, p_new_name text, p_sort_order integer, p_is_active boolean)
returns public.program_levels
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.program_levels%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admin can change class levels.';
  end if;

  if p_name is null then
    insert into public.program_levels (name, sort_order, is_active)
    values (
      btrim(p_new_name),
      coalesce(p_sort_order, (select coalesce(max(sort_order), 0) + 10 from public.program_levels)),
      coalesce(p_is_active, true)
    )
    returning * into v_row;
  else
    update public.program_levels
    set name = coalesce(nullif(btrim(p_new_name), ''), name),
        sort_order = coalesce(p_sort_order, sort_order),
        is_active = coalesce(p_is_active, is_active)
    where name = p_name
    returning * into v_row;
    if v_row.name is null then
      raise exception 'Class level not found.';
    end if;
  end if;
  return v_row;
exception
  when unique_violation then
    raise exception '"%" is already a class level.', btrim(p_new_name);
end;
$$;

revoke all on function public.save_program_level(text, text, integer, boolean) from public, anon;
grant execute on function public.save_program_level(text, text, integer, boolean) to authenticated;
