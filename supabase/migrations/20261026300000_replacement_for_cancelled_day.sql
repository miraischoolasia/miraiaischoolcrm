-- A cancelled class day remembers the replacement class made for it, so the month calendar can show whether
-- the day is made up (a green dot) and when ("Replacement: Sun 12 Oct, 7.00-8.15PM").
--
-- Until now only a day dragged to another date was linked (moved_to_schedule_id), and Restore removes that
-- replacement. A replacement made with "Add Replacement Class" is a separate class the admin keeps, so it gets
-- its own column: restoring the day leaves it alone, exactly as today.
--
-- Nothing else changes: the column is empty for every existing day (the calendar still finds older
-- replacements by their "Makeup for <class> (cancelled <date>)" note), and only this function writes it.

alter table public.schedule_exceptions
  add column if not exists replacement_schedule_id bigint references public.schedules (id) on delete set null;

create index if not exists schedule_exceptions_replacement_schedule_id_idx
  on public.schedule_exceptions (replacement_schedule_id)
  where replacement_schedule_id is not null;

-- Links a cancelled day to the replacement class made for it (p_replacement_schedule_id null unlinks it).
create or replace function public.link_replacement_to_cancelled_day(
  p_schedule_id bigint,
  p_occurrence_date date,
  p_replacement_schedule_id bigint
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_exception_id bigint;
begin
  if not public.has_permission('calendar', 'edit') then
    raise exception 'Your account is not allowed to change the calendar.';
  end if;

  select id into v_exception_id
  from public.schedule_exceptions
  where schedule_id = p_schedule_id
    and exception_date = p_occurrence_date
  for update;

  if not found then
    raise exception 'That class day is not cancelled.';
  end if;

  if p_replacement_schedule_id is not null and not exists (
    select 1 from public.schedules
    where id = p_replacement_schedule_id
      and event_type = 'replacement'
  ) then
    raise exception 'Only a replacement class can make up a cancelled day.';
  end if;

  update public.schedule_exceptions
  set replacement_schedule_id = p_replacement_schedule_id
  where id = v_exception_id;
end;
$function$;

revoke all on function public.link_replacement_to_cancelled_day(bigint, date, bigint) from public, anon;
grant execute on function public.link_replacement_to_cancelled_day(bigint, date, bigint) to authenticated;
