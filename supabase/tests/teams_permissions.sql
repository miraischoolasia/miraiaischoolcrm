-- Checks for 20261026000000_teams_permissions .. 20261026030000_staff_hours (docs/teams-permissions-design.md).
-- Run on a scratch database that has every migration (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/teams_permissions.sql
-- Every check prints PASS; the first failure stops the run.
-- The "nobody changes on the day it goes live" check is a separate before/after comparison: see
-- supabase/tests/permissions_no_change/README.md.

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

create function pg_temp.fails(p_sql text, p_pattern text, p_name text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then
      raise notice 'PASS %', p_name;
      return;
    end if;
    raise exception 'FAIL % (wrong error: %)', p_name, sqlerrm;
  end;
  raise exception 'FAIL % (no error)', p_name;
end;
$$;

-- How many rows a statement changed.
create function pg_temp.affected(p_sql text) returns bigint language plpgsql as $$
declare
  v_rows bigint;
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- Accounts: 1 admin, 2 Amin (staff), 3 Bella (staff), 4 Chen (teacher), 5 Dina (staff).
insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'tp' || n || '@mirai.internal',
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 5) n;

insert into public.teachers (id, full_name, username, role, is_active, auth_user_id, permissions)
overriding system value
values
  (9101, 'TP Admin', 'tp_admin', 'admin', true, '00000000-0000-0000-0000-000000000101', '{}'),
  (9102, 'Amin', 'tp_amin', 'staff', true, '00000000-0000-0000-0000-000000000102', '{}'),
  (9103, 'Bella', 'tp_bella', 'staff', true, '00000000-0000-0000-0000-000000000103', '{"forms": {"level": "view"}}'),
  (9104, 'Chen', 'tp_chen', 'teacher', true, '00000000-0000-0000-0000-000000000104', '{}'),
  (9105, 'Dina', 'tp_dina', 'staff', true, '00000000-0000-0000-0000-000000000105', '{"inbox": {"level": "view"}}');

create function pg_temp.as_user(p_n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001' || lpad(p_n::text, 2, '0'), true);
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000001' || lpad(p_n::text, 2, '0'), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function pg_temp.as_user(int) to authenticated;
grant execute on function pg_temp.ok(boolean, text) to authenticated;
grant execute on function pg_temp.fails(text, text, text) to authenticated;
grant execute on function pg_temp.affected(text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Teams give ticks.
-- ---------------------------------------------------------------------------------------------------------

select pg_temp.as_user(1);
set local role authenticated;
select public.save_team(null, 'Sales', '#fc0c97', 'Follows up leads',
  '{"leads": {"level": "edit", "scope": "own"}, "inbox": {"level": "edit"}}'::jsonb, true) as sales \gset
select public.save_team(null, 'Office', null, null,
  '{"leads": {"level": "view"}, "students": {"level": "edit", "delete": true}}'::jsonb, true) as office \gset
select pg_temp.ok((select count(*) from public.teams where name in ('Sales', 'Office')) = 2, 'an admin makes teams');
select public.set_team_members(:sales, array[9102, 9103]);
select public.set_account_teams(9102, array[:sales, :office]::bigint[]);
reset role;

select pg_temp.as_user(2);
set local role authenticated;
select pg_temp.ok(public.has_permission('leads', 'edit'), 'Amin may edit leads (Sales)');
select pg_temp.ok(public.has_permission('students', 'delete'), 'Amin may delete students (Office): several teams add up');
select pg_temp.ok(public.permission_scope('leads', 'view') = 'all', 'Amin sees all leads (Office gives all)');
select pg_temp.ok(public.permission_scope('leads', 'edit') = 'own', 'but edits only his own (only Sales gives edit, and only own)');
select pg_temp.ok(not public.has_permission('forms'), 'no team gives Forms');
select pg_temp.fails($$select public.save_team(null, 'Mine', null, null, '{"leads": {"level": "edit"}}'::jsonb, true)$$,
  'Only an admin', 'only an admin makes a team');
select pg_temp.fails($$select public.set_team_members(1, array[9102])$$, 'Only an admin', 'only an admin changes members');
select pg_temp.fails($$insert into public.teams (name) values ('x')$$, 'permission denied', 'nobody writes teams directly');
select pg_temp.fails($$insert into public.team_members (team_id, teacher_id) values (1, 9102)$$, 'permission denied', 'nobody writes members directly');
select pg_temp.ok((select count(*) from public.teams) >= 2, 'staff read the team names (calendar filter)');
select pg_temp.ok((select count(*) from public.team_members where teacher_id = 9102) = 2, 'and who is in them');
reset role;

select pg_temp.as_user(3);
set local role authenticated;
select pg_temp.ok(public.has_permission('leads', 'edit') and public.has_permission('forms'), 'Bella: Sales plus her own Forms tick');
select pg_temp.ok(public.permission_scope('leads', 'view') = 'own', 'Bella sees only her own leads');
reset role;

-- A switched-off team gives nothing; taking someone out takes its ticks away.
select pg_temp.as_user(1);
set local role authenticated;
select public.save_team(:office, 'Office', null, null,
  '{"leads": {"level": "view"}, "students": {"level": "edit", "delete": true}}'::jsonb, false);
reset role;
select pg_temp.ok(not ((select effective_permissions from public.teachers where id = 9102) ? 'students'), 'switching a team off takes its ticks away');
select pg_temp.as_user(1);
set local role authenticated;
select public.save_team(:office, 'Office', null, null,
  '{"leads": {"level": "view"}, "students": {"level": "edit", "delete": true}}'::jsonb, true);
select public.set_team_members(:sales, array[9102]);
reset role;
select pg_temp.ok((select effective_permissions = '{"forms": {"level": "view", "scope": "all", "delete": false}}'::jsonb from public.teachers where id = 9103),
  'out of the team: only her own tick is left');
select pg_temp.ok((select effective_permissions -> 'students' ->> 'level' = 'edit' from public.teachers where id = 9102), 'back on: Office counts again');

-- A personal tick saved the old way still adds to the teams.
select pg_temp.as_user(1);
set local role authenticated;
select public.set_account_permissions(9102, '{"forms": {"level": "edit"}}'::jsonb);
reset role;
select pg_temp.ok((select effective_permissions ?& array['forms', 'leads', 'students'] from public.teachers where id = 9102), 'own ticks and team ticks together');
select pg_temp.fails($$update public.teachers set permissions = '{"calendar": {"level": "view", "scope": "own"}}' where id = 9102$$,
  'teachers_permissions_valid', 'the class ticks have no scope');
select pg_temp.fails($$update public.teachers set permissions = '{"activity": {"level": "edit"}}' where id = 9102$$,
  'teachers_permissions_valid', 'view-only pages stay view-only');
select pg_temp.fails($$update public.teachers set permissions = '{"leads": {"level": "view", "extra": 1}}' where id = 9102$$,
  'teachers_permissions_valid', 'no unknown keys');
-- Writing the total by hand does nothing.
update public.teachers set effective_permissions = '{"packages": {"level": "edit"}}' where id = 9103;
select pg_temp.ok((select not (effective_permissions ? 'packages') from public.teachers where id = 9103), 'the total cannot be written by hand');

-- ---------------------------------------------------------------------------------------------------------
-- Whose leads.
-- ---------------------------------------------------------------------------------------------------------

insert into public.lead_options (id, kind, label) overriding system value values (9201, 'pic', 'Amin'), (9202, 'pic', 'Bella');
select pg_temp.as_user(2);
set local role authenticated;
select pg_temp.fails($$update public.lead_options set teacher_id = 9102 where id = 9201$$, 'Only an admin', 'only an admin links a PIC to an account');
reset role;
select pg_temp.as_user(1);
set local role authenticated;
update public.lead_options set teacher_id = 9102 where id = 9201;
update public.lead_options set teacher_id = 9103 where id = 9202;
reset role;
select pg_temp.fails($$update public.lead_options set teacher_id = 9102 where id = 9202$$, 'unique|duplicate', 'one PIC name per account');

insert into public.leads (id, full_name, phone, source, pic_id) overriding system value values
  (9301, 'Lead of Amin', '60100000001', 'other', 9201),
  (9302, 'Lead of Bella', '60100000002', 'other', 9202),
  (9303, 'Lead of nobody', '60100000003', 'other', null);

-- Bella back in Sales (leads edit, own), with "own + unassigned" this time.
select pg_temp.as_user(1);
set local role authenticated;
select public.save_team(:sales, 'Sales', '#fc0c97', null,
  '{"leads": {"level": "edit", "scope": "own_unassigned"}, "inbox": {"level": "edit", "scope": "own"}}'::jsonb, true);
select public.set_team_members(:sales, array[9102, 9103]);
reset role;

select pg_temp.as_user(3);
set local role authenticated;
select pg_temp.ok((select array_agg(id order by id) from public.leads where id between 9301 and 9303) = '{9302,9303}',
  'own + unassigned: her lead and the one of nobody');
select pg_temp.ok(pg_temp.affected($q$update public.leads set full_name = full_name where id = 9301$q$) = 0,
  'she cannot change Amin''s lead');
select pg_temp.fails($$update public.leads set pic_id = 9201 where id = 9302$$, 'row-level security', 'nor hand her lead to Amin');
select pg_temp.fails($$insert into public.leads (full_name, phone, source, pic_id) values ('x', '60100000009', 'other', 9201)$$,
  'row-level security', 'nor make a lead for Amin');
select pg_temp.ok(pg_temp.affected($q$update public.leads set pic_id = 9202 where id = 9303$q$) = 1,
  'she takes the lead of nobody');
reset role;

select pg_temp.as_user(2);
set local role authenticated;
select pg_temp.ok((select count(*) from public.leads where id between 9301 and 9303) = 3, 'Amin sees them all (Office)');
select pg_temp.ok(pg_temp.affected($q$update public.leads set full_name = full_name where id between 9301 and 9303$q$) = 1,
  'and changes only his own (Sales, own + unassigned; the lead of nobody is Bella''s now)');
reset role;

-- ---------------------------------------------------------------------------------------------------------
-- Whose chats, and which channels.
-- ---------------------------------------------------------------------------------------------------------

insert into public.inbox_chats (conversation_id, inbox_id, owner_id) values
  (9401, 5, 9102), (9402, 5, 9103), (9403, 5, null), (9404, 6, 9103), (9405, 7, 9103);
insert into public.inbox_messages (id, conversation_id, inbox_id, message_type, sender_kind, created_at, direction, source) values
  (9501, 9401, 5, 0, 'parent', now(), 'incoming', 'webhook'),
  (9502, 9402, 5, 0, 'parent', now(), 'incoming', 'webhook'),
  (9503, 9403, 5, 0, 'parent', now(), 'incoming', 'webhook'),
  (9504, 9404, 6, 0, 'parent', now(), 'incoming', 'webhook'),
  (9505, 9405, 7, 0, 'parent', now(), 'incoming', 'webhook');

select pg_temp.as_user(3);
set local role authenticated;
select pg_temp.ok((select array_agg(conversation_id order by conversation_id) from public.inbox_chats where conversation_id between 9401 and 9405) = '{9402,9404,9405}',
  'Inbox own: Bella sees only the chats she owns');
select pg_temp.ok((select array_agg(id order by id) from public.inbox_messages where id between 9501 and 9505) = '{9502,9504,9505}',
  'and only their messages');
select pg_temp.ok(public.inbox_conversation_access(9401) = 'none', 'the gateway refuses Amin''s chat to her');
select pg_temp.ok(public.inbox_conversation_access(9402) = 'reply', 'and lets her answer her own');
select pg_temp.ok(public.inbox_conversation_access(999999) = 'unknown', 'a chat the copy has not seen: the tick decides');
select pg_temp.ok(public.my_whatsapp_inbox_ids() is null, 'no limited channel yet: no restriction');
reset role;

-- Number 6 is limited: Sales may look, Amin may answer. Inbox 7 (say Messenger) stays open.
select pg_temp.as_user(1);
set local role authenticated;
select public.set_inbox_channel(6, 'whatsapp', 'Sales number', 'limited',
  jsonb_build_array(jsonb_build_object('team_id', :sales, 'level', 'view'), jsonb_build_object('teacher_id', 9102, 'level', 'reply')), true);
select public.set_inbox_channel(7, 'messenger', 'Facebook Page', 'open', '[]'::jsonb, true);
reset role;

select pg_temp.as_user(3);
set local role authenticated;
select pg_temp.ok(public.inbox_access_level(6) = 'view', 'Bella may look at number 6 (Sales: view)');
select pg_temp.ok(public.inbox_conversation_access(9404) = 'view', 'so the gateway lets her read, not answer');
select pg_temp.ok(public.inbox_access_level(7) = 'reply', 'the open channel: her Inbox tick decides');
reset role;

select pg_temp.as_user(2);
set local role authenticated;
select pg_temp.ok(public.inbox_access_level(6) = 'reply', 'Amin may answer on number 6');
reset role;

select pg_temp.as_user(5);
set local role authenticated;
select pg_temp.ok(public.inbox_access_level(6) is null, 'Dina is not given number 6');
select pg_temp.ok((select count(*) from public.inbox_chats where conversation_id = 9404) = 0, 'so its chats are not in her inbox copy');
select pg_temp.ok((select count(*) from public.inbox_messages where id = 9504) = 0, 'nor their messages');
select pg_temp.ok(public.my_whatsapp_inbox_ids() @> array[5, 7] and not (public.my_whatsapp_inbox_ids() @> array[6]),
  'the Inbox page list: every channel but number 6');
select pg_temp.ok(public.inbox_access_level(7) = 'view', 'only the Inbox to look at: never more than view');
select pg_temp.ok(public.inbox_conversation_access(9405) = 'view', 'the gateway does not let her answer');
select pg_temp.fails($$select public.set_inbox_channel(6, 'whatsapp', 'x', 'open', '[]'::jsonb, true)$$, 'Only an admin', 'only an admin opens a channel');
reset role;

-- A number ticked in the old Numbers window still works.
insert into public.whatsapp_numbers (id, label, chatwoot_inbox_id) overriding system value values (9601, 'Second', 8);
insert into public.whatsapp_number_staff (number_id, teacher_id) values (9601, 9105);
select pg_temp.ok((select access = 'limited' from public.inbox_channels where chatwoot_inbox_id = 8), 'a new number is a limited channel');
select pg_temp.as_user(5);
set local role authenticated;
select pg_temp.ok(public.inbox_access_level(8) = 'view', 'Dina, ticked for it, may use it (view: her Inbox tick is view)');
reset role;
select pg_temp.as_user(3);
set local role authenticated;
select pg_temp.ok(public.inbox_access_level(8) is null, 'Bella, not ticked, may not');
reset role;

-- ---------------------------------------------------------------------------------------------------------
-- Team Replies: own row only.
-- ---------------------------------------------------------------------------------------------------------

insert into public.team_reply_days (day, replier, staff_id, replies) values
  (date '2026-09-01', 'staff:9102', 9102, 2), (date '2026-09-01', 'staff:9103', 9103, 4), (date '2026-09-01', 'phone', null, 1);
select pg_temp.as_user(1);
set local role authenticated;
select public.save_team(:office, 'Office', null, null,
  '{"leads": {"level": "view"}, "students": {"level": "edit", "delete": true}, "team_replies": {"level": "view", "scope": "own"}}'::jsonb, true);
reset role;
select pg_temp.as_user(2);
set local role authenticated;
select pg_temp.ok((select array_agg(replier) from public.team_reply_days where day = '2026-09-01') = '{staff:9102}', 'Team Replies own: Amin sees his own row');
reset role;

-- ---------------------------------------------------------------------------------------------------------
-- Working hours.
-- ---------------------------------------------------------------------------------------------------------

-- No week, no opening hours: the whole clock, as before.
select pg_temp.ok(public.duty_seconds(9102, '2026-10-20 23:00+08', '2026-10-21 09:05+08') = 36300, 'no week: every second counts');

select pg_temp.as_user(2);
set local role authenticated;
select pg_temp.fails($$select public.save_staff_week(9102, '[]'::jsonb)$$, 'Only an admin', 'only an admin sets working hours');
select pg_temp.ok((select count(*) from public.staff_shifts where teacher_id = 9103) = 0, 'staff see no one else''s week');
reset role;

select pg_temp.as_user(1);
set local role authenticated;
select pg_temp.fails($$select public.save_staff_week(9102, '[{"weekday": 1, "start": "18:00", "end": "09:00"}]'::jsonb)$$,
  'start before its end', 'a time must start before it ends');
-- Monday to Friday 09:00-18:00.
select public.save_staff_week(9102, (select jsonb_agg(jsonb_build_object('weekday', d, 'start', '09:00', 'end', '18:00')) from generate_series(1, 5) d));
reset role;
select pg_temp.ok((select min(effective_from) = '2000-01-01' from public.staff_shifts where teacher_id = 9102), 'the first week counts for the past too');
-- Tuesday 23:00 to Wednesday 09:05: 5 minutes of work.
select pg_temp.ok(public.duty_seconds(9102, '2026-10-20 23:00+08', '2026-10-21 09:05+08') = 300, 'a night wait counts from the start of work');
-- Saturday: no work at all.
select pg_temp.ok(public.duty_seconds(9102, '2026-10-24 10:00+08', '2026-10-24 12:00+08') = 0, 'a day off in the week counts nothing');

-- Time off on Wednesday morning, extra time on Saturday.
select pg_temp.as_user(1);
set local role authenticated;
select public.add_roster_change(9102, '2026-10-21 00:00+08', '2026-10-21 12:00+08', 'off', 'Sick leave') as leave_id \gset
select public.add_roster_change(9102, '2026-10-24 10:00+08', '2026-10-24 11:00+08', 'extra', null);
reset role;
select pg_temp.ok(public.duty_seconds(9102, '2026-10-20 23:00+08', '2026-10-21 09:05+08') = 0, 'time off counts nothing');
select pg_temp.ok(public.duty_seconds(9102, '2026-10-21 11:00+08', '2026-10-21 13:00+08') = 3600, 'work starts again when the time off ends');
select pg_temp.ok(public.duty_seconds(9102, '2026-10-24 10:00+08', '2026-10-24 12:00+08') = 3600, 'extra time counts');

-- A swap: Amin is off on Thursday afternoon, Bella works instead.
select pg_temp.as_user(1);
set local role authenticated;
select public.add_shift_swap(9102, 9103, '2026-10-22 14:00+08', '2026-10-22 18:00+08', 'Swap', null) as swap \gset
reset role;
select pg_temp.ok(public.duty_seconds(9102, '2026-10-22 13:00+08', '2026-10-22 18:00+08') = 3600, 'the one who swapped away works only the hour before');
select pg_temp.ok((select count(*) from public.staff_roster_changes where swap_id = :'swap') = 2, 'a swap is two rows');
select pg_temp.as_user(1);
set local role authenticated;
select public.delete_roster_change((select id from public.staff_roster_changes where swap_id = :'swap' and change = 'extra'));
reset role;
select pg_temp.ok((select count(*) from public.staff_roster_changes where swap_id = :'swap') = 0, 'removing one half removes the swap');

-- A new week from a day on keeps the old one for the days before.
select pg_temp.as_user(1);
set local role authenticated;
select public.save_staff_week(9102, '[{"weekday": 3, "start": "14:00", "end": "22:00"}]'::jsonb, '2026-11-01');
reset role;
select pg_temp.ok(public.duty_seconds(9102, '2026-10-28 08:00+08', '2026-10-28 23:00+08') = 9 * 3600, 'an old Wednesday: the old week');
select pg_temp.ok(public.duty_seconds(9102, '2026-11-04 08:00+08', '2026-11-04 23:00+08') = 8 * 3600, 'a new Wednesday: the new week');

-- The school's opening hours for whoever has no week (and the phone).
select pg_temp.as_user(2);
set local role authenticated;
select pg_temp.fails($$select public.set_business_hours('{"days": {}}'::jsonb)$$, 'not allowed', 'Class Settings tick needed for opening hours');
reset role;
select pg_temp.as_user(1);
set local role authenticated;
select pg_temp.fails($$select public.set_business_hours('{"days": {"1": [{"start": "18:00", "end": "09:00"}]}}'::jsonb)$$, 'not valid', 'opening hours must make sense');
select public.set_business_hours('{"days": {"2": [{"start": "10:00", "end": "19:00"}]}}'::jsonb);
select public.set_leave_reasons('["Annual leave", "Medical leave"]'::jsonb);
reset role;
select pg_temp.ok(public.duty_seconds(null, '2026-10-20 09:00+08', '2026-10-20 11:00+08') = 3600, 'the phone: opening hours (Tuesday 10:00-19:00)');
select pg_temp.ok(public.duty_seconds(9103, '2026-10-20 09:00+08', '2026-10-20 11:00+08') = 3600, 'Bella has no week: opening hours');
select pg_temp.ok((select value = '["Annual leave", "Medical leave"]'::jsonb from public.app_settings where key = 'leave_reasons'), 'each school names its kinds of time off');
select pg_temp.ok(public.team_hours_in_use(), 'the page knows working hours are in use');
delete from public.app_settings where key = 'business_hours';

-- ---------------------------------------------------------------------------------------------------------
-- Team Replies with working hours: the clock waits do not change (same day as supabase/tests/inbox_copy_and_team_replies.sql).
-- ---------------------------------------------------------------------------------------------------------

delete from public.staff_shifts;
delete from public.staff_roster_changes;
delete from public.inbox_messages;
insert into public.inbox_messages (id, conversation_id, inbox_id, message_type, sender_kind, staff_id, created_at, direction, source, private, deleted)
values
  (300, 30, 5, 0, 'parent', null, '2026-10-17 23:50:00+08', 'incoming', 'webhook', false, false),
  (301, 30, 5, 0, 'parent', null, '2026-10-17 23:55:00+08', 'incoming', 'webhook', false, false),
  (302, 30, 5, 1, 'staff', 3, '2026-10-18 00:10:00+08', 'outgoing', 'webhook', false, false),
  (303, 30, 5, 1, 'staff', 3, '2026-10-18 00:12:00+08', 'outgoing', 'webhook', false, false),
  (310, 31, 5, 0, 'parent', null, '2026-10-18 09:00:00+08', 'incoming', 'webhook', false, false),
  (311, 31, 5, 1, 'automation', null, '2026-10-18 09:01:00+08', 'outgoing', 'webhook', false, false),
  (312, 31, 5, 1, 'phone', null, '2026-10-18 09:30:00+08', 'outgoing', 'webhook', false, false),
  (313, 31, 5, 0, 'parent', null, '2026-10-18 10:00:00+08', 'incoming', 'webhook', false, false),
  (314, 31, 5, 1, 'staff', 4, '2026-10-18 10:30:00+08', 'outgoing', 'webhook', true, false),
  (315, 31, 5, 1, 'staff', 4, '2026-10-18 10:40:00+08', 'outgoing', 'webhook', false, true),
  (316, 31, 5, 1, 'staff', 4, '2026-10-18 11:00:00+08', 'outgoing', 'webhook', false, false);

select public.team_reply_compute_day('2026-10-18', 'manual');
select pg_temp.ok(
  (select jsonb_agg(jsonb_build_array(replier, staff_id, replies, chat_ids, waits, within_target, slowest) order by replier)
   from public.team_reply_days where day = '2026-10-18')
  = '[["automation", null, 1, [31], [60], 1, 60],
      ["phone", null, 1, [31], [], 0, null],
      ["staff:3", 3, 2, [30], [1200], 1, 1200],
      ["staff:4", 4, 1, [31], [3600], 0, 3600]]'::jsonb,
  'the clock waits are exactly as before');
select pg_temp.ok((select bool_and(duty_waits = waits and duty_within_target = within_target and duty_slowest is not distinct from slowest)
  from public.team_reply_days where day = '2026-10-18'), 'no working hours anywhere: working-time waits = clock waits');

-- Staff 4 (a test id here) works from 10:30: the 60-minute wait is 30 minutes of work.
insert into public.teachers (id, full_name, username, role, is_active) overriding system value values (4, 'Staff four', 'tp_staff_four', 'staff', true)
on conflict (id) do nothing;
insert into public.staff_shifts (teacher_id, weekday, start_time, end_time) values (4, 0, '10:30', '18:00');
select public.team_reply_compute_day('2026-10-18', 'manual');
select pg_temp.ok((select duty_waits = '{1800}' and waits = '{3600}' and duty_within_target = 1 and within_target = 0
  from public.team_reply_days where day = '2026-10-18' and replier = 'staff:4'), 'with a week: only the working part of the wait');

rollback;
