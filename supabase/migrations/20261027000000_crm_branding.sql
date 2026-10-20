-- The school's own look in the CRM, set by an admin on Class Settings > Brand
-- (white-label): its name, logo, tab icon, main colour, the darker colour used
-- for words, and one mascot picture with an on/off switch. Kept in
-- app_settings 'crm_branding':
--   name                 shown on the sign-in page, the menu, the tab and reports
--   logo_url             a picture in the brand-assets bucket ('' = the name in words)
--   favicon_url          the tab icon ('' = the logo)
--   primary              '#rrggbb', buttons and highlights
--   primary_dark         '#rrggbb', coloured words on white
--   mascot_on            whether the mascot shows at all
--   mascot_url           the one mascot picture, used everywhere a mascot shows
--   student_app_follows  the student app takes this name and colour (default yes)
-- A school that never saves here keeps exactly the look its deployment has
-- today (the VITE_BRAND_* settings, else Mirai's).
--
-- Only an admin may change it. The sign-in page reads it before anyone signs
-- in, so crm_branding() is open to anon and returns these fields only.

-- ---------------------------------------------------------------------------
-- Pictures: a public bucket (the sign-in page and public forms show them to
-- people who are not signed in). SVG is left out on purpose: an SVG opened on
-- its own address can run scripts.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-assets',
  'brand-assets',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "brand_assets_insert_admin"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'brand-assets' and public.is_admin());

create policy "brand_assets_update_admin"
on storage.objects
for update
to authenticated
using (bucket_id = 'brand-assets' and public.is_admin())
with check (bucket_id = 'brand-assets' and public.is_admin());

create policy "brand_assets_delete_admin"
on storage.objects
for delete
to authenticated
using (bucket_id = 'brand-assets' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Saving (admin only). Every field is optional; '' means "not set", which
-- falls back to the deployment's own look.

create or replace function public.set_crm_branding(p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_picture constant text := '^https://[A-Za-z0-9.-]+/storage/v1/object/public/brand-assets/[A-Za-z0-9._-]+$';
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the brand settings.';
  end if;
  if jsonb_typeof(p_settings) <> 'object'
    or exists (
      select 1 from jsonb_object_keys(p_settings) k
      where k not in ('name', 'logo_url', 'favicon_url', 'primary', 'primary_dark', 'mascot_on', 'mascot_url', 'student_app_follows')
    )
    or char_length(coalesce(p_settings ->> 'name', '')) > 60
    or (p_settings ? 'mascot_on' and jsonb_typeof(p_settings -> 'mascot_on') <> 'boolean')
    or (p_settings ? 'student_app_follows' and jsonb_typeof(p_settings -> 'student_app_follows') <> 'boolean') then
    raise exception 'Brand settings are not valid.';
  end if;
  foreach v_key in array array['name', 'logo_url', 'favicon_url', 'primary', 'primary_dark', 'mascot_url']
  loop
    if p_settings ? v_key and jsonb_typeof(p_settings -> v_key) <> 'string' then
      raise exception 'Brand settings are not valid.';
    end if;
  end loop;
  foreach v_key in array array['primary', 'primary_dark']
  loop
    if coalesce(p_settings ->> v_key, '') <> '' and (p_settings ->> v_key) !~ '^#[0-9a-fA-F]{6}$' then
      raise exception 'Brand colours must look like #fc0c97.';
    end if;
  end loop;
  foreach v_key in array array['logo_url', 'favicon_url', 'mascot_url']
  loop
    if coalesce(p_settings ->> v_key, '') <> '' and (p_settings ->> v_key) !~ v_picture then
      raise exception 'Brand pictures must be uploaded on the Brand page.';
    end if;
  end loop;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('crm_branding', p_settings, timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_crm_branding(jsonb) from public, anon;
grant execute on function public.set_crm_branding(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading: the sign-in page needs it before anyone signs in. '{}' when no
-- admin has saved anything yet.

create or replace function public.crm_branding()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_strip_nulls(jsonb_build_object(
        'name', value -> 'name',
        'logo_url', value -> 'logo_url',
        'favicon_url', value -> 'favicon_url',
        'primary', value -> 'primary',
        'primary_dark', value -> 'primary_dark',
        'mascot_on', value -> 'mascot_on',
        'mascot_url', value -> 'mascot_url',
        'student_app_follows', value -> 'student_app_follows'
      ))
      from public.app_settings where key = 'crm_branding'
    ),
    '{}'::jsonb
  );
$$;

revoke all on function public.crm_branding() from public;
grant execute on function public.crm_branding() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The student app: unless the admin unticks "The student app uses the same
-- name and colour", its sign-in page and home take the CRM's name and colour
-- (each only when set; otherwise the student app's own setting as before).
-- Same fields as 20261026100000_student_home_style.sql, which this replaces.

create or replace function public.portal_branding()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with portal as (
    select coalesce((select value from public.app_settings where key = 'student_portal'), '{}'::jsonb) as value
  ),
  crm as (
    select coalesce((select value from public.app_settings where key = 'crm_branding'), '{}'::jsonb) as value
  ),
  follows as (
    select coalesce((crm.value ->> 'student_app_follows')::boolean, true) as yes, crm.value from crm
  )
  select jsonb_build_object(
    'school_name', coalesce(
      case when follows.yes then nullif(follows.value ->> 'name', '') end,
      portal.value ->> 'school_name',
      ''
    ),
    'accent_color', coalesce(
      case when follows.yes then nullif(follows.value ->> 'primary', '') end,
      portal.value ->> 'accent_color',
      '#fc0c97'
    ),
    'home_style', coalesce(portal.value ->> 'home_style', 'classic'),
    'home_theme', coalesce(portal.value ->> 'home_theme', ''),
    'level_points', coalesce((portal.value ->> 'level_points')::integer, 50),
    'support_whatsapp', coalesce(portal.value ->> 'support_whatsapp', '')
  )
  from portal, follows;
$$;

revoke all on function public.portal_branding() from public;
grant execute on function public.portal_branding() to anon, authenticated;
