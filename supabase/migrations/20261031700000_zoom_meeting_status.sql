-- A Zoom meeting now has a status (scheduled / completed / cancelled) like an HOA class booking, and calendar items can
-- repeat every week.
--
--   1. lead_zoom_meetings gets status, completed_at, cancelled_at and calendar_item_id (the calendar entry made for it).
--   2. lead_zoom_meeting_events records every change (created, rescheduled, completed, cancelled, reopened) so
--      Automations can react to them. The automation view zoom_meetings now lists only scheduled meetings, so a
--      cancelled or finished meeting stops sending its "Zoom starts" messages.
--   3. calendar_item_series: a weekly rule (one or more weekdays, a start date, an optional end date). Its dates are
--      written into calendar_items 12 weeks ahead and topped up every day, so staff see every coming occurrence.
--      An occurrence deleted on its own is remembered (skipped_dates) and not written again.

-- ---------------------------------------------------------------------------------------------------------
-- 1. Meeting status
-- ---------------------------------------------------------------------------------------------------------

alter table public.lead_zoom_meetings
  add column if not exists status text not null default 'scheduled',
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists calendar_item_id bigint references public.calendar_items (id) on delete set null;

alter table public.lead_zoom_meetings drop constraint if exists lead_zoom_meetings_status_check;
alter table public.lead_zoom_meetings
  add constraint lead_zoom_meetings_status_check check (status in ('scheduled', 'completed', 'cancelled'));

create index if not exists lead_zoom_meetings_status_idx on public.lead_zoom_meetings (status, starts_at);

drop policy if exists "lead_zoom_meetings_update_permitted" on public.lead_zoom_meetings;
create policy "lead_zoom_meetings_update_permitted"
on public.lead_zoom_meetings
for update to authenticated
using ((select public.has_permission('leads', 'edit')))
with check ((select public.has_permission('leads', 'edit')));

grant update (starts_at, link, status, completed_at, cancelled_at, calendar_item_id) on public.lead_zoom_meetings to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2. Meeting events
-- ---------------------------------------------------------------------------------------------------------

create table if not exists public.lead_zoom_meeting_events (
  id bigint generated always as identity primary key,
  -- Not a foreign key: the history stays when a meeting row is deleted.
  meeting_id bigint not null,
  lead_id bigint not null references public.leads (id) on delete cascade,
  event text not null check (event in ('created', 'rescheduled', 'completed', 'cancelled', 'reopened')),
  starts_at timestamptz not null,
  previous_starts_at timestamptz,
  actor_id bigint references public.teachers (id) on delete set null,
  at timestamptz not null default now()
);

create index if not exists lead_zoom_meeting_events_lead_idx on public.lead_zoom_meeting_events (lead_id, at desc);
create index if not exists lead_zoom_meeting_events_meeting_idx on public.lead_zoom_meeting_events (meeting_id, at);

alter table public.lead_zoom_meeting_events enable row level security;

drop policy if exists "lead_zoom_meeting_events_select_permitted" on public.lead_zoom_meeting_events;
create policy "lead_zoom_meeting_events_select_permitted"
on public.lead_zoom_meeting_events
for select to authenticated
using ((select public.has_permission('leads')));

grant select on public.lead_zoom_meeting_events to authenticated;

-- Keeps the two time stamps true and writes the event, whoever changed the row.
create or replace function public.lead_zoom_meetings_track()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
begin
  if tg_op = 'INSERT' then
    -- A meeting is always created as scheduled.
    new.status := 'scheduled';
    new.completed_at := null;
    new.cancelled_at := null;
    return new;
  end if;

  if new.status is distinct from old.status then
    new.completed_at := case when new.status = 'completed' then now() else null end;
    new.cancelled_at := case when new.status = 'cancelled' then now() else null end;
  end if;
  return new;
end;
$$;

drop trigger if exists lead_zoom_meetings_track on public.lead_zoom_meetings;
create trigger lead_zoom_meetings_track
  before insert or update on public.lead_zoom_meetings
  for each row execute function public.lead_zoom_meetings_track();

create or replace function public.lead_zoom_meetings_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
begin
  if tg_op = 'INSERT' then
    v_event := 'created';
  elsif new.status is distinct from old.status then
    v_event := case
      when new.status = 'completed' then 'completed'
      when new.status = 'cancelled' then 'cancelled'
      else 'reopened'
    end;
  elsif new.starts_at is distinct from old.starts_at then
    v_event := 'rescheduled';
  else
    return new;
  end if;

  insert into public.lead_zoom_meeting_events (meeting_id, lead_id, event, starts_at, previous_starts_at, actor_id)
  values (
    new.id,
    new.lead_id,
    v_event,
    new.starts_at,
    case when tg_op = 'UPDATE' and new.starts_at is distinct from old.starts_at then old.starts_at end,
    public.current_teacher_id()
  );
  return new;
