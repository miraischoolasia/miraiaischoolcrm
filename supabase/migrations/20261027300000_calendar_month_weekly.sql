-- Whether the month calendar also shows each weekly class (Class Settings > Calendar).
--
-- The month calendar shows the special class days: cancelled, replacement, extra class and booked trial. A
-- school with a few classes a day (Mirai) also wants its weekly classes there, faded, so a teacher sees the whole
-- month; a school with dozens a day (EduHero) keeps only the special days and finds the weekly classes in the
-- day list and the week view.
--
-- No row yet = the school's default: on for Mirai, off for another school (decided by the page, from the
-- school's own deployment). Everyone signed in can read app_settings already; only someone who may change Class
-- Settings (admin) changes this, through set_calendar_month_weekly.

create or replace function public.set_calendar_month_weekly(p_show boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('class_settings', 'edit') then
    raise exception 'Only admin can change how the calendar looks.';
  end if;
  if p_show is null then
    raise exception 'Choose to show the weekly classes or not.';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('calendar_month_weekly', to_jsonb(p_show), timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_calendar_month_weekly(boolean) from public, anon;
grant execute on function public.set_calendar_month_weekly(boolean) to authenticated;
