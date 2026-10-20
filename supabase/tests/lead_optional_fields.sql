-- Checks for 20261028100000_lead_optional_fields.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/lead_optional_fields.sql

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

insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values
  (9981, 'Kid A', 0, '2099-12-31', '2099-12-31', '2099-12-31'),
  (9982, 'Kid B', 0, '2099-12-31', '2099-12-31', '2099-12-31');
update public.students set name_zh = '已有' where id = 9982;

insert into public.leads (id, full_name, phone, name_zh, second_parent_phone) overriding system value
values (99801, 'Lead A', '60123450011', '小明', '0123450099'),
       (99802, 'Lead B', '60123450012', '小红', '0123450098'),
       (99803, 'Lead C', '60123450013', null, null);

select pg_temp.ok((select name_zh from public.leads where id = 99801) = '小明', 'a lead keeps its Chinese name');
select pg_temp.fails($$update public.leads set second_parent_phone = '123' where id = 99803$$, 'check', 'a too-short second number is refused');
select pg_temp.fails($$update public.leads set name_zh = '   ' where id = 99803$$, 'check', 'a blank Chinese name is refused');

-- Converting: the values go to the student where it has none yet.
update public.leads set status = 'converted', converted_student_id = 9981 where id = 99801;
select pg_temp.ok((select name_zh from public.students where id = 9981) = '小明', 'converting gives the student the Chinese name');
select pg_temp.ok((select second_parent_phone from public.students where id = 9981) = '0123450099', 'converting gives the student the second number');

update public.leads set status = 'converted', converted_student_id = 9982 where id = 99802;
select pg_temp.ok((select name_zh from public.students where id = 9982) = '已有', 'a name the student already has is kept');
select pg_temp.ok((select second_parent_phone from public.students where id = 9982) = '0123450098', 'but its empty second number is filled');

-- Nothing to hand over: nothing changes.
update public.leads set status = 'converted', converted_student_id = 9981 where id = 99803;
select pg_temp.ok((select name_zh from public.students where id = 9981) = '小明', 'a lead with nothing leaves the student as it is');

-- Editing the lead afterwards does not touch the student again.
update public.students set name_zh = 'X' where id = 9981;
update public.leads set full_name = 'Lead A2' where id = 99801;
select pg_temp.ok((select name_zh from public.students where id = 9981) = 'X', 'editing a converted lead does not copy again');

rollback;