end;
$$;

drop trigger if exists lead_zoom_meetings_log on public.lead_zoom_meetings;
create trigger lead_zoom_meetings_log
  after insert or update on public.lead_zoom_meetings
  for each row execute function public.lead_zoom_meetings_log();

-- Automations see only meetings that are still on. (Same columns as before; only the rows are narrowed.)
create or replace view automation.zoom_meetings as
select z.id, z.lead_id, z.starts_at, z.link, z.created_at
from public.lead_zoom_meetings z
where z.status = 'scheduled';

create or replace view automation.zoom_meeting_events as
select e.id, e.meeting_id, e.lead_id, e.event, e.starts_at, e.previous_starts_at, e.at
from public.lead_zoom_meeting_events e;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'n8n_automation') then
    grant select on automation.zoom_meeting_events to n8n_automation;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Weekly repeat on the calendar
-- ---------------------------------------------------------------------------------------------------------

create table if not exists public.calendar_item_series (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('task', 'meeting', 'event')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  notes text check (notes is null or char_length(notes) <= 2000),
  start_time time,
  end_time time,
  zoom_link text check (zoom_link is null or zoom_link ~* '^https?://[^[:space:]]+$'),
  assignee_id bigint references public.teachers (id) on delete set null,
  -- ISO weekdays: 1 = Monday ... 7 = Sunday.
  weekdays smallint[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  start_date date not null,
  -- Empty: repeats with no end.
  until_date date,
  skipped_dates date[] not null default '{}',
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_time is null or (start_time is not null and end_time > start_time)),
  check (until_date is null or until_date >= start_date)
);

alter table public.calendar_item_series enable row level security;

drop policy if exists calendar_item_series_read on public.calendar_item_series;
create policy calendar_item_series_read on public.calendar_item_series
  for select to authenticated
  using (public.has_permission('calendar', 'edit') or assignee_id = public.current_teacher_id());

-- Changes go through the functions below only.
grant select on public.calendar_item_series to authenticated;

alter table public.calendar_items
  add column if not exists series_id bigint references public.calendar_item_series (id) on delete set null,
  add column if not exists series_date date;

create unique index if not exists calendar_items_series_unique on public.calendar_items (series_id, series_date);

-- An occurrence deleted on its own is remembered, so the daily top-up does not write it again.
create or replace function public.calendar_items_remember_skip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.series_id is not null and old.series_date is not null then
    update public.calendar_item_series
    set skipped_dates = array_append(skipped_dates, old.series_date)
    where id = old.series_id and not (old.series_date = any(skipped_dates));
  end if;
  return old;
end;
$$;

drop trigger if exists calendar_items_remember_skip on public.calendar_items;
create trigger calendar_items_remember_skip
  before delete on public.calendar_items
  for each row execute function public.calendar_items_remember_skip();

