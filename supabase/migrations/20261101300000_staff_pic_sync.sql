-- PIC names come from the staff list (owner's choice B, 2026-10-23). The PIC list stays (leads.pic_id, the tag → PIC
-- rules, the automations and "only my leads" all use it), but nobody types PIC names any more:
--   1. every active admin / staff account has its own PIC name, linked to it (teacher_id); a new account gets one,
--      a deactivated one's name is hidden (never deleted, its leads keep it), and shown again if it comes back;
--   2. an old PIC name typed before this (e.g. Mirai's 喵喵小老师) is linked to the account it stands for by an admin
--      (My Team > Teams > PIC names). Nothing guesses which account an old name is.
-- No lead, tag or flow is moved by this file.

-- 1. A staff account's own PIC name, kept in step with the account.
create or replace function public.teachers_sync_pic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active and new.role in ('admin', 'staff') then
    begin
      perform public.ensure_staff_pic(new.id);
    exception when insufficient_privilege then
      -- Linking a name to an account is an admin's change (lead_options_guard_teacher); an account saved by someone
      -- else gets its name the next time an admin saves it, and the account change itself always goes through.
      null;
    end;
    update public.lead_options set is_active = true where kind = 'pic' and teacher_id = new.id and not is_active;
  elsif tg_op = 'UPDATE' and old.is_active and not new.is_active then
    update public.lead_options set is_active = false where kind = 'pic' and teacher_id = new.id and is_active;
  end if;
  return null;
end;
$$;

revoke all on function public.teachers_sync_pic() from public, anon, authenticated;

drop trigger if exists teachers_sync_pic on public.teachers;
create trigger teachers_sync_pic
after insert or update of is_active, role on public.teachers
for each row execute function public.teachers_sync_pic();

-- Every active admin / staff account now. An account whose exact name is already an unlinked PIC name gets none
-- here (the name is taken): an admin links that old name to it instead.
select public.ensure_staff_pic(t.id)
from public.teachers t
where t.is_active and t.role in ('admin', 'staff');

-- 2. An admin links a PIC name to the account it stands for (or unlinks it, p_teacher_id null). When the account
-- already has its own name from step 1, the old name takes over: anything on the account's name (normally nothing,
-- it is new) moves to the old one, and the account's name is hidden and unlinked. The old name keeps its leads.
create or replace function public.link_pic_to_staff(p_pic_id bigint, p_teacher_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other bigint;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can link a PIC to an account.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.lead_options where id = p_pic_id and kind = 'pic') then
    raise exception 'That is not a PIC name.' using errcode = '22023';
  end if;
  if p_teacher_id is null then
    update public.lead_options set teacher_id = null where id = p_pic_id;
    return;
  end if;
  if not exists (select 1 from public.teachers where id = p_teacher_id) then
    raise exception 'That account does not exist.' using errcode = '22023';
  end if;

  select id into v_other
  from public.lead_options
  where kind = 'pic' and teacher_id = p_teacher_id and id <> p_pic_id;

  if v_other is not null then
    update public.leads set pic_id = p_pic_id where pic_id = v_other;
    update public.lead_options set pic_option_id = p_pic_id where pic_option_id = v_other;
    update public.lead_options set teacher_id = null, is_active = false where id = v_other;
  end if;

  update public.lead_options set teacher_id = p_teacher_id, is_active = true where id = p_pic_id;
end;
$$;

revoke all on function public.link_pic_to_staff(bigint, bigint) from public, anon;
grant execute on function public.link_pic_to_staff(bigint, bigint) to authenticated;
