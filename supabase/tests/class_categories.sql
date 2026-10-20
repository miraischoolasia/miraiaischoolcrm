-- Checks for 20261026600000_class_categories.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/class_categories.sql
-- Every check prints PASS; the first failure stops the run.

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
  ('00000000-0000-0000-0000-0000000000f1'),  -- admin
  ('00000000-0000-0000-0000-0000000000f2');  -- teacher

insert into public.teachers (id, auth_user_id, username, full_name, role) overriding system value values
  (9801, '00000000-0000-0000-0000-0000000000f1', 'cc_admin', 'Admin', 'admin'),
  (9802, '00000000-0000-0000-0000-0000000000f2', 'cc_teacher', 'Teacher', 'teacher');

-- 1. Seed and existing classes ---------------------------------------------
select pg_temp.ok(
  (select array_agg(name || ':' || kind order by sort_order) from public.class_categories
   where name in ('Regular Class', 'Trial Class', 'Camp Class'))
  = array['Regular Class:regular', 'Trial Class:trial', 'Camp Class:camp'],
  'the three usual categories are there');
select pg_temp.ok(not exists (select 1 from public.classrooms where category_name is null),
  'every existing class has a category');
select pg_temp.ok(not exists (
  select 1 from public.classrooms c join public.class_categories k on k.name = c.category_name where k.kind <> c.category),
  'each class''s category works like its kind');

-- 2. Old screens that only write the kind still work ------------------------
insert into public.classrooms (id, name, age_group, program_level, teacher_id, category) overriding system value values
  (9901, 'CC Trial', '9-11 Years Old', 'Coder Foundation', 9802, 'trial');
select pg_temp.ok((select category_name from public.classrooms where id = 9901) = 'Trial Class',
  'a class written as a trial gets the Trial Class category');

-- 3. The admin manages the list ----------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
set local role authenticated;
select pg_temp.fails($$select public.save_class_category(null, 'Exam Prep', 'regular', null, null)$$,
  'only admin', 'a teacher cannot add a category');
select pg_temp.ok((select count(*) from public.class_categories) >= 3, 'a teacher can read the list');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
set local role authenticated;
select public.save_class_category(null, 'Exam Prep', 'regular', null, null);
select pg_temp.fails($$select public.save_class_category(null, 'Exam Prep', 'regular', null, null)$$,
  'already a class category', 'two categories cannot share a name');
select pg_temp.fails($$select public.save_class_category(null, 'Odd', 'weekly', null, null)$$,
  'regular, trial or camp', 'a category must work like a known kind');
reset role;

-- 4. A class put in a category takes its kind --------------------------------
update public.classrooms set category_name = 'Exam Prep' where id = 9901;
select pg_temp.ok((select category from public.classrooms where id = 9901) = 'regular',
  'moving a trial class to Exam Prep makes it a regular class');

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
set local role authenticated;
select public.save_class_category('Exam Prep', '备战班', null, null, null);
reset role;
select pg_temp.ok((select category_name from public.classrooms where id = 9901) = '备战班',
  'renaming a category renames it on its classes');

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
set local role authenticated;
select public.save_class_category('备战班', null, 'camp', null, null);
reset role;
select pg_temp.ok((select category from public.classrooms where id = 9901) = 'camp'
  and (select category_name from public.classrooms where id = 9901) = '备战班',
  'a category that starts working like a camp takes its classes with it');

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
set local role authenticated;
select public.save_class_category('Regular Class', null, null, null, false);
reset role;
update public.classrooms set category = 'regular' where id = 9901;
select pg_temp.ok((select category_name from public.classrooms where id = 9901) = 'Regular Class',
  'writing only the kind picks that kind''s category, a hidden one too when it is the only one');
select pg_temp.ok(not (select is_active from public.class_categories where name = 'Regular Class'),
  'hiding keeps the category (never deleted)');

rollback;
