-- Stickers in the Inbox: the school's own sticker library (an admin adds them; each school's database has its
-- own), and the stickers parents sent lately (found in the inbox copy), so the team can send one with a click.
-- The phone's WhatsApp favourites cannot be reached and are not part of this.

create table public.inbox_stickers (
  id bigint generated always as identity primary key,
  -- The picture in the private bucket inbox-stickers.
  path text not null unique check (char_length(path) <= 300),
  name text check (name is null or char_length(name) <= 80),
  sort_order integer not null default 0,
  -- Hidden, not deleted (the white-label rule): a sticker taken out of the list is kept.
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.inbox_stickers enable row level security;

-- Whoever answers the chats sees the library; only an admin changes it.
create policy "Leads tick reads the stickers"
  on public.inbox_stickers for select to authenticated
  using ((select public.has_permission('leads', 'view')));

create policy "An admin adds stickers"
  on public.inbox_stickers for insert to authenticated
  with check ((select public.is_admin()));

create policy "An admin changes stickers"
  on public.inbox_stickers for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.inbox_stickers from anon;
grant select, insert, update on public.inbox_stickers to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inbox-stickers', 'inbox-stickers', false, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "inbox_stickers_select_permitted"
on storage.objects
for select to authenticated
using (bucket_id = 'inbox-stickers' and (select public.has_permission('leads', 'view')));

create policy "inbox_stickers_insert_admin"
on storage.objects
for insert to authenticated
with check (bucket_id = 'inbox-stickers' and (select public.is_admin()));

-- ---------------------------------------------------------------------------------------------
-- Stickers parents sent lately: WhatsApp stickers arrive as .webp pictures. The same sticker sent twice is one
-- (by its size). Read through the copy's own "who may read" rule (security invoker).
-- ---------------------------------------------------------------------------------------------

create or replace function public.inbox_recent_stickers(p_limit integer default 40)
returns table (url text, name text, size integer, sent_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.url, s.name, s.size, s.sent_at
  from (
    select distinct on (coalesce((a ->> 'size')::integer, -1), case when a ->> 'size' is null then a ->> 'url' end)
      a ->> 'url' as url,
      a ->> 'name' as name,
      (a ->> 'size')::integer as size,
      m.created_at as sent_at
    from public.inbox_messages m
    cross join lateral jsonb_array_elements(m.attachments) a
    where m.message_type = 0
      and not m.deleted
      and m.created_at > now() - interval '90 days'
      and a ->> 'type' = 'image'
      and (coalesce(a ->> 'name', '') ilike '%.webp' or coalesce(a ->> 'url', '') ilike '%.webp%')
      and a ->> 'url' is not null
    order by coalesce((a ->> 'size')::integer, -1), case when a ->> 'size' is null then a ->> 'url' end, m.created_at desc
  ) s
  order by s.sent_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100);
$$;

revoke all on function public.inbox_recent_stickers(integer) from public, anon;
grant execute on function public.inbox_recent_stickers(integer) to authenticated;
