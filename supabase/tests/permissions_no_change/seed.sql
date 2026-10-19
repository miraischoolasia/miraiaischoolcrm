-- Test accounts and one row in each table the permission rules touch. Scratch database only.
\set ON_ERROR_STOP 1
create schema if not exists t;
create table if not exists t.accounts (n int primary key, uid uuid, teacher_id bigint, label text);

insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'p' || n || '@mirai.internal', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 14) n;

-- n, role, active, personal ticks
with spec(n, role, active, perms, label) as (values
  (1, 'admin', true, '{}', 'admin'),
  (2, 'teacher', true, '{}', 'teacher no ticks'),
  (3, 'staff', true, '{"leads":{"level":"view"}}', 'leads view'),
  (4, 'staff', true, '{"leads":{"level":"edit","delete":true}}', 'leads edit+delete'),
  (5, 'staff', true, '{"students":{"level":"edit"}}', 'students edit'),
  (6, 'staff', true, '{"classrooms":{"level":"view"}}', 'classrooms view'),
  (7, 'staff', true, '{"calendar":{"level":"edit","delete":true}}', 'calendar edit+delete'),
  (8, 'staff', true, '{"forms":{"level":"edit","delete":true}}', 'forms edit+delete'),
  (9, 'staff', true, '{"activity":{"level":"view"},"team_replies":{"level":"view"}}', 'activity + team replies'),
  (10, 'teacher', true, '{"leads":{"level":"edit"},"classrooms":{"level":"edit","delete":true}}', 'teacher + leads/classrooms edit'),
  (11, 'staff', true, '{}', 'staff no ticks'),
  (12, 'staff', true, '{"calendar":{"level":"edit","delete":true},"classrooms":{"level":"edit","delete":true},"students":{"level":"edit","delete":true},"leads":{"level":"edit","delete":true},"forms":{"level":"edit","delete":true},"activity":{"level":"view"},"team_replies":{"level":"view"}}', 'every old tick'),
  (13, 'staff', false, '{"leads":{"level":"edit","delete":true}}', 'switched off, leads edit'),
  (14, 'staff', true, '{"students":{"level":"view"},"classrooms":{"level":"edit"}}', 'students view + classrooms edit')
)
insert into public.teachers (full_name, username, role, is_active, auth_user_id, permissions)
select 'Test ' || n, 'test_user_' || n, role, active, ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, perms::jsonb
from spec;

insert into t.accounts (n, uid, teacher_id, label)
select s.n, t.auth_user_id, t.id, 'x'
from generate_series(1, 14) s(n)
join public.teachers t on t.username = 'test_user_' || s.n;

set session_replication_role = replica;

insert into public.classrooms (id, name, age_group, program_level, teacher_id, category, status)
overriding system value
values (9001, 'Test class', 'Kids', 'Coder Foundation', (select teacher_id from t.accounts where n = 2), 'regular', 'active');

insert into public.students (id, full_name, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, classroom_id, teacher_id, is_active)
overriding system value
values (9001, 'Test student', current_date + 30, current_date + 30, current_date + 30, 9001, (select teacher_id from t.accounts where n = 2), true);

insert into public.leads (id, full_name, phone, source) overriding system value values (9001, 'Test lead', '60123456789', 'other');
insert into public.lead_channels (lead_id, channel, chatwoot_contact_id) values (9001, 'whatsapp', 77);
insert into public.inbox_chats (conversation_id, inbox_id, owner_id) values (501, 5, (select teacher_id from t.accounts where n = 4));
insert into public.inbox_messages (id, conversation_id, inbox_id, message_type, sender_kind, created_at, direction, source)
values (601, 501, 5, 0, 'parent', now() - interval '1 day', 'incoming', 'webhook');
insert into public.inbox_stickers (path) values ('test/sticker.webp');
insert into public.quick_replies (title, owner_id) values ('shared', null), ('mine', '00000000-0000-0000-0000-000000000004');
insert into public.automation_flows (id, name, trigger_type) overriding system value values (9001, 'Test flow', 'lead_created');
insert into public.automation_contacts (name, phone) values ('Lex', '60111111111');
insert into public.automation_queue (rule_key, rule_name, dedupe_key, message, status, phone) values ('k', 'n', 'test-1', 'hello', 'pending', '60123456789');
insert into public.automation_optouts (phone) values ('60122222222');
insert into public.automation_chat_optouts (contact_id) values (88);
insert into public.automation_flow_log (flow_id, event_key, kind) values (9001, 'e1', 'replied');
insert into public.ai_knowledge_notes (id, title) overriding system value values (9001, 'Test note');
insert into public.ai_knowledge_note_versions (note_id, title, body, written_at) values (9001, 'Test note', 'b', now());
insert into public.ai_drafts (chat_id, last_message_id) values (501, 601);
insert into public.channel_avatars (channel_key, avatar) values ('whatsapp:5', 'x');
insert into public.packages (name, kind, class_count, duration_months) values ('Test package', 'regular', 4, 1);
insert into public.questions (owner_id, kind, prompt) values ((select teacher_id from t.accounts where n = 2), 'short', 'What?');
insert into public.class_videos (classroom_id, title, year, month, bunny_library_id, bunny_video_id) values (9001, 'v', 2026, 10, '1', 'abc');
insert into public.calendar_items (kind, title, item_date, assignee_id) values
  ('task', 'For leads view', current_date, (select teacher_id from t.accounts where n = 3)),
  ('event', 'School event', current_date, null),
  ('meeting', 'Team meeting', current_date, null);
insert into public.team_reply_days (day, replier, staff_id, replies) values
  (current_date - 1, 'staff:' || (select teacher_id from t.accounts where n = 4), (select teacher_id from t.accounts where n = 4), 3),
  (current_date - 1, 'phone', null, 1);

set session_replication_role = origin;
