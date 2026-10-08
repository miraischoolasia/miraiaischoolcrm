-- Quick replies for the WhatsApp inbox: ready-made messages the team picks from
-- instead of retyping, each with optional photos, videos or PDFs.
--
-- * Whoever can see Leads can use them; whoever can edit Leads can add, change
--   and delete them (no separate permission).
-- * The message may hold {parent name}, {child name}, {trial date} and
--   {my name}; the inbox fills them in before sending.
-- * Attachments live in a private bucket and are only readable by people who
--   can see Leads. Files are capped at 16 MB, the most WhatsApp accepts.
--   media holds [{ "path": ..., "name": ..., "type": ..., "size": ... }].

create table if not exists public.quick_replies (
  id bigint generated always as identity primary key,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null default '' check (char_length(body) <= 4000),
  media jsonb not null default '[]'::jsonb
    check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 5),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists quick_replies_title_key
on public.quick_replies (lower(btrim(title)));

create or replace function public.quick_replies_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists quick_replies_touch on public.quick_replies;
create trigger quick_replies_touch
before update on public.quick_replies
for each row execute function public.quick_replies_touch();

alter table public.quick_replies enable row level security;

create policy "quick_replies_select_permitted"
on public.quick_replies
for select to authenticated
using ((select public.has_permission('leads')));

create policy "quick_replies_insert_permitted"
on public.quick_replies
for insert to authenticated
with check ((select public.has_permission('leads', 'edit')));

create policy "quick_replies_update_permitted"
on public.quick_replies
for update to authenticated
using ((select public.has_permission('leads', 'edit')))
with check ((select public.has_permission('leads', 'edit')));

create policy "quick_replies_delete_permitted"
on public.quick_replies
for delete to authenticated
using ((select public.has_permission('leads', 'edit')));

grant select, insert, update, delete on public.quick_replies to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quick-reply-media',
  'quick-reply-media',
  false,
  16777216,
  array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "quick_reply_media_select_permitted"
on storage.objects
for select to authenticated
using (bucket_id = 'quick-reply-media' and (select public.has_permission('leads')));

create policy "quick_reply_media_insert_permitted"
on storage.objects
for insert to authenticated
with check (bucket_id = 'quick-reply-media' and (select public.has_permission('leads', 'edit')));

create policy "quick_reply_media_update_permitted"
on storage.objects
for update to authenticated
using (bucket_id = 'quick-reply-media' and (select public.has_permission('leads', 'edit')))
with check (bucket_id = 'quick-reply-media' and (select public.has_permission('leads', 'edit')));

create policy "quick_reply_media_delete_permitted"
on storage.objects
for delete to authenticated
using (bucket_id = 'quick-reply-media' and (select public.has_permission('leads', 'edit')));
