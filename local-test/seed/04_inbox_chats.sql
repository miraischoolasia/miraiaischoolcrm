-- FAKE Inbox: the CRM's own copy of some chats (inbox_chats / inbox_messages), in Chatwoot's API shape.
-- There is no Chatwoot here, so the Inbox page can read and search these chats, but sending, QR codes and
-- the phone's read ticks are not real (see docs/local-test-env.md).
\set ON_ERROR_STOP on
begin;

insert into public.inbox_channels (chatwoot_inbox_id, kind, label, access, is_active) values
  (1, 'whatsapp',  'Demo WhatsApp',  'open', true),
  (2, 'messenger', 'Demo Messenger', 'open', true)
on conflict (chatwoot_inbox_id) do nothing;

insert into public.whatsapp_numbers (label, phone, chatwoot_inbox_id, evolution_instance, is_active) values
  ('Demo WhatsApp', '60100000001', 1, 'demo', true);
-- once a number is in the list, staff see only the numbers given to them: both staff accounts get this one
insert into public.whatsapp_number_staff (number_id, teacher_id)
select n.id, t.id from public.whatsapp_numbers n cross join public.teachers t where n.chatwoot_inbox_id = 1 and t.username in ('staff_test', 'staff2_test');

-- one chat per row: id, inbox, contact id, name, phone, messenger id, unread messages today, status, channel
create temp table _chat (cid bigint, inbox bigint, contact bigint, cname text, phone text, ident text, unread int, status text, channel text);
insert into _chat values
  (101, 1, 1, 'Demo Parent One',   '60100000031', null,     3, 'open',     'Channel::Api'),         -- a new lead writing, nobody answered
  (102, 1, 2, 'Demo Parent Two',   '60100000032', null,     0, 'open',     'Channel::Api'),         -- answered
  (103, 1, 3, 'Demo Parent Aiden', '60100000011', null,     0, 'open',     'Channel::Api'),         -- a family of the school
  (104, 1, 4, 'Demo Parent Four',  '60100000034', null,     1, 'open',     'Channel::Api'),
  (105, 1, 5, 'Demo Parent Five',  '60100000035', null,     0, 'resolved', 'Channel::Api'),         -- done
  (106, 1, 6, 'Demo Caleb',        '60100000042', null,     0, 'open',     'Channel::Api'),         -- a child's OWN number (see below)
  (107, 2, 7, 'Demo Messenger Mum', null,         'fb-demo-1', 2, 'open',  'Channel::FacebookPage'); -- Messenger, no phone

-- the child's own chat: Demo Caleb writes from his own number, the lead (parent) is Demo Parent Caleb
insert into public.people (kind, full_name, phone, chatwoot_contact_id, parent_id, student_id)
select 'contact', 'Demo Caleb (own number)', '60100000042', 6, null, null
where not exists (select 1 from public.people where phone = '60100000042');
update public.people set kind = 'student', full_name = 'Demo Caleb', student_id = 3,
  parent_id = (select id from public.people where kind = 'parent' and phone = '60100000012')
where phone = '60100000042' and kind = 'contact' and not exists (select 1 from public.people where student_id = 3 and phone is not null);

-- messages: 9 earlier days (a parent writes, the front desk answers within minutes) + today
create temp table _msg (id bigint, cid bigint, mtype int, at timestamptz, body text, staff bigint);
insert into _msg
select 10000 + row_number() over (order by c.cid, d.n, k.k), c.cid, k.k,
  (current_date - d.n) + time '09:00' + (c.cid % 7) * interval '17 minutes' + k.k * (5 + c.cid % 9) * interval '1 minute',
  case when k.k = 0 then (array['Hi, is there a place in the Math class?','What is the fee for 6 months?','Can my child change to Wednesday?','Thank you!','Is the class on Zoom?'])[1 + (d.n + c.cid) % 5]
       else (array['Hello! Yes, we have a place. I will check and tell you.','The 6-month package is on the Packages page.','Sure, I will arrange it for you.','You are welcome!','Yes, the Zoom link is in the app.'])[1 + (d.n + c.cid) % 5] end,
  case when k.k = 1 and c.cid % 3 = 0 then 5 when k.k = 1 and c.cid % 3 = 1 then 1 else null end
