-- Checks for 20261031950000_user_ui_preferences.sql: everyone keeps their own screen settings, nobody sees another's.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/user_ui_preferences.sql

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

create function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000000000d1', 'test_uip_a@example.test', 'authenticated', 'authenticated'),
       ('00000000-0000-0000-0000-0000000000d2', 'test_uip_b@example.test', 'authenticated', 'authenticated');
insert into public.teachers (id, full_name, username, role, auth_user_id, is_active)
overriding system value
values (992001, 'UIP A', 'test_uip_a', 'staff', '00000000-0000-0000-0000-0000000000d1', true),
       (992002, 'UIP B', 'test_uip_b', 'staff', '00000000-0000-0000-0000-0000000000d2', true);

select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
insert into public.user_ui_preferences (key, value) values ('students.roster.columns', '{"hidden":["fb"]}');
insert into public.user_ui_preferences (key, value) values ('students.roster.columns', '{"hidden":["fb","hero"]}')
  on conflict (teacher_id, key) do update set value = excluded.value;
select pg_temp.ok((select count(*) = 1 and bool_and(teacher_id = 992001 and value = '{"hidden":["fb","hero"]}'::jsonb)
  from public.user_ui_preferences), 'a setting is saved on my own account, and saving again replaces it');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000d2');
set local role authenticated;
select pg_temp.ok((select count(*) = 0 from public.user_ui_preferences), 'someone else sees none of it');
with changed as (update public.user_ui_preferences set value = '{}' returning 1) select count(*) as n from changed \gset
select pg_temp.ok(:n = 0, 'and cannot change it');
do $$
begin
  begin
    insert into public.user_ui_preferences (teacher_id, key, value) values (992001, 'x', '{}');
  exception when others then
    raise notice 'PASS writing on another account is refused';
    return;
  end;
  raise exception 'FAIL writing on another account was allowed';
end $$;
reset role;

rollback;