-- Writes the occurrences from today to 12 weeks ahead that are not there yet (one series, or all when null).
create or replace function public.calendar_series_extend(p_series_id bigint default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_horizon date := (timezone('Asia/Kuala_Lumpur', now()))::date + 84;
  v_count integer;
begin
  with added as (
    insert into public.calendar_items
      (kind, title, notes, item_date, start_time, end_time, zoom_link, assignee_id, created_by, series_id, series_date)
    select s.kind, s.title, s.notes, d.day, s.start_time, s.end_time, s.zoom_link, s.assignee_id, s.created_by, s.id, d.day
    from public.calendar_item_series s
    cross join lateral (
      select g::date as day
      from generate_series(greatest(s.start_date, v_today), least(v_horizon, coalesce(s.until_date, v_horizon)), interval '1 day') g
    ) d
    where (p_series_id is null or s.id = p_series_id)
      and extract(isodow from d.day)::smallint = any (s.weekdays)
      and not (d.day = any (s.skipped_dates))
    on conflict (series_id, series_date) do nothing
    returning 1
  )
  select count(*) into v_count from added;
  return v_count;
end;
$$;

create or replace function public.calendar_series_create(
  p_kind text,
  p_title text,
  p_notes text,
  p_start_date date,
  p_weekdays smallint[],
  p_start_time time,
  p_end_time time,
  p_zoom_link text,
  p_assignee_id bigint,
  p_until_date date default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.has_permission('calendar', 'edit') then
    raise exception 'You are not allowed to change the calendar.';
  end if;

  insert into public.calendar_item_series
    (kind, title, notes, start_time, end_time, zoom_link, assignee_id, weekdays, start_date, until_date, created_by)
  values
    (p_kind, btrim(p_title), nullif(btrim(coalesce(p_notes, '')), ''), p_start_time, p_end_time,
     nullif(btrim(coalesce(p_zoom_link, '')), ''), p_assignee_id, p_weekdays, p_start_date, p_until_date,
     public.current_teacher_id())
  returning id into v_id;

  perform public.calendar_series_extend(v_id);
  return v_id;
end;
$$;

-- Changes a series from p_from_date on (default today). p_patch keys: title, notes, start_time, end_time, zoom_link,
-- assignee_id, weekdays. A key that is present with null clears that field. Occurrences before p_from_date and
-- ticked-off ones are left alone.
create or replace function public.calendar_series_update(
  p_series_id bigint,
  p_patch jsonb,
  p_from_date date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_from date;
  s public.calendar_item_series%rowtype;
  v_weekdays smallint[];
begin
  if not public.has_permission('calendar', 'edit') then
    raise exception 'You are not allowed to change the calendar.';
  end if;

  select * into s from public.calendar_item_series where id = p_series_id for update;
  if not found then
    raise exception 'This repeating item no longer exists.';
  end if;

  v_from := greatest(coalesce(p_from_date, v_today), v_today);

  if p_patch ? 'title' then s.title := btrim(p_patch ->> 'title'); end if;
  if p_patch ? 'notes' then s.notes := nullif(btrim(coalesce(p_patch ->> 'notes', '')), ''); end if;
  if p_patch ? 'start_time' then s.start_time := nullif(p_patch ->> 'start_time', '')::time; end if;
  if p_patch ? 'end_time' then s.end_time := nullif(p_patch ->> 'end_time', '')::time; end if;
  if p_patch ? 'zoom_link' then s.zoom_link := nullif(btrim(coalesce(p_patch ->> 'zoom_link', '')), ''); end if;
  if p_patch ? 'assignee_id' then s.assignee_id := nullif(p_patch ->> 'assignee_id', '')::bigint; end if;
  if p_patch ? 'weekdays' then
    select array_agg(w::smallint order by w::smallint) into v_weekdays from jsonb_array_elements_text(p_patch -> 'weekdays') w;
    s.weekdays := v_weekdays;
  end if;

  update public.calendar_item_series
  set title = s.title, notes = s.notes, start_time = s.start_time, end_time = s.end_time, zoom_link = s.zoom_link,
      assignee_id = s.assignee_id, weekdays = s.weekdays
  where id = p_series_id;

  if p_patch ? 'weekdays' then
    -- Other days: the coming occurrences are written again on the new days.
    delete from public.calendar_items where series_id = p_series_id and item_date >= v_from and not is_done;
    update public.calendar_item_series
    set skipped_dates = coalesce((select array_agg(d) from unnest(skipped_dates) d where d < v_from), '{}')
    where id = p_series_id;
    perform public.calendar_series_extend(p_series_id);
  else
    update public.calendar_items
    set title = s.title, notes = s.notes, start_time = s.start_time, end_time = s.end_time, zoom_link = s.zoom_link,
        assignee_id = s.assignee_id
    where series_id = p_series_id and item_date >= v_from and not is_done;
  end if;
end;
$$;

-- Deletes the series from p_from_date on (default today); earlier occurrences stay as plain items. When nothing is
-- left before that day, the series itself goes.
create or replace function public.calendar_series_delete(
  p_series_id bigint,
  p_from_date date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_from date;
  v_start date;
begin
  if not public.has_permission('calendar', 'edit') then
    raise exception 'You are not allowed to change the calendar.';
  end if;

  select start_date into v_start from public.calendar_item_series where id = p_series_id for update;
  if not found then
    return;
  end if;

  v_from := coalesce(p_from_date, v_today);
  delete from public.calendar_items where series_id = p_series_id and item_date >= v_from;

  if v_from <= v_start then
    delete from public.calendar_item_series where id = p_series_id;
  else
    update public.calendar_item_series set until_date = v_from - 1 where id = p_series_id;
  end if;
end;
$$;

revoke all on function public.calendar_series_extend(bigint) from public, anon;
revoke all on function public.calendar_series_create(text, text, text, date, smallint[], time, time, text, bigint, date) from public, anon;
revoke all on function public.calendar_series_update(bigint, jsonb, date) from public, anon;
revoke all on function public.calendar_series_delete(bigint, date) from public, anon;
grant execute on function public.calendar_series_extend(bigint) to authenticated, service_role;
grant execute on function public.calendar_series_create(text, text, text, date, smallint[], time, time, text, bigint, date) to authenticated;
grant execute on function public.calendar_series_update(bigint, jsonb, date) to authenticated;
grant execute on function public.calendar_series_delete(bigint, date) to authenticated;

-- Every day at 03:00 Malaysia time (19:00 UTC) the series are written another day ahead.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'calendar-series-top-up') then
    perform cron.unschedule('calendar-series-top-up');
  end if;
  perform cron.schedule('calendar-series-top-up', '0 19 * * *', 'select public.calendar_series_extend()');
end;
$$;
