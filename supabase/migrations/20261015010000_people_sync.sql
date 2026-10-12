-- Keeps the family table (people) in step with leads and students, so nobody has to fill it by hand.
--
-- One code path: sync_people_from_lead(lead) and sync_people_from_student(student) say "make sure the
-- people for this lead / student exist and are tied together". They are idempotent. A trigger calls
-- them whenever a lead or student is saved, and the one-off backfill calls them for every row.
--
-- How a lead becomes people:
--   * its phone belongs to a PARENT. If a WhatsApp contact (kind 'contact') already has that number,
--     that contact is the parent; otherwise a parent row with no chat is made (a chat that arrives
--     later with that number is adopted by it).
--   * each child on the lead is a STUDENT of that parent. If a WhatsApp contact has the child's own
--     number, that contact is the child (the student writing themself); otherwise a student row is made.
--   * a child with the same name as exactly one enrolled student is tied to that student.
-- How a student becomes people:
--   * a person already tied to it, else the one student row of the same name, else a new row; its
--     parent is whoever holds its number (a contact with that number becomes the parent).
--
-- Nothing is ever deleted except a contact row that was just added for a chat whose number a parent or
-- student row already holds (the chat joins that row instead), and a number that two people could hold
-- is never guessed at.

create or replace function public.people_digits(p_value text)
returns text
language sql
immutable
as $$
  select case
    when d = '' or length(d) < 8 or length(d) > 15 then null
    when left(d, 1) = '0' then '60' || substr(d, 2)
    when length(d) = 8 then '65' || d
    else d
  end
  from (select regexp_replace(coalesce(p_value, ''), '\D', '', 'g') as d) s
$$;

create or replace function public.people_name_key(p_value text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(coalesce(p_value, '')), '[[:space:][:punct:]]', '', 'g')
$$;

