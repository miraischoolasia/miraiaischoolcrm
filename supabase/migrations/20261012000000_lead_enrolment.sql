-- Paperwork for enrolling a lead, kept with the lead and shown in the WhatsApp inbox:
-- the payment receipt (always one PDF) and the Zoom meetings arranged with the parent.
--
-- * Whoever can see Leads can read them; whoever can edit Leads can add and delete them
--   (no separate permission), the same as quick replies.
-- * Receipts live in a private bucket, PDF only, capped at 10 MB. The inbox turns a photo
--   into a small PDF before uploading it.
-- * Deleting a lead deletes its rows; the files are cleaned up by the page that deletes them.

create table if not exists public.lead_receipts (
  id bigint generated always as identity primary key,
  lead_id bigint not null references public.leads (id) on delete cascade,
  file_path text not null check (char_length(file_path) between 1 and 300),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 200),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  added_by text,
  created_at timestamptz not null default now()
);

create index if not exists lead_receipts_lead_idx on public.lead_receipts (lead_id, created_at desc);

create table if not exists public.lead_zoom_meetings (
  id bigint generated always as identity primary key,
  lead_id bigint not null references public.leads (id) on delete cascade,
  starts_at timestamptz not null,
  link text not null check (char_length(btrim(link)) between 1 and 500),
  added_by text,
  created_at timestamptz not null default now()
);

create index if not exists lead_zoom_meetings_lead_idx on public.lead_zoom_meetings (lead_id, starts_at);

alter table public.lead_receipts enable row level security;
alter table public.lead_zoom_meetings enable row level security;

create policy "lead_receipts_select_permitted"
on public.lead_receipts
for select to authenticated
using ((select public.has_permission('leads')));

create policy "lead_receipts_insert_permitted"
on public.lead_receipts
for insert to authenticated
with check ((select public.has_permission('leads', 'edit')));

create policy "lead_receipts_delete_permitted"
on public.lead_receipts
for delete to authenticated
using ((select public.has_permission('leads', 'edit')));

create policy "lead_zoom_meetings_select_permitted"
on public.lead_zoom_meetings
for select to authenticated
using ((select public.has_permission('leads')));

create policy "lead_zoom_meetings_insert_permitted"
on public.lead_zoom_meetings
for insert to authenticated
with check ((select public.has_permission('leads', 'edit')));

create policy "lead_zoom_meetings_delete_permitted"
on public.lead_zoom_meetings
for delete to authenticated
using ((select public.has_permission('leads', 'edit')));

grant select, insert, delete on public.lead_receipts to authenticated;
grant select, insert, delete on public.lead_zoom_meetings to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lead-receipts',
  'lead-receipts',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "lead_receipts_files_select_permitted"
on storage.objects
for select to authenticated
using (bucket_id = 'lead-receipts' and (select public.has_permission('leads')));

create policy "lead_receipts_files_insert_permitted"
on storage.objects
for insert to authenticated
with check (bucket_id = 'lead-receipts' and (select public.has_permission('leads', 'edit')));

create policy "lead_receipts_files_delete_permitted"
on storage.objects
for delete to authenticated
using (bucket_id = 'lead-receipts' and (select public.has_permission('leads', 'edit')));
