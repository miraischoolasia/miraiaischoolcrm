-- Typing a child's name into a lead left a student row in the family for every half-written name ("Cagt", "Cath",
-- "Catherine", ...), because the family follows the lead's children by name. Now, after the children of a lead are
-- written to its family, the rows of a name that is no longer on the lead are removed (only a row nothing is tied to:
-- no enrolled student, no chat, no login, no phone). The families that already have such rows are cleaned once.

CREATE OR REPLACE FUNCTION public.sync_people_from_lead(p_lead_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  l public.leads%rowtype;
  parent_id_found bigint;
  lead_phone text;
  student_holds_phone boolean;
  child jsonb;
  child_name text;
  child_phone text;
  kid_id bigint;
  kept bigint[] := '{}';
begin
  select * into l from public.leads where id = p_lead_id;
  if not found then
    return;
  end if;
  lead_phone := public.people_digits(l.phone);

  -- A student who writes themself uses the lead's number as their own.
  student_holds_phone := lead_phone is not null and exists (
    select 1 from public.people
    where kind = 'student' and phone = lead_phone and chatwoot_contact_id is not null
      and (parent_id is null
           or parent_id in (select id from public.people where lead_id = l.id and kind = 'parent'))
  );

  -- the parent: the one already tied to the lead, else a contact that holds the lead's number
  select id into parent_id_found from public.people
    where lead_id = l.id and kind = 'parent'
    order by (chatwoot_contact_id is null), id limit 1;

  if parent_id_found is null and lead_phone is not null and not student_holds_phone then
    select id into parent_id_found from public.people
      where kind in ('contact', 'parent') and lead_id is null and phone = lead_phone
      order by (chatwoot_contact_id is null), id limit 1;
    if parent_id_found is not null then
      update public.people set kind = 'parent', lead_id = l.id where id = parent_id_found;
    end if;
  end if;

  if parent_id_found is null then
    insert into public.people (kind, full_name, phone, lead_id)
    values (
      'parent',
      nullif(btrim(l.full_name), ''),
      case when student_holds_phone then null else lead_phone end,
      l.id
    )
    returning id into parent_id_found;
  else
    update public.people
    set full_name = coalesce(nullif(btrim(l.full_name), ''), full_name),
        phone = coalesce(case when student_holds_phone then null else lead_phone end, phone)
    where id = parent_id_found;
  end if;

  -- the children
  for child in select * from jsonb_array_elements(coalesce(l.children, '[]'::jsonb)) loop
    child_name := nullif(btrim(child ->> 'name'), '');
    child_phone := public.people_digits(child ->> 'phone');
    if child_name is null and child_phone is null then
      continue;
    end if;

    kid_id := null;
    if child_name is not null then
      select id into kid_id from public.people
        where kind = 'student'
          and parent_id in (select id from public.people where lead_id = l.id and kind = 'parent')
          and public.people_name_key(full_name) = public.people_name_key(child_name)
        order by id limit 1;
    end if;

    -- the child writes on WhatsApp with their own number
    if kid_id is null and child_phone is not null
       and (child_phone is distinct from lead_phone or student_holds_phone) then
      select id into kid_id from public.people
        where phone = child_phone and id <> parent_id_found
          and kind in ('contact', 'student') and lead_id is null
          and (parent_id is null or parent_id = parent_id_found)
          and chatwoot_contact_id is not null
        order by id limit 1;
      if kid_id is not null then
        update public.people
        set kind = 'student', parent_id = parent_id_found, full_name = coalesce(child_name, full_name)
        where id = kid_id;
      end if;
    end if;

    if kid_id is null then
      insert into public.people (kind, full_name, phone, parent_id)
      values (
        'student',
        child_name,
        case when child_phone is distinct from lead_phone then child_phone end,
        parent_id_found
      )
      returning id into kid_id;
    end if;

    -- an enrolled student of exactly this name
    if child_name is not null then
      update public.people p
      set student_id = s.id
      from public.students s
      where p.id = kid_id and p.student_id is null
        and public.people_name_key(s.full_name) = public.people_name_key(child_name)
        and (select count(*) from public.students s2
             where public.people_name_key(s2.full_name) = public.people_name_key(child_name)) = 1
        and not exists (select 1 from public.people o where o.student_id = s.id);
    end if;

    kept := kept || kid_id;
  end loop;

  -- The lead's children are the truth. A child name typed into the lead used to leave a row for every
  -- half-written name ("Cagt", "Cath", "Catherine"...); those that nothing is tied to are removed.
  if array_length(kept, 1) is not null then
    delete from public.people p
    where p.parent_id = parent_id_found
      and p.kind = 'student'
      and p.student_id is null
      and p.chatwoot_contact_id is null
      and p.auth_user_id is null
      and p.lead_id is null
      and p.phone is null
      and p.notes is null
      and not (p.id = any (kept));
  end if;
end;
$function$;

do $$
declare
  lead_row record;
begin
  for lead_row in
    select distinct par.lead_id
    from public.people p
    join public.people par on par.id = p.parent_id and par.kind = 'parent' and par.lead_id is not null
    where p.kind = 'student' and p.student_id is null and p.chatwoot_contact_id is null
      and p.auth_user_id is null and p.lead_id is null and p.phone is null and p.notes is null
  loop
    perform public.sync_people_from_lead(lead_row.lead_id);
  end loop;
end $$;
