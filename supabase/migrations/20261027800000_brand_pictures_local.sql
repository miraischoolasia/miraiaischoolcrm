-- Class Settings > Brand: pictures uploaded on this computer's test database
-- (local-test/, http://127.0.0.1:<port>) could not be saved, because
-- set_crm_branding only took https addresses. It now also takes plain http on
-- 127.0.0.1 or localhost, which only a database on the same computer gives
-- out; any other address must still be https and in the brand-assets bucket.
-- Everything else is exactly as in 20261027000000_crm_branding.sql.

create or replace function public.set_crm_branding(p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_picture constant text := '^(https://[A-Za-z0-9.-]+|http://(127\.0\.0\.1|localhost)(:[0-9]+)?)/storage/v1/object/public/brand-assets/[A-Za-z0-9._-]+$';
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
