-- Checks for 20261101800000_class_fx_and_look.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/class_fx.sql

begin;

create function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
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

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

grant execute on all functions in schema pg_temp to authenticated;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),  -- admin
  ('00000000-0000-0000-0000-0000000000a2'),  -- teacher Amy
  ('00000000-0000-0000-0000-0000000000a3'),  -- teacher Ben
  ('00000000-0000-0000-0000-0000000000b1');  -- student Ali

insert into public.teachers (id, auth_user_id, username, full_name, role) overriding system value values
  (9771, '00000000-0000-0000-0000-0000000000a1', 'fx_admin', 'Admin', 'admin'),
  (9772, '00000000-0000-0000-0000-0000000000a2', 'fx_amy', 'Amy', 'teacher'),
  (9773, '00000000-0000-0000-0000-0000000000a3', 'fx_ben', 'Ben', 'teacher');

insert into public.students (id, full_name, student_code, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, teacher_id)
  overriding system value values (9781, 'Ali', 'S9781', 8, '2030-01-01', '2030-01-01', '2030-01-01', 9772);
update public.students set auth_user_id = '00000000-0000-0000-0000-0000000000b1' where id = 9781;
insert into public.portal_accounts (auth_user_id, username, kind, student_id, parent_person_id) values
  ('00000000-0000-0000-0000-0000000000b1', 'fx.ali', 'student', 9781, null);

select pg_temp.ok((select count(*) from public.class_fx where builtin_key is not null) = 23, 'the 23 built-in effects are there');
select pg_temp.ok(
  (select count(*) filter (where kind = 'sound') = 8 and count(*) filter (where kind = 'bgm') = 3
     and count(*) filter (where kind = 'sticker') = 8 and count(*) filter (where kind = 'animation') = 4 from public.class_fx where builtin_key is not null),
  '8 sounds, 3 music, 8 stickers, 4 animations'
);

-- A teacher reads the library, cannot change it, keeps their own panel.
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
set local role authenticated;
select pg_temp.ok((select count(*) from public.class_fx) >= 23, 'a teacher reads the library');
select pg_temp.fails($$insert into public.class_fx (kind, name, file_url) values ('sound', 'Mine', '/x.mp3')$$, 'row-level security', 'a teacher cannot add an effect');
update public.class_fx set hidden = true where builtin_key = 'applause';
reset role;
select pg_temp.ok((select not hidden from public.class_fx where builtin_key = 'applause'), 'a teacher cannot hide an effect');

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
set local role authenticated;
insert into public.class_fx_favorites (teacher_id, fx_id, position)
select 9772, id, sort from public.class_fx where builtin_key in ('applause', 'correct', 'oops', 'drumroll', 'wow', 'boing', 'ticktock', 'fanfare');
select pg_temp.ok((select count(*) from public.class_fx_favorites) = 8, 'a teacher keeps 8 on the panel');
select pg_temp.fails(
  $$insert into public.class_fx_favorites (teacher_id, fx_id) select 9772, id from public.class_fx where builtin_key = 'bgm_calm'$$,
  'At most 8', 'a ninth button is refused'
);
select pg_temp.fails(
  $$insert into public.class_fx_favorites (teacher_id, fx_id) select 9773, id from public.class_fx where builtin_key = 'bgm_calm'$$,
  'row-level security', 'a teacher cannot set another teacher''s panel'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
set local role authenticated;
select pg_temp.ok((select count(*) from public.class_fx_favorites) = 0, 'a teacher sees only their own panel');
delete from public.class_fx_favorites;
reset role;
select pg_temp.ok((select count(*) from public.class_fx_favorites where teacher_id = 9772) = 8, 'a teacher cannot clear another teacher''s panel');

-- Admin manages the library.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
update public.class_fx set name = 'Clap clap', hidden = true where builtin_key = 'applause';
insert into public.class_fx (kind, name, file_url, emoji) values ('sound', 'School bell', 'https://example.org/bell.mp3', '🔔');
select pg_temp.fails($$delete from public.class_fx where builtin_key = 'boing'$$, 'permission denied', 'nobody deletes an effect (hide instead)');
select pg_temp.fails($$insert into public.class_fx (kind, name) values ('sound', 'No file')$$, 'check constraint', 'a sound needs a file');
reset role;
select pg_temp.ok((select name = 'Clap clap' and hidden from public.class_fx where builtin_key = 'applause'), 'admin renames and hides');
select pg_temp.ok(exists (select 1 from public.class_fx where name = 'School bell'), 'admin adds an effect');

-- Children never read the library.
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select pg_temp.ok((select count(*) from public.class_fx) = 0, 'a student login reads no effects');
select pg_temp.ok((select count(*) from public.class_fx_favorites) = 0, 'a student login reads no panels');
reset role;

-- The class look.
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
set local role authenticated;
select pg_temp.fails($$select public.set_class_look('{"primary": "#112233"}')$$, 'Only admin', 'a teacher cannot change the class look');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select public.set_class_look('{"theme": "eduhero", "primary": "#6d28d9", "accent": "#facc15", "radius": 18, "font": "Baloo 2", "mascot": true}');
select pg_temp.fails($$select public.set_class_look('{"primary": "red"}')$$, 'not valid', 'a colour must be #rrggbb');
select pg_temp.fails($$select public.set_class_look('{"radius": 99}')$$, 'not valid', 'corners are 0-32');
select pg_temp.fails($$select public.set_class_look('{"script": "x"}')$$, 'not valid', 'unknown keys are refused');
reset role;
select pg_temp.ok((select value ->> 'primary' = '#6d28d9' and (value ->> 'radius')::int = 18 from public.app_settings where key = 'class_look'), 'admin saves the class look');

rollback;
