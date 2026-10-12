-- The family: one row for every person the school talks to or teaches, and who belongs to whom.
--
-- Until now "whose parent is this?" was only a guess made by matching phone numbers (a lead holds
-- its children in a list, a chat is tied to a lead by a mark on the chat). That guess is what made
-- two chats and two leads for one family. This table is the real thing, and what the parent and
-- student portals will sign in against later.
--
-- * kind: 'contact' = someone who wrote to us and is not placed yet (every WhatsApp contact starts
--   here, including the ones whose number WhatsApp hides); 'parent'; 'student'.
-- * A student has exactly one parent (parent_id). A parent has any number of students.
-- * A student who writes on WhatsApp themself is their own row, with their own number and chat.
-- * lead_id / student_id connect a row to the lead or the enrolled student the school already has.
--   Nothing about leads and students changes.
-- * phone and email are both kept, so the portal can sign in with either.
-- * auth_user_id is empty until a portal exists.
--
-- Whoever can see Leads or Students can read; whoever can edit either can change.
-- This migration only creates the table. Filling it from the existing leads, students and chats is
-- a separate, reviewed step.

create table if not exists public.people (
  id bigint generated always as identity primary key,
  kind text not null default 'contact' check (kind in ('contact', 'parent', 'student')),
  full_name text check (full_name is null or char_length(btrim(full_name)) between 1 and 200),
  -- Digits only, with the country code (60...), as the number is written on WhatsApp.
  phone text check (phone is null or phone ~ '^[0-9]{8,15}$'),
  email text check (email is null or char_length(btrim(email)) between 3 and 200),
  -- The WhatsApp contact in the inbox (Chatwoot), including a hidden-ID one. One person per contact.
  chatwoot_contact_id bigint unique,
  parent_id bigint references public.people (id) on delete set null,
  lead_id bigint references public.leads (id) on delete set null,
  student_id bigint references public.students (id) on delete set null,
  auth_user_id uuid unique,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_only_a_student_has_a_parent check (parent_id is null or kind = 'student'),
  constraint people_not_own_parent check (parent_id is null or parent_id <> id)
);

create index if not exists people_phone_idx on public.people (phone) where phone is not null;
create index if not exists people_parent_idx on public.people (parent_id) where parent_id is not null;
create index if not exists people_lead_idx on public.people (lead_id) where lead_id is not null;
create index if not exists people_student_idx on public.people (student_id) where student_id is not null;

drop trigger if exists set_people_updated_at on public.people;
create trigger set_people_updated_at
before update on public.people
for each row execute function public.set_current_timestamp_updated_at();

-- A student's parent must be a 'parent' row. (A CHECK cannot look at another row.)
create or replace function public.people_check_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.people where id = new.parent_id and kind = 'parent'
  ) then
    raise exception 'A student''s parent has to be a parent.';
  end if;

  -- Turning a parent into something else while students still point at them would orphan the students.
  if tg_op = 'UPDATE' and old.kind = 'parent' and new.kind <> 'parent'
     and exists (select 1 from public.people where parent_id = new.id) then
    raise exception 'This parent still has students. Move or remove them first.';
  end if;

  return new;
end;
$$;

revoke all on function public.people_check_parent() from public, anon, authenticated;

drop trigger if exists people_check_parent on public.people;
create trigger people_check_parent
before insert or update of kind, parent_id on public.people
for each row execute function public.people_check_parent();

alter table public.people enable row level security;

create policy "people_select_permitted"
on public.people
for select to authenticated
using ((select public.has_permission('leads') or public.has_permission('students')));

create policy "people_insert_permitted"
on public.people
for insert to authenticated
with check ((select public.has_permission('leads', 'edit') or public.has_permission('students', 'edit')));

create policy "people_update_permitted"
on public.people
for update to authenticated
using ((select public.has_permission('leads', 'edit') or public.has_permission('students', 'edit')))
with check ((select public.has_permission('leads', 'edit') or public.has_permission('students', 'edit')));

create policy "people_delete_permitted"
on public.people
for delete to authenticated
using ((select public.has_permission('leads', 'delete') or public.has_permission('students', 'delete')));

grant select, insert, update, delete on public.people to authenticated;
