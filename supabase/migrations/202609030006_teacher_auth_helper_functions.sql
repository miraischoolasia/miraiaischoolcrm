-- Real-auth foundation: helper functions that let RLS policies and
-- security-definer RPCs resolve "who is calling" from auth.uid(), plus a
-- case-insensitive uniqueness guarantee on teacher usernames (needed once
-- usernames become login identifiers).

create or replace function public.current_teacher_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.teachers
  where auth_user_id = auth.uid()
    and is_active = true
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.teachers
    where auth_user_id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$$;

-- Supabase grants EXECUTE on new public-schema functions to `anon` and
-- `authenticated` directly via its own default-privilege setup, separate
-- from the PUBLIC pseudo-role -- `revoke ... from public` alone does not
-- remove anon's access, so anon must be revoked explicitly too.
revoke all on function public.current_teacher_id() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.current_teacher_id() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Case-insensitive username uniqueness: usernames become the login
-- identifier, so "Luna" and "luna" must not be able to coexist.
create unique index if not exists teachers_username_lower_key
on public.teachers (lower(username));
