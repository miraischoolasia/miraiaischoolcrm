-- How the Calendar page shows a day (Class Settings > Calendar).
--
--   auto      (no row yet = auto) the day list for a school whose busiest weekday has 12 or more classes,
--             the month calendar otherwise. Mirai (a few classes a day) keeps its calendar; EduHero (15-45
--             classes a day) gets the day list, with nothing to set up.
--   classic   always the month / week / agenda calendar.
--   day_list  always the day list: a small month with how many classes each day, and the chosen day's
--             classes by start time, as cards.
--
-- Everyone signed in can read app_settings already; only admin changes this, through set_calendar_layout.

create or replace function public.set_calendar_layout(p_layout text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can change how the calendar looks.';
  end if;
  if p_layout is null or p_layout not in ('auto', 'classic', 'day_list') then
    raise exception 'Choose auto, classic or day_list.';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('calendar_layout', to_jsonb(p_layout), timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_calendar_layout(text) from public, anon;
grant execute on function public.set_calendar_layout(text) to authenticated;
