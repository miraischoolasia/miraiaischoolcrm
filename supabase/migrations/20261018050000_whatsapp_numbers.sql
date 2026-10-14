-- Several WhatsApp numbers in one CRM inbox.
--
-- Each number the school links is one inbox in Chatwoot. This table says which inbox is which number
-- (name, phone, the Evolution instance behind it) and which staff may work on it. An admin always sees
-- every number. Until the first number is added here nothing is restricted: everyone with Leads access
-- sees the one inbox, as before.
--
-- The hiding is done by the CRM page (the chats of a number are not listed for someone it is not given
-- to); the WhatsApp gateway still has a single login to Chatwoot. It organises work, it is not a
-- barrier against a staff member who knows how to call the gateway.

create table if not exists public.whatsapp_numbers (
  id bigint generated always as identity primary key,
  label text not null check (char_length(btrim(label)) between 1 and 60),
  -- Digits only, for showing; the inbox id is what ties it to the chats.
  phone text check (phone is null or phone ~ '^[0-9]{8,15}$'),
  chatwoot_inbox_id integer not null unique check (chatwoot_inbox_id > 0),
  -- The name of the number inside Evolution, for the WhatsApp actions (react, edit, delete...).
  evolution_instance text check (evolution_instance is null or evolution_instance ~ '^[A-Za-z0-9_-]{1,60}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_number_staff (
  number_id bigint not null references public.whatsapp_numbers (id) on delete cascade,
  teacher_id bigint not null references public.teachers (id) on delete cascade,
  primary key (number_id, teacher_id)
);

alter table public.whatsapp_numbers enable row level security;
alter table public.whatsapp_number_staff enable row level security;

drop policy if exists whatsapp_numbers_read on public.whatsapp_numbers;
create policy whatsapp_numbers_read on public.whatsapp_numbers
  for select to authenticated
  using (public.has_permission('leads', 'view'));

drop policy if exists whatsapp_numbers_admin on public.whatsapp_numbers;
create policy whatsapp_numbers_admin on public.whatsapp_numbers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- A staff member reads their own assignments; an admin reads all of them.
drop policy if exists whatsapp_number_staff_read on public.whatsapp_number_staff;
create policy whatsapp_number_staff_read on public.whatsapp_number_staff
  for select to authenticated
  using (public.is_admin() or teacher_id = public.current_teacher_id());

drop policy if exists whatsapp_number_staff_admin on public.whatsapp_number_staff;
create policy whatsapp_number_staff_admin on public.whatsapp_number_staff
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.whatsapp_numbers to authenticated;
grant select on public.whatsapp_number_staff to authenticated;
grant insert, update, delete on public.whatsapp_numbers to authenticated;
grant insert, update, delete on public.whatsapp_number_staff to authenticated;

-- The Chatwoot inboxes the signed-in person may see: null means no restriction (an admin, or no number has
-- been set up yet); an empty list means numbers exist but none is given to this person.
create or replace function public.my_whatsapp_inbox_ids()
returns integer[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_admin() then null
    when not exists (select 1 from public.whatsapp_numbers where is_active) then null
    else coalesce(
      (
        select array_agg(n.chatwoot_inbox_id order by n.id)
        from public.whatsapp_numbers n
        join public.whatsapp_number_staff s on s.number_id = n.id
        where n.is_active and s.teacher_id = public.current_teacher_id()
      ),
      array[]::integer[]
    )
  end
$$;

revoke all on function public.my_whatsapp_inbox_ids() from public, anon;
grant execute on function public.my_whatsapp_inbox_ids() to authenticated;
