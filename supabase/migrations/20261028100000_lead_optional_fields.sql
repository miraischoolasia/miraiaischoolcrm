-- Two optional things on a lead, for the lead details (the Leads window and the Inbox side panel):
--
-- * leads.name_zh: the child's or parent's Chinese name.
-- * leads.second_parent_phone: the number of another parent.
--
-- Both stay empty unless somebody fills them. When the lead becomes a student they go to the same two
-- fields on the student, where the student does not have one yet (every way a lead is converted sets
-- leads.converted_student_id, so one trigger on that column covers them all, like the tags).

alter table public.leads
  add column if not exists name_zh text
    check (name_zh is null or char_length(btrim(name_zh)) between 1 and 60),
  add column if not exists second_parent_phone text
    check (second_parent_phone is null or char_length(btrim(second_parent_phone)) between 6 and 30);

comment on column public.leads.name_zh is 'Optional Chinese name, shown in the lead details.';
comment on column public.leads.second_parent_phone is 'Optional number of another parent, shown in the lead details.';

create or replace function public.lead_fields_to_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.converted_student_id is null or (new.name_zh is null and new.second_parent_phone is null) then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.converted_student_id is not distinct from new.converted_student_id then
    return null;
  end if;

  update public.students s
  set name_zh = coalesce(s.name_zh, new.name_zh),
      second_parent_phone = coalesce(s.second_parent_phone, new.second_parent_phone)
  where s.id = new.converted_student_id
    and ((s.name_zh is null and new.name_zh is not null)
      or (s.second_parent_phone is null and new.second_parent_phone is not null));
  return null;
end;
$$;

revoke all on function public.lead_fields_to_student() from public, anon, authenticated;

drop trigger if exists leads_fields_to_student on public.leads;
create trigger leads_fields_to_student
after insert or update of converted_student_id on public.leads
for each row execute function public.lead_fields_to_student();
