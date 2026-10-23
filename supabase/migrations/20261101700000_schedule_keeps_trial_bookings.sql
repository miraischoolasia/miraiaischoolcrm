-- A weekly trial slot cannot be edited into days that leave a trial booking without a class.
--
-- Found on Mirai 2026-10-23: three edits of a trial slot (a new end date, the weekly slot turned into one single day,
-- a new weekday and start date) left 4 bookings on days the slot no longer ran, so the calendar drew nothing for
-- them and the children were forgotten (one of them 8 days before the lesson).
--
-- The timetable form updates `schedules` straight from the browser, so this is checked here as well as in the form
-- (src/lib/trialOrphans.ts). An edit is refused when a booking that runs today (the slot's weekday and dates as they
-- are now), is on or after today and has no attendance yet, would stop running after the edit: another weekday, an
-- earlier last day, a later first day, no longer weekly, or cancelled.
--
-- Only a person editing through the API is stopped (current_user = 'authenticated'). The database's own routines
-- (hand-over of a classroom, moving bookings, ...) run as the function owner and look after bookings themselves.
-- A booking that already had no class is not counted, so the edit that fixes it is allowed.

create or replace function public.schedules_keep_trial_bookings()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_count integer;
  v_first date;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.day_of_week is not distinct from old.day_of_week
    and new.start_recur is not distinct from old.start_recur
    and new.end_recur is not distinct from old.end_recur
    and new.status is not distinct from old.status
    and new.event_type is not distinct from old.event_type then
    return new;
  end if;

  select count(*), min(tb.booking_date)
  into v_count, v_first
  from public.trial_bookings tb
  where tb.schedule_id = new.id
    and tb.booking_date >= v_today
    and not exists (
      select 1 from public.lesson_logs ll
      where ll.schedule_id = new.id and ll.lesson_date = tb.booking_date
    )
    -- It runs on that day now ...
    and old.status = 'active'
    and old.event_type = 'regular'
    and extract(dow from tb.booking_date)::int = old.day_of_week
    and tb.booking_date >= old.start_recur
    and (old.end_recur is null or tb.booking_date <= old.end_recur)
    -- ... and would not after the edit.
    and not (
      new.status = 'active'
      and new.event_type = 'regular'
      and extract(dow from tb.booking_date)::int = new.day_of_week
      and tb.booking_date >= new.start_recur
      and (new.end_recur is null or tb.booking_date <= new.end_recur)
    );

  if v_count > 0 then
    raise exception '% trial booking% would be left without a class (first: %). Move or cancel % first.',
      v_count,
      case when v_count = 1 then '' else 's' end,
      v_first,
      case when v_count = 1 then 'it' else 'them' end
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists schedules_keep_trial_bookings on public.schedules;
create trigger schedules_keep_trial_bookings
before update of day_of_week, start_recur, end_recur, status, event_type on public.schedules
for each row execute function public.schedules_keep_trial_bookings();
