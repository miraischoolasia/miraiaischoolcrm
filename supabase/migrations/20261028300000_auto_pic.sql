-- A lead gets its person in charge (PIC) by itself.
--
-- 1. A tag can name a PIC ("Violet" label -> the PIC Violet). When a lead carries such a tag and has no PIC yet, it gets
--    that PIC. A lead with no PIC and two tags that name different PICs is left alone (the team decides).
--    The tag -> PIC table lives on the tags themselves (lead_options.pic_option_id), so each school sets its own.
-- 2. A student's consultant (students.consultant_id) is the person in charge of the family: a lead that became that
--    student, with no PIC yet, gets the PIC of that account (made on the spot when the account has none).
-- A lead that already has a PIC (set by hand or earlier) is never changed.

-- ---------------------------------------------------------------------------------------------------------
-- The tag -> PIC link.
-- ---------------------------------------------------------------------------------------------------------

alter table public.lead_options
  add column if not exists pic_option_id bigint references public.lead_options (id) on delete set null;

alter table public.lead_options
  drop constraint if exists lead_options_pic_only_on_tag;
alter table public.lead_options
  add constraint lead_options_pic_only_on_tag check (pic_option_id is null or kind = 'tag');

comment on column public.lead_options.pic_option_id is
  'For a tag: the PIC name a lead gets when it carries this tag and has no PIC yet.';

-- The link must point at a PIC name, and it decides who owns leads, so only an admin changes it.
create or replace function public.lead_options_guard_pic_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pic_option_id is not null
     and new.pic_option_id is distinct from (case when tg_op = 'UPDATE' then old.pic_option_id end) then
    if not exists (select 1 from public.lead_options where id = new.pic_option_id and kind = 'pic') then
      raise exception 'A tag can only name a PIC.' using errcode = '23514';
    end if;
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Only an admin can link a tag to a PIC.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.lead_options_guard_pic_link() from public, anon, authenticated;

drop trigger if exists lead_options_guard_pic_link on public.lead_options;
create trigger lead_options_guard_pic_link
before insert or update of pic_option_id on public.lead_options
for each row execute function public.lead_options_guard_pic_link();

-- ---------------------------------------------------------------------------------------------------------
-- The PIC a set of tags names: exactly one, else none.
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.pic_from_tags(p_tag_ids bigint[])
returns bigint
language sql
stable
set search_path = public
as $$
  select case when count(distinct p.id) = 1 then min(p.id) end
  from public.lead_options t
  join public.lead_options p on p.id = t.pic_option_id and p.kind = 'pic' and p.is_active
  where t.kind = 'tag' and t.id = any (coalesce(p_tag_ids, '{}'::bigint[]));
$$;

revoke all on function public.pic_from_tags(bigint[]) from public, anon;
grant execute on function public.pic_from_tags(bigint[]) to authenticated;

create or replace function public.leads_auto_pic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pic_id is null and new.tag_ids is not null and cardinality(new.tag_ids) > 0 then
    new.pic_id := public.pic_from_tags(new.tag_ids);
  end if;
  return new;
end;
$$;

revoke all on function public.leads_auto_pic() from public, anon, authenticated;

drop trigger if exists leads_auto_pic on public.leads;
create trigger leads_auto_pic
before insert or update of tag_ids on public.leads
for each row execute function public.leads_auto_pic();

-- ---------------------------------------------------------------------------------------------------------
-- The student's consultant is the family's person in charge.
-- ---------------------------------------------------------------------------------------------------------

-- The PIC name of an account, made when it has none.
create or replace function public.ensure_staff_pic(p_teacher_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_name text;
begin
  select id into v_id from public.lead_options where kind = 'pic' and teacher_id = p_teacher_id limit 1;
  if v_id is not null then
    return v_id;
  end if;
  select nullif(btrim(full_name), '') into v_name from public.teachers where id = p_teacher_id and is_active;
  if v_name is null then
    return null;
  end if;
  insert into public.lead_options (kind, label, teacher_id) values ('pic', v_name, p_teacher_id)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.lead_options where kind = 'pic' and teacher_id = p_teacher_id limit 1;
  end if;
  return v_id;
end;
$$;

revoke all on function public.ensure_staff_pic(bigint) from public, anon, authenticated;

create or replace function public.students_auto_pic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pic bigint;
begin
  if new.consultant_id is null then
    return null;
  end if;
  if not exists (select 1 from public.leads where converted_student_id = new.id and pic_id is null) then
    return null;
  end if;
  v_pic := public.ensure_staff_pic(new.consultant_id);
  if v_pic is not null then
    update public.leads set pic_id = v_pic where converted_student_id = new.id and pic_id is null;
  end if;
  return null;
end;
$$;

revoke all on function public.students_auto_pic() from public, anon, authenticated;

-- After students_link_lead (row triggers of one event fire by name), so a lead made a student by this very save is seen.
drop trigger if exists students_pic_after_link on public.students;
create trigger students_pic_after_link
after insert or update of consultant_id, phone, second_parent_phone on public.students
for each row execute function public.students_auto_pic();
