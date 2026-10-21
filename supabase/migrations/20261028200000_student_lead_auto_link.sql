-- A new student is connected to the lead that has the same phone number.
--
-- The school's rule (boss, 2026-10-21): a lead whose number belongs to an enrolled student IS that student's
-- family, so it should not sit in the pipeline as an open lead. When a student is saved with a phone (or a
-- second parent phone), the lead that holds the same number (the last 9 digits) is
--   * set to "converted", with converted_student_id = the student, when it was not converted yet;
--   * and the student's family record is tied to the lead's parent (people.parent_id), when it has no parent yet.
-- A lead that already points at another student keeps that one (brothers and sisters: the first one is the
-- lead's student, the others are tied to the same parent only). Nothing else on the lead changes.
--
-- It runs after the family sync (people_sync_on_student), which makes the student's family record, because
-- row triggers of one event fire by name.

create or replace function public.link_student_to_lead(p_student_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.students%rowtype;
  keys text[];
  v_lead public.leads%rowtype;
  v_parent bigint;
begin
  select * into s from public.students where id = p_student_id;
  if not found then
    return;
  end if;

  select array_agg(distinct right(d, 9)) into keys
  from (values (public.people_digits(s.phone)), (public.people_digits(s.second_parent_phone))) v(d)
  where d is not null and length(d) >= 9;
  if keys is null then
    return;
  end if;

  -- The lead that holds the number: one lead per number is the rule; if there are several, the open one first, then the oldest.
  select * into v_lead from public.leads l
  where public.people_digits(l.phone) is not null
    and right(public.people_digits(l.phone), 9) = any (keys)
  order by (l.converted_student_id is null) desc, l.id
  limit 1;
  if not found then
    return;
  end if;

  if v_lead.converted_student_id is null then
    update public.leads set status = 'converted', converted_student_id = s.id where id = v_lead.id;
  end if;

  select id into v_parent from public.people where lead_id = v_lead.id and kind = 'parent' order by id limit 1;
  if v_parent is not null then
    update public.people set parent_id = v_parent
    where student_id = s.id and kind = 'student' and parent_id is null;
  end if;
end;
$$;

revoke all on function public.link_student_to_lead(bigint) from public, anon, authenticated;

create or replace function public.students_link_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.link_student_to_lead(new.id);
  return null;
end;
$$;

revoke all on function public.students_link_lead() from public, anon, authenticated;

drop trigger if exists students_link_lead on public.students;
create trigger students_link_lead
after insert or update of phone, second_parent_phone on public.students
for each row execute function public.students_link_lead();
