-- Checks for 20261025500000_inbox_stickers.sql. Run on a scratch copy of the live schema; it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/inbox_stickers.sql

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

create function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000000000c1', 'test_sticker_admin@example.test', 'authenticated', 'authenticated'),
       ('00000000-0000-0000-0000-0000000000c2', 'test_sticker_staff@example.test', 'authenticated', 'authenticated');
insert into public.teachers (id, full_name, username, role, auth_user_id, is_active, permissions)
overriding system value
values (991001, 'Sticker Admin', 'test_sticker_admin', 'admin', '00000000-0000-0000-0000-0000000000c1', true, '{}'),
       (991002, 'Front Desk', 'test_sticker_staff', 'staff', '00000000-0000-0000-0000-0000000000c2', true, '{"leads":{"level":"edit","delete":false}}');

-- The library: the admin adds, the team reads, only the admin hides.
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
insert into public.inbox_stickers (path, name) values ('a.webp', 'Thumbs up');
select pg_temp.ok((select count(*) = 1 from public.inbox_stickers), 'the admin adds a sticker');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
set local role authenticated;
select pg_temp.ok((select count(*) = 1 from public.inbox_stickers), 'the team sees the library');
select pg_temp.fails($$insert into public.inbox_stickers (path) values ('b.webp')$$, 'row-level security', 'staff cannot add');
update public.inbox_stickers set is_active = false;
select pg_temp.ok((select bool_and(is_active) from public.inbox_stickers), 'staff cannot hide one');
reset role;

-- Stickers parents sent: .webp pictures, the same one once, newest first; photos and our own are not.
insert into public.inbox_chats (conversation_id, account_id, inbox_id) values (7001, 1, null);
insert into public.inbox_messages (id, account_id, conversation_id, message_type, sender_kind, content, attachments, created_at) values
  (91, 1, 7001, 0, 'parent', null, '[{"type":"image","url":"https://wa.example/rails/active_storage/x/cat.webp","name":"cat.webp","size":2048}]', now() - interval '2 days'),
  (92, 1, 7001, 0, 'parent', null, '[{"type":"image","url":"https://wa.example/rails/active_storage/y/cat.webp","name":"cat.webp","size":2048}]', now() - interval '1 day'),
  (93, 1, 7001, 0, 'parent', null, '[{"type":"image","url":"https://wa.example/rails/active_storage/z/dog.webp","name":"dog.webp","size":4096}]', now() - interval '3 hours'),
  (94, 1, 7001, 0, 'parent', 'photo', '[{"type":"image","url":"https://wa.example/rails/active_storage/p/photo.jpg","name":"photo.jpg","size":99}]', now()),
  (95, 1, 7001, 1, 'staff', null, '[{"type":"image","url":"https://wa.example/rails/active_storage/o/ours.webp","name":"ours.webp","size":77}]', now());
set local role authenticated;
select pg_temp.ok(
  (select array_agg(name order by sent_at desc) from public.inbox_recent_stickers(40)) = array['dog.webp', 'cat.webp'],
  'received stickers: the same one once, newest first, no photos, none of ours');
reset role;

rollback;
