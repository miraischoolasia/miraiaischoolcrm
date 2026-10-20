-- A short name and a colour for every inbox channel (a WhatsApp number, a Messenger Page, an Instagram account), so
-- the Inbox's channel bar, its chat list and "Sending from" tell two numbers apart at a glance. Before, two WhatsApp
-- numbers both showed the WhatsApp logo and "Edu…" (EduHero, 2026-10-20).
--
-- The key names the channel as channel_avatars does (20261020012000): the Chatwoot inbox id, followed by "|" and the
-- Page name when one inbox carries several Pages (the GoHighLevel bridge). Each school sets its own (white-label);
-- nothing is seeded: without a short name the page shows the last 4 digits of the number, or the Page's name.
-- Read by whoever uses the Inbox or Leads, changed by an admin (same rules as channel_avatars).

create table if not exists public.channel_labels (
  channel_key text primary key check (char_length(channel_key) between 1 and 200),
  short_name text check (short_name is null or char_length(btrim(short_name)) between 1 and 8),
  -- '#rrggbb', one of the page's preset colours.
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  updated_at timestamptz not null default now()
);

comment on table public.channel_labels is
  'Short name (up to 8 characters) and colour of each inbox channel, as the Inbox shows it. Key as channel_avatars.';

alter table public.channel_labels enable row level security;

create policy channel_labels_select_permitted
on public.channel_labels for select to authenticated
using ((select public.has_permission('leads')) or (select public.has_permission('inbox')));

create policy channel_labels_insert_admin
on public.channel_labels for insert to authenticated
with check ((select public.is_admin()));

create policy channel_labels_update_admin
on public.channel_labels for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy channel_labels_delete_admin
on public.channel_labels for delete to authenticated
using ((select public.is_admin()));

revoke all on public.channel_labels from anon, authenticated;
grant select on public.channel_labels to authenticated;
grant insert (channel_key, short_name, color, updated_at) on public.channel_labels to authenticated;
-- The page saves with upsert, which writes the key column too (the same key): it needs update on it.
grant update (channel_key, short_name, color, updated_at) on public.channel_labels to authenticated;
grant delete on public.channel_labels to authenticated;