create or replace function public.sync_people_from_lead(p_lead_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.leads%rowtype;
  parent_id_found bigint;
  lead_phone text;
  student_holds_phone boolean;
  child jsonb;
  child_name text;
  child_phone text;
  kid_id bigint;
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
  end loop;
end;
$$;

create or replace function public.sync_people_from_student(p_student_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.students%rowtype;
  student_phone text;
  person_id bigint;
  parent_found bigint;
begin
  select * into s from public.students where id = p_student_id;
  if not found then
    return;
  end if;
  student_phone := public.people_digits(s.phone);

  select id into person_id from public.people where student_id = s.id order by id limit 1;

  -- a student row of exactly this name that is not tied to an enrolled student yet
  if person_id is null then
    select p.id into person_id from public.people p
      where p.kind = 'student' and p.student_id is null
        and public.people_name_key(p.full_name) = public.people_name_key(s.full_name)
        and (select count(*) from public.people q
             where q.kind = 'student' and q.student_id is null
               and public.people_name_key(q.full_name) = public.people_name_key(s.full_name)) = 1;
    if person_id is not null then
      update public.people set student_id = s.id where id = person_id;
    end if;
  end if;

  -- who holds the number: a parent, or a contact that then becomes the parent
  if student_phone is not null then
    select id into parent_found from public.people
      where kind = 'parent' and phone = student_phone
      order by (chatwoot_contact_id is null), id limit 1;
    if parent_found is null then
      select id into parent_found from public.people
        where kind = 'contact' and phone = student_phone and chatwoot_contact_id is not null
        order by id limit 1;
      if parent_found is not null then
        update public.people set kind = 'parent' where id = parent_found;
      end if;
    end if;
  end if;

  if person_id is null then
    insert into public.people (kind, full_name, phone, parent_id, student_id)
    values (
      'student',
      s.full_name,
      case when parent_found is null then student_phone end,
      parent_found,
      s.id
    );
  else
    update public.people
    set full_name = coalesce(nullif(btrim(s.full_name), ''), full_name),
        parent_id = coalesce(parent_id, parent_found)
    where id = person_id and kind = 'student';
  end if;
end;
$$;

revoke all on function public.sync_people_from_lead(bigint) from public, anon, authenticated;
revoke all on function public.sync_people_from_student(bigint) from public, anon, authenticated;

-- A lead or a student was saved.
create or replace function public.people_sync_on_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_people_from_lead(new.id);
  return null;
end;
$$;

create or replace function public.people_sync_on_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_people_from_student(new.id);
  return null;
end;
$$;

revoke all on function public.people_sync_on_lead() from public, anon, authenticated;
revoke all on function public.people_sync_on_student() from public, anon, authenticated;

drop trigger if exists people_sync_on_lead on public.leads;
create trigger people_sync_on_lead
after insert or update of full_name, phone, children on public.leads
for each row execute function public.people_sync_on_lead();

drop trigger if exists people_sync_on_student on public.students;
create trigger people_sync_on_student
after insert or update of full_name, phone on public.students
for each row execute function public.people_sync_on_student();

-- A WhatsApp contact was added (by the page). If a parent or student row with no chat already holds
-- its number, the chat joins that row; otherwise it is placed by any lead or student with its number.
create or replace function public.people_place_new_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  adopt_id bigint;
  lead_row record;
  student_row record;
begin
  -- Rows the sync functions make themselves must not start another sync.
  if pg_trigger_depth() > 1 or new.phone is null then
    return null;
  end if;

  select id into adopt_id from public.people
    where phone = new.phone and chatwoot_contact_id is null and kind in ('parent', 'student') and id <> new.id
    order by id limit 1;
  if adopt_id is not null then
    delete from public.people where id = new.id;
    update public.people
    set chatwoot_contact_id = new.chatwoot_contact_id,
        full_name = coalesce(full_name, new.full_name)
    where id = adopt_id;
    return null;
  end if;

  for lead_row in
    select l.id from public.leads l
    where public.people_digits(l.phone) = new.phone
       or exists (
         select 1 from jsonb_array_elements(coalesce(l.children, '[]'::jsonb)) c
         where public.people_digits(c ->> 'phone') = new.phone
       )
    order by l.id
  loop
    perform public.sync_people_from_lead(lead_row.id);
  end loop;

  for student_row in
    select s.id from public.students s where public.people_digits(s.phone) = new.phone order by s.id
  loop
    perform public.sync_people_from_student(student_row.id);
  end loop;

  return null;
end;
$$;

revoke all on function public.people_place_new_contact() from public, anon, authenticated;

drop trigger if exists people_place_new_contact on public.people;
create trigger people_place_new_contact
after insert on public.people
for each row
when (new.chatwoot_contact_id is not null)
execute function public.people_place_new_contact();

-- ---------------------------------------------------------------------------
-- Tying a WhatsApp contact to what the team already knows. The internal functions do the work (and
-- are what the one-off backfill calls); the ones the page calls check the permission first.

-- The team tied this chat to a lead.
create or replace function public.people_link_contact_to_lead(p_contact_id bigint, p_lead_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  person public.people%rowtype;
  parent_found bigint;
  chatless_parent bigint;
begin
  select * into person from public.people where chatwoot_contact_id = p_contact_id;
  if not found or not exists (select 1 from public.leads where id = p_lead_id) then
    return;
  end if;

  if person.kind = 'student' then
    perform public.sync_people_from_lead(p_lead_id);
    select id into parent_found from public.people
      where lead_id = p_lead_id and kind = 'parent'
      order by (chatwoot_contact_id is null), id limit 1;
    update public.people set parent_id = coalesce(parent_id, parent_found) where id = person.id;
    return;
  end if;

  -- The lead already has a parent with no chat (made from the form): this chat is that parent.
  select id into chatless_parent from public.people
    where lead_id = p_lead_id and kind = 'parent' and chatwoot_contact_id is null and id <> person.id
    order by id limit 1;
  if chatless_parent is not null and person.kind = 'contact' then
    delete from public.people where id = person.id;
    update public.people
    set chatwoot_contact_id = p_contact_id,
        full_name = coalesce(full_name, person.full_name),
        phone = coalesce(phone, person.phone)
    where id = chatless_parent;
  elsif person.lead_id is null or person.lead_id = p_lead_id then
    update public.people set kind = 'parent', lead_id = p_lead_id where id = person.id;
  end if;
  perform public.sync_people_from_lead(p_lead_id);
end;
$$;

-- The team tied this chat to enrolled students (the parent of those students).
create or replace function public.people_link_contact_to_students(p_contact_id bigint, p_student_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  person public.people%rowtype;
  sid bigint;
begin
  select * into person from public.people where chatwoot_contact_id = p_contact_id;
  if not found or p_student_ids is null or cardinality(p_student_ids) = 0 then
    return;
  end if;

  foreach sid in array p_student_ids loop
    perform public.sync_people_from_student(sid);
  end loop;

  -- The chat of the student themself: it is that student.
  if person.kind = 'student' then
    if cardinality(p_student_ids) = 1 and person.student_id is null
       and not exists (select 1 from public.people where student_id = p_student_ids[1] and id <> person.id) then
      update public.people set student_id = p_student_ids[1] where id = person.id;
    end if;
    return;
  end if;

  if person.kind = 'contact' then
    update public.people set kind = 'parent' where id = person.id;
  end if;
  -- Those students belong to this parent, unless they already belong to someone else.
  update public.people
  set parent_id = person.id
  where student_id = any (p_student_ids) and kind = 'student' and parent_id is null and id <> person.id;
end;
$$;

revoke all on function public.people_link_contact_to_lead(bigint, bigint) from public, anon, authenticated;
revoke all on function public.people_link_contact_to_students(bigint, bigint[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What the page calls.

create or replace function public.people_can_edit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('leads', 'edit') or public.has_permission('students', 'edit')
$$;

revoke all on function public.people_can_edit() from public, anon;
grant execute on function public.people_can_edit() to authenticated;

-- Makes sure every WhatsApp contact the inbox shows has a person. p_contacts is
-- [{"contact_id": 12, "name": "...", "phone": "60123456789" | null, "role": "parent" | "student" | null}].
-- A contact that already has a person is left alone, except that a plain contact takes the role the
-- team gave the chat.
create or replace function public.ensure_contact_people(p_contacts jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c jsonb;
  made integer := 0;
  contact_kind text;
  contact_phone text;
begin
  if not public.people_can_edit() then
    raise exception 'Not allowed.';
  end if;

  for c in select * from jsonb_array_elements(coalesce(p_contacts, '[]'::jsonb)) loop
    if (c ->> 'contact_id') is null then
      continue;
    end if;
    contact_kind := case when c ->> 'role' in ('parent', 'student') then c ->> 'role' else 'contact' end;
    contact_phone := public.people_digits(c ->> 'phone');

    insert into public.people (kind, full_name, phone, chatwoot_contact_id)
    values (
      contact_kind,
      left(nullif(btrim(c ->> 'name'), ''), 200),
      contact_phone,
      (c ->> 'contact_id')::bigint
    )
    on conflict (chatwoot_contact_id) do nothing;
    if found then
      made := made + 1;
    elsif contact_kind in ('parent', 'student') then
      update public.people set kind = contact_kind
      where chatwoot_contact_id = (c ->> 'contact_id')::bigint and kind = 'contact';
    end if;
  end loop;
  return made;
end;
$$;

create or replace function public.link_contact_to_lead(p_contact_id bigint, p_lead_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.people_can_edit() then
    raise exception 'Not allowed.';
  end if;
  perform public.people_link_contact_to_lead(p_contact_id, p_lead_id);
end;
$$;

create or replace function public.link_contact_to_students(p_contact_id bigint, p_student_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.people_can_edit() then
    raise exception 'Not allowed.';
  end if;
  perform public.people_link_contact_to_students(p_contact_id, p_student_ids);
end;
$$;

-- The team said who is on the other end of this chat.
create or replace function public.set_contact_role(p_contact_id bigint, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.people_can_edit() then
    raise exception 'Not allowed.';
  end if;
  if p_role is null or p_role not in ('parent', 'student') then
    return;
  end if;
  -- Only a person nobody has placed yet changes by this; a placed person keeps what they are.
  update public.people
  set kind = p_role
  where chatwoot_contact_id = p_contact_id and kind = 'contact';
end;
$$;

revoke all on function public.ensure_contact_people(jsonb) from public, anon;
revoke all on function public.link_contact_to_lead(bigint, bigint) from public, anon;
revoke all on function public.link_contact_to_students(bigint, bigint[]) from public, anon;
revoke all on function public.set_contact_role(bigint, text) from public, anon;
grant execute on function public.ensure_contact_people(jsonb) to authenticated;
grant execute on function public.link_contact_to_lead(bigint, bigint) to authenticated;
grant execute on function public.link_contact_to_students(bigint, bigint[]) to authenticated;
grant execute on function public.set_contact_role(bigint, text) to authenticated;
