-- The student app's home, per school (white-label): the classic list, or the
-- game lobby on a computer with the school's own picture set (the pictures
-- ship with the app in student-app/public/lobby/<set>/, never in Storage),
-- and how many points make one level (Lv) there. Kept with the other student
-- app settings (app_settings 'student_portal'):
--   home_style    'classic' (default) | 'lobby'
--   home_theme    the picture set, e.g. 'eduhero'
--   level_points  points for one level, 10-1000 (default 50)
--   support_whatsapp  the school's WhatsApp number for families (digits,
--                     country code first), shown as "Contact the school" on
--                     the game sign-in page; empty = not shown
-- Nothing changes for a school until an admin picks the lobby in the CRM.
--
-- Comes after the teams batch (20261026000000-030000) and keeps its check
-- on who may change these settings: has_permission('class_settings', 'edit')
-- (an admin, or an account ticked to edit Class Settings). has_permission is
-- from 20261003000000_account_permissions.sql, so this needs nothing from the
-- teams batch and works whether that batch is pushed or not.

create or replace function public.set_portal_settings(p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer text;
begin
  if not public.has_permission('class_settings', 'edit') then
    raise exception 'Only admin can change the student app settings.';
  end if;
  if jsonb_typeof(p_settings) <> 'object'
    or exists (
      select 1 from jsonb_object_keys(p_settings) k
      where k not in ('school_name', 'accent_color', 'student_sees', 'parent_sees', 'app_url', 'login_message', 'home_style', 'home_theme', 'level_points', 'support_whatsapp')
    )
    or char_length(coalesce(p_settings ->> 'school_name', '')) > 60
    or coalesce(p_settings ->> 'accent_color', '') !~ '^#[0-9a-fA-F]{6}$'
    or (p_settings ? 'app_url' and jsonb_typeof(p_settings -> 'app_url') <> 'string')
    or char_length(coalesce(p_settings ->> 'app_url', '')) > 200
    or (coalesce(p_settings ->> 'app_url', '') <> '' and (p_settings ->> 'app_url') !~ '^https?://[^\s]+$')
    or (p_settings ? 'login_message' and jsonb_typeof(p_settings -> 'login_message') <> 'string')
    or char_length(coalesce(p_settings ->> 'login_message', '')) > 1500
    or (p_settings ? 'home_style' and coalesce(p_settings ->> 'home_style', '') not in ('classic', 'lobby'))
    or (p_settings ? 'home_theme' and coalesce(p_settings ->> 'home_theme', '') !~ '^[a-z0-9-]{1,40}$')
    or (p_settings ? 'level_points' and (
      jsonb_typeof(p_settings -> 'level_points') <> 'number'
      or (p_settings ->> 'level_points') !~ '^[0-9]+$'
      or (p_settings ->> 'level_points')::integer not between 10 and 1000
    ))
    or (p_settings ? 'support_whatsapp' and coalesce(p_settings ->> 'support_whatsapp', '') !~ '^[0-9]{8,15}$') then
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

-- The app reads the home choice before anyone signs in, with the name and
-- colour (and the school's WhatsApp, for the sign-in page's "Contact the school").
create or replace function public.portal_branding()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'school_name', coalesce(value ->> 'school_name', ''),
    'accent_color', coalesce(value ->> 'accent_color', '#fc0c97'),
    'home_style', coalesce(value ->> 'home_style', 'classic'),
    'home_theme', coalesce(value ->> 'home_theme', ''),
    'level_points', coalesce((value ->> 'level_points')::integer, 50),
    'support_whatsapp', coalesce(value ->> 'support_whatsapp', '')
  )
  from public.app_settings where key = 'student_portal';
$$;

revoke all on function public.portal_branding() from public;
grant execute on function public.portal_branding() to anon, authenticated;