from _chat c
cross join generate_series(1, 9) d(n)
cross join (values (0), (1)) k(k)
where c.cid <> 107 or d.n <= 3;

-- today: unread chats have only parent messages; the others a message and an answer
insert into _msg
select 20000 + row_number() over (order by c.cid, g.i), c.cid, 0,
  now() - interval '90 minutes' + g.i * interval '6 minutes', 'Hello, I would like to ask a question (' || g.i || ')', null
from _chat c cross join generate_series(1, 3) g(i) where g.i <= c.unread;
insert into _msg
select 21000 + c.cid, c.cid, 1, now() - interval '30 minutes', 'Noted, we will get back to you shortly.', 5 from _chat c where c.unread = 0 and c.status = 'open';

insert into public.inbox_messages (id, account_id, conversation_id, inbox_id, message_type, direction, sender_kind, staff_id, content, attachments, private, deleted, edited, created_at, source, raw)
select m.id, 1, m.cid, c.inbox, m.mtype, case when m.mtype = 0 then 'incoming' else 'outgoing' end,
  case when m.mtype = 0 then 'parent' when m.staff is null then 'phone' else 'staff' end, m.staff, m.body, '[]', false, false, false, m.at, 'copy',
  jsonb_build_object('id', m.id, 'content', m.body, 'content_type', 'text', 'message_type', m.mtype, 'created_at', extract(epoch from m.at)::bigint,
    'private', false, 'status', 'sent', 'source_id', 'WAID:DEMO' || m.id,
    'content_attributes', case when m.staff is null then '{}'::jsonb else jsonb_build_object('crm_sender', jsonb_build_object('id', m.staff, 'name', case m.staff when 5 then 'Staff Front Desk (test)' else 'Admin Test' end)) end,
    'attachments', '[]'::jsonb,
    'sender', jsonb_build_object('name', case when m.mtype = 0 then c.cname else 'School' end, 'type', case when m.mtype = 0 then 'contact' else 'user' end),
    'conversation_id', m.cid)
from _msg m join _chat c on c.cid = m.cid;

insert into public.inbox_chats (conversation_id, account_id, inbox_id, channel, contact_id, contact_name, contact_phone, contact_identifier, status, unread_count,
  waiting_since, last_activity_at, last_message_id, last_message_at, last_message_preview, copied_at, copied_through_message_id, needs_copy, raw, last_message_raw)
select c.cid, 1, c.inbox, c.channel, c.contact, c.cname, c.phone, c.ident, c.status, c.unread,
  case when c.unread > 0 then last.at end, last.at, last.id, last.at, left(last.body, 80), now(), last.id, false,
  jsonb_build_object('id', c.cid, 'inbox_id', c.inbox, 'status', c.status, 'unread_count', c.unread,
    'waiting_since', case when c.unread > 0 then extract(epoch from last.at)::bigint else 0 end,
    'timestamp', extract(epoch from last.at)::bigint, 'last_activity_at', extract(epoch from last.at)::bigint,
    'custom_attributes', '{}'::jsonb, 'labels', '[]'::jsonb,
    'meta', jsonb_build_object('channel', c.channel, 'sender', jsonb_build_object('id', c.contact, 'name', c.cname, 'phone_number', case when c.phone is not null then '+' || c.phone end, 'identifier', c.ident, 'thumbnail', ''))),
  (select raw from public.inbox_messages where id = last.id)
from _chat c
join lateral (select id, at, body from _msg where cid = c.cid order by at desc limit 1) last on true;

commit;
