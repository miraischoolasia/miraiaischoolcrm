-- Quotations, next batch (boss 2026-10-23; plan: side notes quotation-payment-plan-detail.md §15). After
-- 20261031100000_quotations.sql (live), which this does not change.
--
--   1. The school's bank / DuitNow QR picture, shown beside the bank details on the parent's page and the PDF:
--      public bucket quotation-public (a parent opens the page without a login; a bank QR is public anyway),
--      written only by an admin. Its path is kept in app_settings 'quotations' -> paymentQr.bank_transfer.
--   2. Where the parent goes after paying, per EC: quotation_staff_links (each staff member sets their own,
--      an admin anyone's): after_pay_url and contact_url. The quotation function copies them onto the quotation
--      when it is sent (after_pay_url, contact_url), so a later change does not move quotations already out.
--   3. The parent's page stays read-only; two buttons tell the EC (once each): "我已转账" (parent_said_paid_at;
--      never marks it paid: the EC still confirms with the receipt) and "资料不对" (parent_said_wrong_at).

-- ---------------------------------------------------------------------------------------------------------
-- 1. The QR picture.
-- ---------------------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quotation-public', 'quotation-public', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "quotation_public_files_insert_admin"
on storage.objects
for insert to authenticated
with check (bucket_id = 'quotation-public' and (select public.is_admin()));

create policy "quotation_public_files_update_admin"
on storage.objects
for update to authenticated
using (bucket_id = 'quotation-public' and (select public.is_admin()))
with check (bucket_id = 'quotation-public' and (select public.is_admin()));

create policy "quotation_public_files_delete_admin"
on storage.objects
for delete to authenticated
using (bucket_id = 'quotation-public' and (select public.is_admin()));

-- ---------------------------------------------------------------------------------------------------------
-- 2. Each EC's links.
-- ---------------------------------------------------------------------------------------------------------

create table public.quotation_staff_links (
  teacher_id bigint primary key references public.teachers (id) on delete cascade,
  -- Where the parent goes after paying (their WhatsApp link, a thank-you page...).
  after_pay_url text check (after_pay_url is null or (after_pay_url ~ '^https://[^\s]+$' and char_length(after_pay_url) <= 500)),
  -- Where "资料不对，联系顾问" goes (a wa.me link); none = the chat's school number.
  contact_url text check (contact_url is null or (contact_url ~ '^https://[^\s]+$' and char_length(contact_url) <= 500)),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by bigint references public.teachers (id) on delete set null
);

alter table public.quotation_staff_links enable row level security;
revoke all on public.quotation_staff_links from public, anon, authenticated;
grant select on public.quotation_staff_links to authenticated;
grant all on public.quotation_staff_links to service_role;

-- One's own, or everyone's with the Quotations tick (an admin sets them for others).
create policy quotation_staff_links_select on public.quotation_staff_links for select to authenticated
  using (teacher_id = (select public.current_teacher_id()) or (select public.has_permission('quotations')));

-- Set (or clear, with nulls) one person's links: their own with the Quotations tick (edit), anyone's as admin.
create or replace function public.set_quotation_staff_link(p_teacher_id bigint, p_after_pay_url text, p_contact_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after text := nullif(btrim(coalesce(p_after_pay_url, '')), '');
  v_contact text := nullif(btrim(coalesce(p_contact_url, '')), '');
begin
  if not (
    public.is_admin()
    or (p_teacher_id = public.current_teacher_id() and public.has_permission('quotations', 'edit'))
  ) then
    raise exception 'Only admin can set another person''s quotation links.';
  end if;
  if v_after is not null and (v_after !~ '^https://[^\s]+$' or char_length(v_after) > 500) then
    raise exception 'The after-payment link must start with https:// (up to 500 characters).';
  end if;
  if v_contact is not null and (v_contact !~ '^https://[^\s]+$' or char_length(v_contact) > 500) then
    raise exception 'The contact link must start with https:// (up to 500 characters).';
  end if;
  insert into public.quotation_staff_links (teacher_id, after_pay_url, contact_url, updated_at, updated_by)
  values (p_teacher_id, v_after, v_contact, timezone('utc', now()), public.current_teacher_id())
  on conflict (teacher_id) do update
  set after_pay_url = excluded.after_pay_url, contact_url = excluded.contact_url,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_quotation_staff_link(bigint, text, text) from public, anon;
grant execute on function public.set_quotation_staff_link(bigint, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3. On the quotation: the links as they were when it was sent, and what the parent pressed.
-- ---------------------------------------------------------------------------------------------------------

alter table public.quotations
  add column if not exists after_pay_url text check (after_pay_url is null or char_length(after_pay_url) <= 500),
  add column if not exists contact_url text check (contact_url is null or char_length(contact_url) <= 600),
  add column if not exists parent_said_paid_at timestamptz,
  add column if not exists parent_said_wrong_at timestamptz;

alter table public.quotation_events drop constraint if exists quotation_events_kind_check;
alter table public.quotation_events add constraint quotation_events_kind_check check (kind in (
  'created', 'sent', 'viewed', 'confirmed', 'link_created', 'paid', 'fulfilled', 'fulfil_failed', 'cancelled',
  'expired', 'approved', 'renewed', 'login', 'receipt', 'queued', 'check', 'parent_paid', 'parent_wrong'
));
