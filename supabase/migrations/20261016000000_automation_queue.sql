-- Automation queue: messages the automations (n8n) want to send, waiting for a person to approve.
--
-- * n8n decides who and what (timers and conditions live there) and adds a row here.
--   Nothing is sent from this table by itself.
-- * The team opens the approval queue in the CRM, ticks the ones to send (the text can be edited
--   first) and the inbox sends them through the same WhatsApp path as a normal reply.
-- * dedupe_key stops the same reminder being queued twice (for example 'trial:123:2026-10-18').
-- * Whoever can see Leads can read the queue; whoever can edit Leads can approve, edit the text
--   or skip. Only the automation itself adds rows (service role / its own database login), and
--   only an admin can delete rows or change the settings.
-- * automation_settings has one row: a pause switch every flow checks first, the most messages
--   that may go out in a day and the seconds to wait between two messages.

create table if not exists public.automation_queue (
  id bigint generated always as identity primary key,
  rule_key text not null check (char_length(btrim(rule_key)) between 1 and 60),
  rule_name text not null check (char_length(btrim(rule_name)) between 1 and 120),
  dedupe_key text not null unique check (char_length(dedupe_key) between 1 and 200),
  -- Digits only, with the country code (60...), as written on WhatsApp.
  phone text not null check (phone ~ '^[0-9]{8,15}$'),
  parent_name text check (parent_name is null or char_length(parent_name) <= 200),
  child_name text check (child_name is null or char_length(child_name) <= 200),
  lead_id bigint references public.leads (id) on delete set null,
  student_id bigint references public.students (id) on delete set null,
  message text not null check (char_length(btrim(message)) between 1 and 4000),
  -- pending: waiting for a person; sending: a person approved it and the inbox is sending;
  -- sent / failed: the result; skipped: a person said no; expired: no longer relevant.
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'expired')),
  due_at timestamptz not null default now(),
  expires_at timestamptz,
  decided_by uuid,
  decided_at timestamptz,
  sent_at timestamptz,
  error text check (error is null or char_length(error) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists automation_queue_status_due_idx
on public.automation_queue (status, due_at);

create index if not exists automation_queue_sent_at_idx
on public.automation_queue (sent_at)
where sent_at is not null;

alter table public.automation_queue enable row level security;

create policy "automation_queue_select_permitted"
on public.automation_queue
for select to authenticated
using ((select public.has_permission('leads')));

-- A person can only move a row on from pending (or retry a failed one); nobody can change who it
-- is for. Column grants below keep phone, rule and dedupe_key untouchable from the browser.
create policy "automation_queue_update_permitted"
on public.automation_queue
for update to authenticated
using (
  (select public.has_permission('leads', 'edit'))
  and status in ('pending', 'sending', 'failed')
)
with check ((select public.has_permission('leads', 'edit')));

create policy "automation_queue_delete_admin"
on public.automation_queue
for delete to authenticated
using ((select public.is_admin()));

revoke all on public.automation_queue from anon, authenticated;
grant select on public.automation_queue to authenticated;
grant update (message, status, decided_by, decided_at, sent_at, error)
on public.automation_queue to authenticated;
grant delete on public.automation_queue to authenticated;

create table if not exists public.automation_settings (
  id boolean primary key default true check (id),
  paused boolean not null default false,
  daily_cap integer not null default 40 check (daily_cap between 1 and 200),
  gap_seconds integer not null default 30 check (gap_seconds between 10 and 600),
  updated_at timestamptz not null default now()
);

insert into public.automation_settings (id) values (true)
on conflict (id) do nothing;

alter table public.automation_settings enable row level security;

create policy "automation_settings_select_permitted"
on public.automation_settings
for select to authenticated
using ((select public.has_permission('leads')));

create policy "automation_settings_update_admin"
on public.automation_settings
for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

revoke all on public.automation_settings from anon, authenticated;
grant select on public.automation_settings to authenticated;
grant update (paused, daily_cap, gap_seconds, updated_at)
on public.automation_settings to authenticated;
