-- A chat first taken for a parent can turn out to be the student themself (a 16-year-old writing from her own
-- phone). The team says so on the chat, but the family table kept a parent (named after the WhatsApp name) beside
-- the child, so one person showed twice. Now saying "the student themself" moves the chat to the family's student
-- record and leaves the parent record without the chat.

create or replace function public.place_contact_as_student(p_contact_id bigint)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  par public.people%rowtype;
  kid_count integer;
  kid_id bigint;
  lead_name text;
begin
  select * into par
  from public.people
  where chatwoot_contact_id = p_contact_id and kind = 'parent' and lead_id is not null;
  if not found then
    return;
  end if;

  -- The student: the family's only child, else the child whose name is the name the chat shows.
  select count(*) into kid_count from public.people where parent_id = par.id and kind = 'student';
  if kid_count = 1 then
    select id into kid_id from public.people where parent_id = par.id and kind = 'student';
  else
    select id into kid_id
    from public.people
    where parent_id = par.id and kind = 'student'
      and public.people_name_key(full_name) = public.people_name_key(par.full_name)
    order by id
    limit 1;
  end if;
  if kid_id is null then
    return;
  end if;
  if exists (select 1 from public.people where id = kid_id and chatwoot_contact_id is not null) then
    return;
  end if;

  select nullif(btrim(l.full_name), '') into lead_name from public.leads l where l.id = par.lead_id;

  -- The chat leaves the parent record first (one chat belongs to one record).
  update public.people set chatwoot_contact_id = null, phone = null, full_name = lead_name where id = par.id;
  update public.people
  set chatwoot_contact_id = p_contact_id, phone = coalesce(par.phone, phone)
  where id = kid_id;

  perform public.sync_people_from_lead(par.lead_id);
end;
$$;

revoke all on function public.place_contact_as_student(bigint) from public, anon, authenticated;

create or replace function public.set_contact_role(p_contact_id bigint, p_role text)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not public.people_can_edit() then
    raise exception 'Not allowed.';
  end if;
  if p_role is null or p_role not in ('parent', 'student') then
    return;
  end if;
  -- A person nobody has placed yet takes the role they are given.
  update public.people
  set kind = p_role
  where chatwoot_contact_id = p_contact_id and kind = 'contact';
  -- A chat taken for a parent that is the student themself moves to the student record of the family.
  if p_role = 'student' then
    perform public.place_contact_as_student(p_contact_id);
  end if;
end;
$$;
