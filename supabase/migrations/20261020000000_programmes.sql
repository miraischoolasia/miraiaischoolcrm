-- Programmes: the courses a school signs parents up for, made by the school itself instead of being written
-- into the app (Mirai's HOA and Holiday Camp were). A programme has its own steps (the form, picking a
-- class, the receipt, Zoom, or a step of its own), the message it writes to a parent, and what picking a
-- class does. Classes (classrooms) belong to a programme. Mirai's two courses are kept as built-in
-- programmes (legacy_key) that still use the screens they always had; a school with no classes yet
-- (a white-label school) starts with none.

create table if not exists public.programmes (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- 'hoa' or 'camp': Mirai's own two courses, which keep their own screens. Null for every other programme.
  legacy_key text unique check (legacy_key in ('hoa', 'camp')),
  -- What picking a class does: 'booking' keeps a place for the lead (the lead stays a lead),
  -- 'enrol' makes the lead a student of that class.
  outcome text not null default 'booking' check (outcome in ('booking', 'enrol')),
  -- The message to the parent, with {child}, {class_time}, {zoom_time}, {zoom_link} and {form_link} in it.
  message_template text not null default '' check (char_length(message_template) <= 4000),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.programme_steps (
  id bigint generated always as identity primary key,
  programme_id bigint not null references public.programmes (id) on delete cascade,
  sort_order integer not null default 0,
  -- form / class / receipt / zoom work as they do for HOA; custom is a tick with a note and a date.
  kind text not null check (kind in ('form', 'class', 'receipt', 'zoom', 'custom')),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  created_at timestamptz not null default now()
);

create index if not exists programme_steps_programme_idx on public.programme_steps (programme_id, sort_order);

-- Where a lead is on a custom step.
create table if not exists public.lead_programme_steps (
  id bigint generated always as identity primary key,
  lead_id bigint not null references public.leads (id) on delete cascade,
  step_id bigint not null references public.programme_steps (id) on delete cascade,
  done boolean not null default false,
  note text check (note is null or char_length(note) <= 1000),
  step_date date,
  updated_by text,
  updated_at timestamptz not null default now(),
  unique (lead_id, step_id)
);

create index if not exists lead_programme_steps_lead_idx on public.lead_programme_steps (lead_id);

-- The programme a class is for (null: a class that is no programme's).
alter table public.classrooms
  add column if not exists programme_id bigint references public.programmes (id) on delete set null;

create index if not exists classrooms_programme_idx on public.classrooms (programme_id);

create or replace function public.programmes_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists programmes_touch on public.programmes;
create trigger programmes_touch
before update on public.programmes
for each row execute function public.programmes_touch();

drop trigger if exists lead_programme_steps_touch on public.lead_programme_steps;
create trigger lead_programme_steps_touch
before update on public.lead_programme_steps
for each row execute function public.programmes_touch();

-- ---------------------------------------------------------------------------------------------
-- Who can do what: everyone who sees Leads reads the programmes, only an admin changes them;
-- whoever may edit Leads ticks a lead's steps.
-- ---------------------------------------------------------------------------------------------

alter table public.programmes enable row level security;
alter table public.programme_steps enable row level security;
alter table public.lead_programme_steps enable row level security;

create policy "programmes_select_permitted"
on public.programmes for select to authenticated
using ((select public.has_permission('leads')));

create policy "programmes_insert_admin"
on public.programmes for insert to authenticated
with check ((select public.is_admin()));

create policy "programmes_update_admin"
on public.programmes for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "programmes_delete_admin"
on public.programmes for delete to authenticated
using ((select public.is_admin()) and legacy_key is null);

create policy "programme_steps_select_permitted"
on public.programme_steps for select to authenticated
using ((select public.has_permission('leads')));

create policy "programme_steps_insert_admin"
on public.programme_steps for insert to authenticated
with check ((select public.is_admin()));

create policy "programme_steps_update_admin"
on public.programme_steps for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "programme_steps_delete_admin"
on public.programme_steps for delete to authenticated
using ((select public.is_admin()));

create policy "lead_programme_steps_select_permitted"
on public.lead_programme_steps for select to authenticated
using ((select public.has_permission('leads')));

create policy "lead_programme_steps_insert_permitted"
on public.lead_programme_steps for insert to authenticated
with check ((select public.has_permission('leads', 'edit')));

create policy "lead_programme_steps_update_permitted"
on public.lead_programme_steps for update to authenticated
using ((select public.has_permission('leads', 'edit')))
with check ((select public.has_permission('leads', 'edit')));

create policy "lead_programme_steps_delete_permitted"
on public.lead_programme_steps for delete to authenticated
using ((select public.has_permission('leads', 'edit')));

revoke all on public.programmes from anon, authenticated;
revoke all on public.programme_steps from anon, authenticated;
revoke all on public.lead_programme_steps from anon, authenticated;
grant select on public.programmes to authenticated;
grant insert (name, outcome, message_template, is_active, sort_order) on public.programmes to authenticated;
grant update (name, outcome, message_template, is_active, sort_order) on public.programmes to authenticated;
grant delete on public.programmes to authenticated;
grant select on public.programme_steps to authenticated;
grant insert (programme_id, kind, title, sort_order) on public.programme_steps to authenticated;
grant update (kind, title, sort_order) on public.programme_steps to authenticated;
grant delete on public.programme_steps to authenticated;
grant select, delete on public.lead_programme_steps to authenticated;
grant insert (lead_id, step_id, done, note, step_date, updated_by) on public.lead_programme_steps to authenticated;
grant update (done, note, step_date, updated_by) on public.lead_programme_steps to authenticated;

-- Puts the programmes in the order of the ids given.
create or replace function public.reorder_programmes(p_ids bigint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Only an admin can change the programmes.';
  end if;
  update public.programmes as p
  set sort_order = ordered.position * 10
  from unnest(p_ids) with ordinality as ordered (id, position)
  where p.id = ordered.id;
end;
$$;

-- Puts the steps of one programme in the order of the ids given.
create or replace function public.reorder_programme_steps(p_programme_id bigint, p_ids bigint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Only an admin can change the programmes.';
  end if;
  update public.programme_steps as s
  set sort_order = ordered.position * 10
  from unnest(p_ids) with ordinality as ordered (id, position)
  where s.id = ordered.id
    and s.programme_id = p_programme_id;
end;
$$;

revoke all on function public.reorder_programmes(bigint[]) from public, anon;
revoke all on function public.reorder_programme_steps(bigint, bigint[]) from public, anon;
grant execute on function public.reorder_programmes(bigint[]) to authenticated;
grant execute on function public.reorder_programme_steps(bigint, bigint[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Mirai's own two courses, only where there already are HOA (trial) classes
-- ---------------------------------------------------------------------------------------------

do $$
declare
  v_hoa bigint;
  v_camp bigint;
begin
  if exists (select 1 from public.classrooms where category = 'trial')
     and not exists (select 1 from public.programmes where legacy_key = 'hoa') then
    insert into public.programmes (name, legacy_key, outcome, sort_order)
    values ('HOA class', 'hoa', 'booking', 10)
    returning id into v_hoa;
    insert into public.programme_steps (programme_id, sort_order, kind, title) values
      (v_hoa, 10, 'form', 'Registration form'),
      (v_hoa, 20, 'class', 'Book an HOA class'),
      (v_hoa, 30, 'receipt', 'Payment receipt'),
      (v_hoa, 40, 'zoom', 'Zoom with the parent');

    insert into public.programmes (name, legacy_key, outcome, sort_order)
    values ('Holiday Camp', 'camp', 'enrol', 20)
    returning id into v_camp;
    insert into public.programme_steps (programme_id, sort_order, kind, title) values
      (v_camp, 10, 'form', 'Camp registration form'),
      (v_camp, 20, 'class', 'Put the child in a camp class'),
      (v_camp, 30, 'receipt', 'Payment receipt'),
      (v_camp, 40, 'zoom', 'Zoom with the parent');

    update public.classrooms set programme_id = v_hoa where category = 'trial' and programme_id is null;
    update public.classrooms set programme_id = v_camp where category = 'camp' and programme_id is null;
  end if;
end;
$$;
