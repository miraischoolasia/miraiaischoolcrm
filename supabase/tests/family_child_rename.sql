-- Checks for 20261026700000_family_child_rename_keeps_row.sql (a renamed child keeps their row) and
-- 20261026800000_inbox_search_phone_digits.sql (a number is found however it is typed).
-- Run on a scratch copy of the live schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/family_child_rename.sql

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

-- Lucas's family as it was: the mother's lead, Lucas with his own number, and his chat already on his row.
insert into public.leads (id, full_name, phone, children)
overriding system value
values (990001, 'Michelle Hew', '60127633881', '[{"name": "Lucas Chin Jun Hao", "age": 15, "phone": "60179903881"}]');

select pg_temp.ok(
  (select count(*) from public.people p join public.people par on par.id = p.parent_id
   where par.lead_id = 990001 and p.kind = 'student') = 1,
  'one child after the lead is saved');

update public.people set chatwoot_contact_id = 991727
where kind = 'student' and parent_id = (select id from public.people where lead_id = 990001 and kind = 'parent');

-- The name is changed (the typo of 2026-10-14).
update public.leads
set children = '[{"name": "Lucas Chin Jun  HaoHao", "age": 15, "phone": "60179903881"}]'
where id = 990001;

select pg_temp.ok(
  (select count(*) from public.people p join public.people par on par.id = p.parent_id
   where par.lead_id = 990001 and p.kind = 'student') = 1,
  'a changed name keeps one child (it made a second one before)');
select pg_temp.ok(
  (select full_name from public.people where chatwoot_contact_id = 991727) = 'Lucas Chin Jun  HaoHao',
  'the child with the chat takes the new name');

-- Changed back: still the same row.
update public.leads
set children = '[{"name": "Lucas Chin Jun Hao", "age": 15, "phone": "60179903881"}]'
where id = 990001;
select pg_temp.ok(
  (select count(*) from public.people p join public.people par on par.id = p.parent_id
   where par.lead_id = 990001 and p.kind = 'student') = 1
  and (select full_name from public.people where chatwoot_contact_id = 991727) = 'Lucas Chin Jun Hao',
  'changed back, still one child with the chat');

-- As on 2026-10-14: the child has a number of their own but no chat yet when the name is changed.
insert into public.leads (id, full_name, phone, children)
overriding system value
values (990004, 'Wong Siew Lan', '60120000004', '[{"name": "Jun Hao", "age": 15, "phone": "60190000004"}]');
update public.leads set children = '[{"name": "Jun  HaoHao", "age": 15, "phone": "60190000004"}]' where id = 990004;
select pg_temp.ok(
  (select count(*) from public.people p join public.people par on par.id = p.parent_id
   where par.lead_id = 990004 and p.kind = 'student') = 1,
  'a renamed child with a number but no chat yet keeps one row');

-- A child with no number of their own, renamed while a sibling stays.
insert into public.leads (id, full_name, phone, children)
overriding system value
values (990002, 'Tan Mei Ling', '60120000002', '[{"name": "Cath", "age": 8}, {"name": "Ryan", "age": 10}]');
update public.people set notes = 'kept on purpose'
where kind = 'student' and full_name = 'Cath'
  and parent_id = (select id from public.people where lead_id = 990002 and kind = 'parent');
update public.leads set children = '[{"name": "Catherine", "age": 8}, {"name": "Ryan", "age": 10}]' where id = 990002;

select pg_temp.ok(
  (select array_agg(p.full_name order by p.full_name) from public.people p join public.people par on par.id = p.parent_id
   where par.lead_id = 990002 and p.kind = 'student') = array['Catherine', 'Ryan'],
  'a renamed child with notes keeps the row; the sibling is untouched');
select pg_temp.ok(
  (select notes from public.people where full_name = 'Catherine'
   and parent_id = (select id from public.people where lead_id = 990002 and kind = 'parent')) = 'kept on purpose',
  'the renamed row keeps what was written on it');

-- A second child added: a new row, the first one stays.
update public.leads set children = '[{"name": "Catherine", "age": 8}, {"name": "Ryan", "age": 10}, {"name": "Zoe", "age": 4}]' where id = 990002;
select pg_temp.ok(
  (select count(*) from public.people p join public.people par on par.id = p.parent_id
   where par.lead_id = 990002 and p.kind = 'student') = 3,
  'a child added is a new row');

-- Twins who share a phone of their own, one renamed: the other twin is not taken for them.
insert into public.leads (id, full_name, phone, children)
overriding system value
values (990003, 'Lim Ah Kow', '60120000003',
        '[{"name": "Adam", "age": 9, "phone": "60190000003"}, {"name": "Aaron", "age": 9, "phone": "60190000003"}]');
update public.leads
set children = '[{"name": "Adam Lim", "age": 9, "phone": "60190000003"}, {"name": "Aaron", "age": 9, "phone": "60190000003"}]'
where id = 990003;
select pg_temp.ok(
  (select array_agg(p.full_name order by p.full_name) from public.people p join public.people par on par.id = p.parent_id
   where par.lead_id = 990003 and p.kind = 'student') = array['Aaron', 'Adam Lim'],
  'twins on one phone: the renamed one is renamed, the other twin stays');

-- Search: the number however it is typed.
insert into public.inbox_chats (conversation_id, account_id, inbox_id, channel, contact_id, contact_name, contact_phone,
                                contact_identifier, status, last_activity_at, raw)
values (990413, 1, 1, 'Channel::Api', 990415, 'Michelle Hew', '60127633881', '60127633881@s.whatsapp.net', 'open', now(),
        '{"id": 990413}'::jsonb);

select pg_temp.ok(
  (select bool_and(exists (select 1 from public.inbox_search(q) s where s.conversation_id = 990413))
   from unnest(array['60127633881', '+60127633881', '0127633881', '012-763 3881', '+60 12-763 3881', '127633881']) q),
  'the chat is found by its number, with or without +60, spaces or dashes');
select pg_temp.ok(
  not exists (select 1 from public.inbox_search('+60 19-999 9999') s where s.conversation_id = 990413),
  'another number does not find it');
select pg_temp.ok(
  exists (select 1 from public.inbox_search('Michelle') s where s.conversation_id = 990413),
  'the name still finds it');

rollback;
