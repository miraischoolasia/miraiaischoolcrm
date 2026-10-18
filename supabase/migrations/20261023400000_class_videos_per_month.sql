-- How many videos a class should have each month (each teacher's lessons;
-- 4 by default), shown as "2/4" beside each month on Class Videos. Kept in
-- app_settings 'class_videos' next to month_access, and changed by an admin.

-- Saving month access keeps the other video settings (it used to replace them).
create or replace function public.set_class_video_settings(p_month_access boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the video settings.';
  end if;
  if p_month_access is null then
    raise exception 'Say whether videos open month by month.';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('class_videos', jsonb_build_object('month_access', p_month_access), timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = coalesce(public.app_settings.value, '{}'::jsonb) || jsonb_build_object('month_access', p_month_access),
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
end;
$$;

create or replace function public.set_class_videos_per_month(p_count integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the video settings.';
  end if;
  if p_count is null or p_count < 1 or p_count > 31 then
    raise exception 'Videos a month must be 1 to 31.';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('class_videos', jsonb_build_object('month_access', false, 'per_month', p_count), timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = coalesce(public.app_settings.value, '{}'::jsonb) || jsonb_build_object('per_month', p_count),
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_class_videos_per_month(integer) from public, anon;
grant execute on function public.set_class_videos_per_month(integer) to authenticated;
