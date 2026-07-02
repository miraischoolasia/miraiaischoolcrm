-- Phase 6 teacher listing and creation

create or replace function public.create_teacher_record(
  p_username text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_role text default 'teacher'
)
returns table (
  teacher_id bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_id bigint;
  v_role text := coalesce(nullif(trim(p_role), ''), 'teacher');
begin
  if coalesce(trim(p_username), '') = '' then
    raise exception 'Username is required.';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Teacher full name is required.';
  end if;

  if v_role not in ('admin', 'teacher') then
    raise exception 'Teacher role must be admin or teacher.';
  end if;

  insert into public.teachers (
    username,
    full_name,
    email,
    phone,
    role,
    is_active
  )
  values (
    trim(p_username),
    trim(p_full_name),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    v_role,
    true
  )
  returning id into v_teacher_id;

  return query
  select v_teacher_id;
end;
$$;
