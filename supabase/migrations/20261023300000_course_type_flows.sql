-- Enrolment flows (programmes) belong to classes. A class level / course type
-- (program_levels: 常规班, 备战班, ... or Mirai's levels) can name the flow its
-- classes use; a class that names a flow itself (classrooms.programme_id, as
-- Mirai's HOA classes do) keeps that one. So a school sets the steps once per
-- kind of class instead of building a programme and adding classes to it.

alter table public.program_levels
  add column if not exists programme_id bigint references public.programmes (id) on delete set null;

-- The flow a class's sign-ups follow: its own, else its level's.
create or replace function public.classroom_enrol_flow(p_classroom_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(c.programme_id, l.programme_id)
  from public.classrooms c
  left join public.program_levels l on l.name = c.program_level
  where c.id = p_classroom_id;
$$;

revoke all on function public.classroom_enrol_flow(bigint) from public, anon;
grant execute on function public.classroom_enrol_flow(bigint) to authenticated;

-- An admin sets (or clears, with null) the flow of a level's classes.
create or replace function public.set_program_level_flow(p_name text, p_programme_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can change class levels.';
  end if;
  if p_programme_id is not null and not exists (select 1 from public.programmes where id = p_programme_id) then
    raise exception 'Enrolment flow not found.';
  end if;
  update public.program_levels set programme_id = p_programme_id where name = p_name;
  if not found then
    raise exception 'Class level not found.';
  end if;
end;
$$;

revoke all on function public.set_program_level_flow(text, bigint) from public, anon;
grant execute on function public.set_program_level_flow(text, bigint) to authenticated;
