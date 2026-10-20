-- How each WhatsApp number is doing, so the CRM can warn by itself (a red bar with the next step) instead of
-- someone finding out later. The server's watcher (wa-watch on the WhatsApp server) looks at every number every
-- 30 seconds and writes here through report_whatsapp_number_status(), with a key of its own (as the auto sender).
--
--   status            connected     working
--                     reconnecting  the connection dropped and is coming back by itself (show after 10 minutes)
--                     logged_out    logged out, or the phone removed the linked device: scan the QR again
--                     replaced      the same number was linked somewhere else
--                     restricted    WhatsApp restricted or banned the number (also: many sends failing at once)
--                     needs_qr      never linked, or the QR ran out
--                     quiet         linked, but no parent message for 2 hours in working hours
--                     null          not looked at yet: show nothing
--   status_reason     what WhatsApp / Evolution said (for an admin, e.g. "401 device_removed")
--   status_changed_at when the status last changed
--   status_checked_at when the watcher last looked (written at most every 5 minutes while nothing changes)
--   last_message_at   the last message from a parent on this number
--
-- The CRM only reads these (the existing select rule of whatsapp_numbers).

alter table public.whatsapp_numbers
  add column if not exists status text
    check (status is null or status in ('connected', 'reconnecting', 'logged_out', 'replaced', 'restricted', 'needs_qr', 'quiet')),
  add column if not exists status_reason text check (status_reason is null or char_length(status_reason) <= 300),
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_checked_at timestamptz,
  add column if not exists last_message_at timestamptz;

-- The watcher's key (it calls with the public key and this one).
create table if not exists public.whatsapp_status_reporter (
  id boolean primary key default true check (id),
  reporter_key text not null
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);

insert into public.whatsapp_status_reporter (id) values (true) on conflict (id) do nothing;

alter table public.whatsapp_status_reporter enable row level security;
revoke all on public.whatsapp_status_reporter from public, anon, authenticated;

-- One number's state. A number the CRM has no row for yet (one linked before the Numbers window) gets one, by its
-- Chatwoot inbox; a row that has the inbox but no number name is only given the state (its settings stay the admin's).
create or replace function public.report_whatsapp_number_status(
  p_key text,
  p_instance text,
  p_inbox_id integer,
  p_status text,
  p_reason text default null,
  p_last_message_at timestamptz default null,
  p_label text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored text;
begin
  select r.reporter_key into stored from public.whatsapp_status_reporter r limit 1;
  if p_key is null or stored is null or p_key <> stored then
    raise exception 'not allowed' using errcode = '28000';
  end if;
  if p_status is null or p_status not in ('connected', 'reconnecting', 'logged_out', 'replaced', 'restricted', 'needs_qr', 'quiet') then
    raise exception 'unknown status';
  end if;
  if p_instance is null or p_instance !~ '^[A-Za-z0-9_-]{1,60}$' then
    raise exception 'bad number name';
  end if;

  update public.whatsapp_numbers n
  set status_changed_at = case when n.status is distinct from p_status then now() else n.status_changed_at end,
      status = p_status,
      status_reason = left(p_reason, 300),
      status_checked_at = now(),
      last_message_at = coalesce(p_last_message_at, n.last_message_at)
  where n.evolution_instance = p_instance;
  if found or p_inbox_id is null then
    return;
  end if;

  update public.whatsapp_numbers n
  set status_changed_at = case when n.status is distinct from p_status then now() else n.status_changed_at end,
      status = p_status,
      status_reason = left(p_reason, 300),
      status_checked_at = now(),
      last_message_at = coalesce(p_last_message_at, n.last_message_at)
  where n.chatwoot_inbox_id = p_inbox_id;
  if found then
    return;
  end if;

  insert into public.whatsapp_numbers
    (label, chatwoot_inbox_id, evolution_instance, is_active, status, status_reason, status_changed_at, status_checked_at, last_message_at)
  values
    (left(coalesce(nullif(btrim(p_label), ''), p_instance), 60), p_inbox_id, p_instance, true, p_status, left(p_reason, 300),
     now(), now(), p_last_message_at);
end;
$$;

revoke all on function public.report_whatsapp_number_status(text, text, integer, text, text, timestamptz, text) from public;
grant execute on function public.report_whatsapp_number_status(text, text, integer, text, text, timestamptz, text) to anon, authenticated;
