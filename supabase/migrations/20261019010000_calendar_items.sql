-- Tasks, Zoom meetings and other events on the calendar, beside the classes.
--
-- The calendar only showed classes (and public holidays). The school also plans things that are not a
-- class: a task for someone to do by a day, a Zoom meeting with a parent or the team, a one-off event or
-- reminder. Each is one row here and shows on the calendar in its own colour.
--
--   task     something to do; can be given to a person and ticked off when done
--   meeting  a Zoom (or other) meeting at a time, with the link
--   event    anything else: a reminder, a closed day, a deadline
--
-- Who sees what: someone who may edit the calendar sees and changes everything; anyone else sees the
-- items given to them and the school-wide events, and can tick off a task given to them.

create table if not exists public.calendar_items (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('task', 'meeting', 'event')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  notes text check (notes is null or char_length(notes) <= 2000),
  item_date date not null,
  -- Both null: an all-day item.
  start_time time,
  end_time time,
  zoom_link text check (zoom_link is null or zoom_link ~* '^https?://[^[:space:]]+$'),
  assignee_id bigint references public.teachers (id) on delete set null,
  lead_id bigint references public.leads (id) on delete set null,
  is_done boolean not null default false,
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time is null or (start_time is not null and end_time > start_time))
);

create index if not exists calendar_items_date_idx on public.calendar_items (item_date);
create index if not exists calendar_items_assignee_idx on public.calendar_items (assignee_id);

create or replace function public.calendar_items_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists calendar_items_touch on public.calendar_items;
create trigger calendar_items_touch
  before update on public.calendar_items
  for each row execute function public.calendar_items_touch();

alter table public.calendar_items enable row level security;

drop policy if exists calendar_items_read on public.calendar_items;
create policy calendar_items_read on public.calendar_items
  for select to authenticated
  using (
    public.has_permission('calendar', 'edit')
    or assignee_id = public.current_teacher_id()
    or (kind = 'event' and public.has_permission('calendar', 'view'))
  );

drop policy if exists calendar_items_insert on public.calendar_items;
create policy calendar_items_insert on public.calendar_items
  for insert to authenticated
  with check (public.has_permission('calendar', 'edit'));

drop policy if exists calendar_items_update on public.calendar_items;
create policy calendar_items_update on public.calendar_items
  for update to authenticated
  using (public.has_permission('calendar', 'edit') or assignee_id = public.current_teacher_id())
  with check (public.has_permission('calendar', 'edit') or assignee_id = public.current_teacher_id());

drop policy if exists calendar_items_delete on public.calendar_items;
create policy calendar_items_delete on public.calendar_items
  for delete to authenticated
  using (public.has_permission('calendar', 'edit'));

grant select, insert, update, delete on public.calendar_items to authenticated;

-- The page hears about a change at once (Supabase Realtime), like the other tables.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calendar_items'
     ) then
    alter publication supabase_realtime add table public.calendar_items;
  end if;
end $$;
