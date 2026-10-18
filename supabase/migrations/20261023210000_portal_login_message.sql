-- The student app's web address and the message a school sends with a new
-- login (WhatsApp), both kept with the other student app settings so every
-- school words its own. Only set_portal_settings changes: it now also takes
-- 'app_url' and 'login_message'.

create or replace function public.set_portal_settings(p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer text;
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the student app settings.';
  end if;
  if jsonb_typeof(p_settings) <> 'object'
    or exists (
      select 1 from jsonb_object_keys(p_settings) k
      where k not in ('school_name', 'accent_color', 'student_sees', 'parent_sees', 'app_url', 'login_message')
    )
    or char_length(coalesce(p_settings ->> 'school_name', '')) > 60
    or coalesce(p_settings ->> 'accent_color', '') !~ '^#[0-9a-fA-F]{6}$'
    or (p_settings ? 'app_url' and jsonb_typeof(p_settings -> 'app_url') <> 'string')
    or char_length(coalesce(p_settings ->> 'app_url', '')) > 200
    or (coalesce(p_settings ->> 'app_url', '') <> '' and (p_settings ->> 'app_url') !~ '^https?://[^\s]+$')
    or (p_settings ? 'login_message' and jsonb_typeof(p_settings -> 'login_message') <> 'string')
    or char_length(coalesce(p_settings ->> 'login_message', '')) > 1500 then
    raise exception 'Student app settings are not valid.';
  end if;
  foreach v_viewer in array array['student_sees', 'parent_sees']
  loop
    if jsonb_typeof(p_settings -> v_viewer) is distinct from 'object'
      or exists (
        select 1 from jsonb_each(p_settings -> v_viewer) e
        where e.key not in ('schedule', 'points', 'scores', 'package', 'report', 'recordings') or jsonb_typeof(e.value) <> 'boolean'
      ) then
      raise exception 'Student app settings are not valid.';
    end if;
  end loop;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('student_portal', p_settings, timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_portal_settings(jsonb) from public, anon;
grant execute on function public.set_portal_settings(jsonb) to authenticated;
