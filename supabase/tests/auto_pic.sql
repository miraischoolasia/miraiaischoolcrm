-- Checks for 20261028300000_auto_pic.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/auto_pic.sql

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

-- Two staff accounts, two PIC names (one linked to an account), two tags that name a PIC, one tag that names none.
insert into public.teachers (id, username, full_name, role, is_active) overriding system value
values (99801, 'auto_pic_violet', 'Violet Test', 'staff', true),
       (99802, 'auto_pic_derrick', 'Derrick Test', 'staff', true);

insert into public.lead_options (id, kind, label, teacher_id) overriding system value
values (99821, 'pic', 'Violet Test', 99801);
insert into public.lead_options (id, kind, label, pic_option_id) overriding system value
values (99811, 'tag', 'Violet label', 99821);
insert into public.lead_options (id, kind, label) overriding system value
values (99812, 'tag', 'Plain tag'),
       (99831, 'pic', 'Other PIC');
insert into public.lead_options (id, kind, label, pic_option_id) overriding system value
values (99813, 'tag', 'Other label', 99831);

-- The link only points at a PIC, and only a tag may carry it.
select pg_temp.ok((select pic_option_id from public.lead_options where id = 99811) = 99821, 'a tag can name a PIC');
do $$
begin
  begin
    update public.lead_options set pic_option_id = 99812 where id = 99813;
    raise exception 'FAIL a tag pointing at a tag was accepted';
  exception when check_violation then
    null;
  end;
end;
$$;
select pg_temp.ok(true, 'a tag cannot name another tag');
do $$
begin
  begin
    update public.lead_options set pic_option_id = 99821 where id = 99831;
    raise exception 'FAIL a PIC carrying a link was accepted';
  exception when check_violation then
    null;
  end;
end;
$$;
select pg_temp.ok(true, 'only a tag carries the link');

-- A new lead with the tag gets the PIC; with no such tag it stays unassigned.
insert into public.leads (id, full_name, phone, status, tag_ids) overriding system value
values (99901, 'Lead One', '60123450901', 'new', '{99811}'),
       (99902, 'Lead Two', '60123450902', 'new', '{99812}'),
       (99903, 'Lead Three', '60123450903', 'new', '{99811,99813}'),
       (99904, 'Lead Four', '60123450904', 'new', '{}');
select pg_temp.ok((select pic_id from public.leads where id = 99901) = 99821, 'a new lead with the tag gets the PIC');
select pg_temp.ok((select pic_id from public.leads where id = 99902) is null, 'a tag that names no PIC changes nothing');
select pg_temp.ok((select pic_id from public.leads where id = 99903) is null, 'two tags naming different PICs: left to the team');

-- A tag added later does it too, but never over a PIC that is already there.
update public.leads set tag_ids = '{99811}' where id = 99904;
select pg_temp.ok((select pic_id from public.leads where id = 99904) = 99821, 'a tag added later gives the PIC');
update public.leads set pic_id = 99831 where id = 99901;
update public.leads set tag_ids = '{99811,99812}' where id = 99901;
select pg_temp.ok((select pic_id from public.leads where id = 99901) = 99831, 'a PIC that is already set is kept');
update public.leads set pic_id = null where id = 99901;
update public.leads set tag_ids = '{99811}' where id = 99901;
select pg_temp.ok((select pic_id from public.leads where id = 99901) = 99821, 'a lead whose PIC was taken off gets it again from its tag');

-- A hidden PIC is not given.
update public.lead_options set is_active = false where id = 99821;
insert into public.leads (id, full_name, phone, status, tag_ids) overriding system value
values (99905, 'Lead Five', '60123450905', 'new', '{99811}');
select pg_temp.ok((select pic_id from public.leads where id = 99905) is null, 'a hidden PIC is not given');
update public.lead_options set is_active = true where id = 99821;

-- The consultant of the student: the lead that became the student gets that account's PIC (made when missing).
insert into public.leads (id, full_name, phone, status, tag_ids) overriding system value
values (99906, 'Lead Six', '60123450906', 'new', '{}');
insert into public.students (id, full_name, phone, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values (9951, 'Kid Six', '60123450906', 0, '2099-12-31', '2099-12-31', '2099-12-31');
select pg_temp.ok((select converted_student_id from public.leads where id = 99906) = 9951, 'the lead became the student (the link trigger)');
select pg_temp.ok((select pic_id from public.leads where id = 99906) is null, 'no consultant yet: the lead has no PIC');
update public.students set consultant_id = 99802 where id = 9951;
select pg_temp.ok((select count(*) from public.lead_options where kind = 'pic' and teacher_id = 99802) = 1, 'the consultant got a PIC name made');
select pg_temp.ok((select o.teacher_id from public.leads l join public.lead_options o on o.id = l.pic_id where l.id = 99906) = 99802, 'the lead has the consultant as PIC');

-- A lead with a PIC is not changed by the consultant.
insert into public.leads (id, full_name, phone, status, tag_ids, pic_id) overriding system value
values (99907, 'Lead Seven', '60123450907', 'new', '{}', 99831);
insert into public.students (id, full_name, phone, consultant_id, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values (9952, 'Kid Seven', '60123450907', 99801, 0, '2099-12-31', '2099-12-31', '2099-12-31');
select pg_temp.ok((select pic_id from public.leads where id = 99907) = 99831, 'a lead with a PIC keeps it when the student has a consultant');

rollback;
