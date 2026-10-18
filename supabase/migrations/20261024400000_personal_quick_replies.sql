-- Quick replies that belong to one person.
--
-- * owner_id empty: the team's quick replies, as before (whoever can see Leads uses them, whoever can edit
--   Leads changes them).
-- * owner_id set: a personal quick reply. Only that person can read, change or delete it; nobody else sees it,
--   an admin included. Whoever can see Leads (and so open the inbox) can have their own.
-- * The title is unique within the team's list and within each person's own list.
-- * A personal reply's pictures, videos and PDFs are stored under u/<person id>/ and only that person can read
--   them. The team's files keep their place at the top of the bucket.

alter table public.quick_replies
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;

drop index if exists public.quick_replies_title_key;

create unique index if not exists quick_replies_team_title_key
on public.quick_replies (lower(btrim(title)))
where owner_id is null;

create unique index if not exists quick_replies_own_title_key
on public.quick_replies (owner_id, lower(btrim(title)))
where owner_id is not null;

create index if not exists quick_replies_owner_idx on public.quick_replies (owner_id);

drop policy if exists "quick_replies_select_permitted" on public.quick_replies;
drop policy if exists "quick_replies_insert_permitted" on public.quick_replies;
drop policy if exists "quick_replies_update_permitted" on public.quick_replies;
drop policy if exists "quick_replies_delete_permitted" on public.quick_replies;

create policy "quick_replies_select_permitted"
on public.quick_replies
for select to authenticated
using (
  (select public.has_permission('leads'))
  and (owner_id is null or owner_id = (select auth.uid()))
);

create policy "quick_replies_insert_permitted"
on public.quick_replies
for insert to authenticated
with check (
  (owner_id is null and (select public.has_permission('leads', 'edit')))
  or (owner_id = (select auth.uid()) and (select public.has_permission('leads')))
);

create policy "quick_replies_update_permitted"
on public.quick_replies
for update to authenticated
using (
  (owner_id is null and (select public.has_permission('leads', 'edit')))
  or (owner_id = (select auth.uid()) and (select public.has_permission('leads')))
)
with check (
  (owner_id is null and (select public.has_permission('leads', 'edit')))
  or (owner_id = (select auth.uid()) and (select public.has_permission('leads')))
);

create policy "quick_replies_delete_permitted"
on public.quick_replies
for delete to authenticated
using (
  (owner_id is null and (select public.has_permission('leads', 'edit')))
  or (owner_id = (select auth.uid()) and (select public.has_permission('leads')))
);

-- Files: the team's at the top of the bucket, a person's own under u/<their id>/.
drop policy if exists "quick_reply_media_select_permitted" on storage.objects;
drop policy if exists "quick_reply_media_insert_permitted" on storage.objects;
drop policy if exists "quick_reply_media_update_permitted" on storage.objects;
drop policy if exists "quick_reply_media_delete_permitted" on storage.objects;

create policy "quick_reply_media_select_permitted"
on storage.objects
for select to authenticated
using (
  bucket_id = 'quick-reply-media'
  and (select public.has_permission('leads'))
  and (
    (storage.foldername(name))[1] is distinct from 'u'
    or (storage.foldername(name))[2] = (select auth.uid())::text
  )
);

create policy "quick_reply_media_insert_permitted"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'quick-reply-media'
  and (
    ((storage.foldername(name))[1] is distinct from 'u' and (select public.has_permission('leads', 'edit')))
    or (
      (storage.foldername(name))[1] = 'u'
      and (storage.foldername(name))[2] = (select auth.uid())::text
      and (select public.has_permission('leads'))
    )
  )
);

create policy "quick_reply_media_update_permitted"
on storage.objects
for update to authenticated
using (
  bucket_id = 'quick-reply-media'
  and (
    ((storage.foldername(name))[1] is distinct from 'u' and (select public.has_permission('leads', 'edit')))
    or (
      (storage.foldername(name))[1] = 'u'
      and (storage.foldername(name))[2] = (select auth.uid())::text
      and (select public.has_permission('leads'))
    )
  )
)
with check (
  bucket_id = 'quick-reply-media'
  and (
    ((storage.foldername(name))[1] is distinct from 'u' and (select public.has_permission('leads', 'edit')))
    or (
      (storage.foldername(name))[1] = 'u'
      and (storage.foldername(name))[2] = (select auth.uid())::text
      and (select public.has_permission('leads'))
    )
  )
);

create policy "quick_reply_media_delete_permitted"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'quick-reply-media'
  and (
    ((storage.foldername(name))[1] is distinct from 'u' and (select public.has_permission('leads', 'edit')))
    or (
      (storage.foldername(name))[1] = 'u'
      and (storage.foldername(name))[2] = (select auth.uid())::text
      and (select public.has_permission('leads'))
    )
  )
);
