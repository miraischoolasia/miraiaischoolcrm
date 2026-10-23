-- Quotations (报价单) → Razorpay Curlec payment → enrolment (boss 2026-10-23; plan: side notes
-- quotation-payment-plan-detail.md, PM agreed). EduHero first; each school switches it on (app_settings 'quotations').
--
-- An Education Consultant makes a quotation in the Inbox (child, subjects, a class for each, membership level, how
-- they enrol, start month, West / East Malaysia, registration fee, discount). The quotation edge function works out
-- the price with the Fee Calculator's maths (unchanged; the discount is one more line) and keeps it here
-- (price_snapshot): what the parent sees and what Razorpay charges. The parent opens ?quote=<token>, confirms, pays on
-- a Razorpay payment link. Only Razorpay's signed webhook marks it paid; then quotation_after_payment() enrols the
-- child (department 3's enrol_paid_quotation, 20261031200000), tells the EC and LC, and notes the payment in the chat.
--
--   quotations              one per quotation; the token is the parent's only key; prices locked once sent.
--   quotation_classes       the class picked for each subject.
--   quotation_events        every step, for checking later.
--   payment_webhook_events  every Razorpay event, kept once (x-razorpay-event-id): the same event twice does nothing.
--   fee_subjects.subject_id which of the school's subjects a Fee Calculator subject is (to list its classes).
--   app_settings 'quotations' the school's switch and rules (off; every value editable by an admin).
--
-- New tick 'quotations' (Marketing): view = see quotations, edit = make / send / cancel, edit + delete = approve a
-- discount over the cap and cancel other people's quotations. Nobody gets it on the day this goes live; admins have
-- every tick. Parents never read these tables: the quote-public edge function shows them a chosen few fields.
-- Written only by the edge functions (service role) and the functions below. Needs 20261030100000 (Student fields)
-- and 20261030300000 (Fee Calculator).

-- ---------------------------------------------------------------------------------------------------------
-- 1. Tables.
-- ---------------------------------------------------------------------------------------------------------

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  public_token text not null unique check (public_token ~ '^[A-Za-z0-9_-]{40,64}$'),
  status text not null default 'draft'
    check (status in ('draft', 'needs_approval', 'sent', 'viewed', 'confirmed', 'paid', 'expired', 'cancelled')),
  -- The chat it was made in: the payment is noted there and the login sent there.
  lead_id bigint references public.leads (id) on delete set null,
  conversation_id bigint,
  contact_id bigint,
  inbox_id bigint,
  phone text check (phone is null or phone ~ '^[0-9]{8,15}$'),
  child_name text not null check (char_length(btrim(child_name)) between 1 and 120),
  child_age smallint check (child_age is null or child_age between 2 and 25),
  age_group text,
  -- The Fee Calculator's choices, as made.
  cohort_id bigint not null references public.fee_cohorts (id),
  level text not null check (level in ('primary', 'secondary')),
  region text not null check (region in ('west_malaysia', 'east_malaysia')),
  enrol_method text not null check (char_length(enrol_method) between 1 and 60),
  rate_tier text not null check (rate_tier in ('monthly', '3mo', '6mo_plus')),
  months smallint not null check (months between 1 and 24),
  start_date date not null check (extract(day from start_date) = 1),
  registration_month smallint check (registration_month is null or registration_month between 1 and 12),
  subjects jsonb not null default '[]'::jsonb check (jsonb_typeof(subjects) = 'array'),
  bio_che_phy jsonb not null default '[]'::jsonb check (jsonb_typeof(bio_che_phy) = 'array'),
  -- What is written on the student when paid (department 3's Student fields choices).
  payment_mode text,
  region_option text,
  fee_month smallint check (fee_month is null or fee_month between 1 and 12),
  -- Discount: one more line after the Fee Calculator's sum.
  discount_kind text check (discount_kind is null or discount_kind in ('amount', 'percent')),
  discount_value numeric(10, 2) check (discount_value is null or discount_value >= 0),
  discount_reason text check (discount_reason is null or char_length(discount_reason) <= 60),
  discount_note text check (discount_note is null or char_length(discount_note) <= 300),
  discount_approved_by bigint references public.teachers (id) on delete set null,
  discount_approved_at timestamptz,
  -- The price as the quotation function worked it out (lines, subtotal, discount, total, text). The only price.
  price_snapshot jsonb not null default '{}'::jsonb,
  subtotal numeric(10, 2) not null check (subtotal >= 0),
  discount_amount numeric(10, 2) not null default 0 check (discount_amount >= 0),
  total numeric(10, 2) not null check (total >= 1),
  currency text not null default 'MYR' check (currency = 'MYR'),
  expires_at timestamptz,
  sales_person_id bigint references public.teachers (id) on delete set null,
  consultant_id bigint references public.teachers (id) on delete set null,
  -- The quotation's number (Q- and 12 hex digits of the id), given when it is made: on the PDF, the parent's page,
  -- the bank transfer note and Razorpay's reference.
  reference_no text not null unique check (reference_no ~ '^Q-[0-9A-F]{12}$'),
  -- How the parent pays: Razorpay's payment link, or a bank transfer the EC confirms with the receipt (Plan B).
  payment_route text not null default 'bank_transfer' check (payment_route in ('razorpay', 'bank_transfer')),
  -- Razorpay.
  rzp_link_id text unique,
  rzp_link_url text,
  rzp_payment_id text unique,
  -- Bank transfer: what the EC confirmed, with the parent's receipt (private bucket quotation-payments).
  bank_paid_on date,
  bank_reference text check (bank_reference is null or char_length(bank_reference) <= 100),
  payment_proof_path text check (payment_proof_path is null or char_length(payment_proof_path) <= 300),
  payment_note text check (payment_note is null or char_length(payment_note) <= 300),
  confirmed_by bigint references public.teachers (id) on delete set null,
  payment_method text,
  paid_amount numeric(10, 2),
  paid_at timestamptz,
  -- After paying: department 3 fills student_id; the rest is ours.
  student_id bigint references public.students (id) on delete set null,
  fulfil_status text check (fulfil_status is null or fulfil_status in ('pending', 'done', 'failed', 'check')),
  fulfil_error text check (fulfil_error is null or char_length(fulfil_error) <= 1000),
  login_status text check (login_status is null or login_status in ('pending', 'done', 'exists', 'failed')),
  receipt_path text,
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index quotations_lead_idx on public.quotations (lead_id);
create index quotations_conversation_idx on public.quotations (conversation_id);
create index quotations_status_idx on public.quotations (status, created_at desc);

create trigger set_quotations_updated_at
  before update on public.quotations
  for each row execute function public.set_current_timestamp_updated_at();

create table public.quotation_classes (
  -- In the order the subjects were ticked: department 3 makes the first one the student's main class.
  id bigint generated always as identity unique,
  quotation_id uuid not null references public.quotations (id) on delete cascade,
  subject_code text not null check (subject_code ~ '^[A-Z0-9]{1,12}$'),
  classroom_id bigint not null references public.classrooms (id),
  primary key (quotation_id, subject_code)
);

create table public.quotation_events (
  id bigint generated always as identity primary key,
  quotation_id uuid not null references public.quotations (id) on delete cascade,
  kind text not null check (kind in (
    'created', 'sent', 'viewed', 'confirmed', 'link_created', 'paid', 'fulfilled', 'fulfil_failed', 'cancelled',
    'expired', 'approved', 'renewed', 'login', 'receipt', 'queued', 'check'
  )),
  detail jsonb not null default '{}'::jsonb,
  by_teacher_id bigint references public.teachers (id) on delete set null,
  at timestamptz not null default timezone('utc', now())
);

create index quotation_events_quotation_idx on public.quotation_events (quotation_id, at);

create table public.payment_webhook_events (
  event_id text primary key check (char_length(event_id) between 1 and 200),
  event text not null,
  payload jsonb not null,
  quotation_id uuid references public.quotations (id) on delete set null,
  result text,
  received_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz
);

alter table public.fee_subjects add column if not exists subject_id bigint references public.subjects (id) on delete set null;

-- ---------------------------------------------------------------------------------------------------------
-- 2. The new tick. Same as 20261030700000_class_quality.sql (the latest valid_account_permissions) plus
--    'quotations' (view / edit / delete = approve big discounts; no "whose" scope).
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.valid_account_permissions(p jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(p) = 'object' and not exists (
    select 1
    from jsonb_each(p) as e(module, value)
    where e.module not in (
        'calendar', 'classrooms', 'students', 'leads', 'forms', 'activity', 'team_replies',
        'inbox', 'automations', 'ai_knowledge', 'videos', 'questions', 'app_logins', 'packages',
        'class_settings', 'staff_hours', 'content_studio', 'content_library', 'student_inbox',
        'fee_calculator', 'quality', 'progress_cards', 'quotations'
      )
      or jsonb_typeof(e.value) <> 'object'
      or coalesce(e.value ->> 'level', '') not in ('view', 'edit')
      or (e.value ? 'delete' and jsonb_typeof(e.value -> 'delete') <> 'boolean')
      or (e.value -> 'delete' = 'true'::jsonb and e.value ->> 'level' <> 'edit')
      -- Seen, never changed (Content Library: seeing it is what lets a person claim a post).
      or (e.module in ('activity', 'team_replies', 'staff_hours', 'content_library')
          and (e.value ->> 'level' <> 'view' or e.value -> 'delete' = 'true'::jsonb))
      -- Whose rows: only where the page has rows that belong to someone.
      or (e.value ? 'scope' and (
        jsonb_typeof(e.value -> 'scope') <> 'string'
        or case
          when e.module in ('leads', 'inbox') then e.value ->> 'scope' not in ('all', 'own_unassigned', 'own')
          when e.module in ('team_replies', 'progress_cards') then e.value ->> 'scope' not in ('all', 'own')
          else e.value ->> 'scope' <> 'all'
        end
      ))
      -- Only these keys.
      or exists (select 1 from jsonb_object_keys(e.value) k where k not in ('level', 'delete', 'scope'))
  );
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Who reads: the Quotations tick. Nobody writes the tables directly (the edge functions use the service role).
-- ---------------------------------------------------------------------------------------------------------

alter table public.quotations enable row level security;
alter table public.quotation_classes enable row level security;
alter table public.quotation_events enable row level security;
alter table public.payment_webhook_events enable row level security;

revoke all on public.quotations, public.quotation_classes, public.quotation_events, public.payment_webhook_events
  from public, anon, authenticated;
grant select on public.quotations, public.quotation_classes, public.quotation_events to authenticated;
grant all on public.quotations, public.quotation_classes, public.quotation_events, public.payment_webhook_events to service_role;

create policy quotations_select on public.quotations for select to authenticated
  using ((select public.has_permission('quotations')));
create policy quotation_classes_select on public.quotation_classes for select to authenticated
  using ((select public.has_permission('quotations')));
create policy quotation_events_select on public.quotation_events for select to authenticated
  using ((select public.has_permission('quotations')));
-- payment_webhook_events: the service role only (raw Razorpay payloads).

-- The parents' bank transfer receipts (Plan B), private: put by staff who may make quotations, read with the
-- Quotations tick. A photo is turned into a PDF in the browser first (as the Inbox's receipts), images allowed too.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quotation-payments', 'quotation-payments', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "quotation_payments_files_select_permitted"
on storage.objects
for select to authenticated
using (bucket_id = 'quotation-payments' and (select public.has_permission('quotations')));

create policy "quotation_payments_files_insert_permitted"
on storage.objects
for insert to authenticated
with check (bucket_id = 'quotation-payments' and (select public.has_permission('quotations', 'edit')));

-- ---------------------------------------------------------------------------------------------------------
-- 4. The school's settings (read by every staff login; changed by admin).
-- ---------------------------------------------------------------------------------------------------------

insert into public.app_settings (key, value) values ('quotations', jsonb_build_object(
  'enabled', false,
  'expiryDays', 3,
  'discountCapPercent', 10,
  'discountCapAmount', 100,
  'discountReasons', jsonb_build_array('兄弟姐妹', '老生续报', '朋友推荐', '促销活动', '其他'),
  'discountLine', '折扣（{reason}）-RM{amount}',
  'terms', '',
  'paidMessage', '付款成功！我们会在 WhatsApp 发送学生 App 登入资料和第一堂课的时间。',
  'lcRule', 'ec_picks',
  'publicBaseUrl', '',
  'enrolMethods', jsonb_build_array(
    jsonb_build_object('name', '每月报名', 'rateTier', 'monthly', 'months', 1),
    jsonb_build_object('name', '3个月一次性报名', 'rateTier', '3mo', 'months', 3),
    jsonb_build_object('name', '6个月一次性报名', 'rateTier', '6mo_plus', 'months', 6),
    jsonb_build_object('name', '12个月一次性报名', 'rateTier', '6mo_plus', 'months', 12)
  ),
  'paymentModeName', '一次性付款',
  'regionNames', jsonb_build_object('west_malaysia', '西马', 'east_malaysia', '东马'),
  'linkMessage', E'这是 {child} 的报价单，共 RM{total}。请点以下链接确认并付款（{days} 天内有效）：\n{url}',
  -- Plan B (boss 2026-10-23): the parent pays by bank transfer and the EC confirms it with the receipt.
  -- Bank transfer only until the school's Razorpay keys are set.
  'paymentRoutes', jsonb_build_array('bank_transfer'),
  'bank', jsonb_build_object('bankName', '', 'accountName', '', 'accountNumber', ''),
  'bankNote', '转账时请在备注写孩子的名字和报价单号，转账后把收据发给我们。',
  'bankReview', false
))
on conflict (key) do nothing;

-- The whole value at once (the page reads it with readQuotationSettings, which keeps a default for anything wrong).
create or replace function public.set_quotation_settings(p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the quotation settings.';
  end if;
  if jsonb_typeof(p_value) is distinct from 'object' or pg_column_size(p_value) > 20000 then
    raise exception 'The settings must be one object of up to 20 kB.';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('quotations', p_value, timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
  set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_quotation_settings(jsonb) from public, anon;
grant execute on function public.set_quotation_settings(jsonb) to authenticated;

-- Which of the school's subjects a Fee Calculator subject is (Fee Calculator tick with edit).
create or replace function public.set_fee_subject_class_subject(p_fee_subject_id bigint, p_subject_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('fee_calculator', 'edit') then
    raise exception 'Only someone who may change the Fee Calculator can change this.';
  end if;
  update public.fee_subjects set subject_id = p_subject_id where id = p_fee_subject_id;
  if not found then
    raise exception 'Subject not found.';
  end if;
end;
$$;

revoke all on function public.set_fee_subject_class_subject(bigint, bigint) from public, anon;
grant execute on function public.set_fee_subject_class_subject(bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 5. After Razorpay's signed webhook (service role only).
-- ---------------------------------------------------------------------------------------------------------

-- Staff to tell: the EC who made it, the LC, and (for something to check) every active admin.
create or replace function public.quotation_notify(p_quotation_id uuid, p_title text, p_body text, p_admins boolean)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.staff_notifications (teacher_id, title, body, lead_id, student_id)
  select distinct t.id, left(p_title, 200), left(p_body, 1000), q.lead_id, q.student_id
  from public.quotations q
  join public.teachers t on t.is_active and (
    t.id in (q.sales_person_id, q.consultant_id)
    or (p_admins and t.role = 'admin')
  )
  where q.id = p_quotation_id;
$$;

revoke all on function public.quotation_notify(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.quotation_notify(uuid, text, text, boolean) to service_role;

-- A message or private note into the quotation's chat, through the automatic sender (department 2's queue:
-- kind 'note' and the 'secret' column come with their part; until then this records why it could not queue).
create or replace function public.queue_quotation_message(p_quotation_id uuid, p_what text, p_kind text, p_message text, p_secret boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.quotations%rowtype;
begin
  select * into q from public.quotations where id = p_quotation_id;
  if q.id is null or (q.conversation_id is null and q.phone is null) or nullif(btrim(p_message), '') is null then
    return false;
  end if;
  begin
    execute format(
      'insert into public.automation_queue (rule_key, rule_name, dedupe_key, phone, child_name, lead_id, student_id, message,
         status, due_at, expires_at, conversation_id, contact_id, channel, kind, secret)
       values (%L, %L, %L, %L, %L, %s, %s, %L, %L, now(), now() + interval %L, %s, %s, %L, %L, %L)
       on conflict (dedupe_key) do nothing',
      'quotation', left('Quotation ' || q.reference_no, 120),
      'quotation:' || q.id || ':' || p_what, q.phone, q.child_name,
      coalesce(q.lead_id::text, 'null'), coalesce(q.student_id::text, 'null'), left(p_message, 4000),
      'pending', '1 day', coalesce(q.conversation_id::text, 'null'), coalesce(q.contact_id::text, 'null'), 'whatsapp',
      p_kind, coalesce(p_secret, false)
    );
  exception when others then
    insert into public.quotation_events (quotation_id, kind, detail)
    values (q.id, 'check', jsonb_build_object('queue', p_what, 'error', left(sqlerrm, 300)));
    return false;
  end;
  insert into public.quotation_events (quotation_id, kind, detail) values (q.id, 'queued', jsonb_build_object('what', p_what));
  return true;
end;
$$;

revoke all on function public.queue_quotation_message(uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.queue_quotation_message(uuid, text, text, text, boolean) to service_role;

-- The webhook's decision "mark_paid" or "paid_but_check" (p_check_reason): the quotation is paid, once.
-- Returns false when it already was (a repeated event).
create or replace function public.mark_quotation_paid(
  p_quotation_id uuid,
  p_payment_id text,
  p_method text,
  p_amount_sen integer,
  p_check_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.quotations%rowtype;
begin
  select * into q from public.quotations where id = p_quotation_id for update;
  if q.id is null then
    raise exception 'Quotation not found.';
  end if;
  if q.status = 'paid' then
    return false;
  end if;
  update public.quotations
  set status = 'paid',
      rzp_payment_id = p_payment_id,
      payment_method = left(p_method, 40),
      paid_amount = round(p_amount_sen / 100.0, 2),
      paid_at = timezone('utc', now()),
      fulfil_status = case when p_check_reason is null then 'pending' else 'check' end,
      fulfil_error = left(p_check_reason, 1000)
  where id = q.id;
  insert into public.quotation_events (quotation_id, kind, detail)
  values (q.id, 'paid', jsonb_build_object('payment_id', p_payment_id, 'method', p_method, 'amount_sen', p_amount_sen, 'check', p_check_reason));
  if p_check_reason is not null then
    perform public.quotation_notify(q.id, 'Payment to check: ' || q.child_name,
      'RM' || to_char(p_amount_sen / 100.0, 'FM999990.00') || ' paid. Not enrolled automatically: ' || p_check_reason, true);
  end if;
  return true;
end;
$$;

revoke all on function public.mark_quotation_paid(uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.mark_quotation_paid(uuid, text, text, integer, text) to service_role;

-- Enrols the child of a paid quotation (department 3's enrol_paid_quotation does the student, Student fields,
-- classes, month plans and lead) and tells everyone. Safe to run again: a done quotation is left alone; a failed one
-- is tried again (the Inbox's "Run again"). Returns the result for the edge function.
create or replace function public.quotation_after_payment(p_quotation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.quotations%rowtype;
  v_result jsonb;
begin
  select * into q from public.quotations where id = p_quotation_id for update;
  if q.id is null then
    raise exception 'Quotation not found.';
  end if;
  if q.status <> 'paid' then
    return jsonb_build_object('ok', false, 'error', 'Not paid.');
  end if;
  if q.fulfil_status = 'done' then
    return jsonb_build_object('ok', true, 'already', true, 'student_id', q.student_id);
  end if;
  if q.fulfil_status = 'check' then
    return jsonb_build_object('ok', false, 'error', coalesce(q.fulfil_error, 'Waiting for a person to check.'));
  end if;

  begin
    execute 'select public.enrol_paid_quotation($1)' into v_result using q.id;
  exception when others then
    update public.quotations set fulfil_status = 'failed', fulfil_error = left(sqlerrm, 1000) where id = q.id;
    insert into public.quotation_events (quotation_id, kind, detail) values (q.id, 'fulfil_failed', jsonb_build_object('error', left(sqlerrm, 300)));
    perform public.quotation_notify(q.id, 'Paid but not enrolled: ' || q.child_name,
      'RM' || to_char(q.paid_amount, 'FM999990.00') || ' paid. Enrolling failed: ' || left(sqlerrm, 300) || ' Open the quotation in the Inbox and press Run again.', true);
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;

  update public.quotations
  set fulfil_status = 'done', fulfil_error = null, student_id = coalesce(student_id, (v_result ->> 'student_id')::bigint)
  where id = q.id
  returning * into q;
  insert into public.quotation_events (quotation_id, kind, detail) values (q.id, 'fulfilled', v_result);

  -- The EC and the LC are told by enrol_paid_quotation itself (department 3), so not again here.
  perform public.queue_quotation_message(q.id, 'paid_note', 'note',
    '已付款 RM' || to_char(q.paid_amount, 'FM999990.00') || '（报价单 ' || q.reference_no || '，' || coalesce(q.payment_method, '') || '）', false);
  return jsonb_build_object('ok', true, 'student_id', q.student_id, 'result', v_result);
end;
$$;

revoke all on function public.quotation_after_payment(uuid) from public, anon, authenticated;
grant execute on function public.quotation_after_payment(uuid) to service_role;
