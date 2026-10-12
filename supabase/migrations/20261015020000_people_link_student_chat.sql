-- Fixes tying a student's own chat to the enrolled student.
--
-- A chat the team marked "the student themself" and tied to an enrolled student is that student. The
-- first version made the enrolled student's row before it looked, so the chat and the student ended up
-- as two people (one with the name, one with the chat). Now the chat is tied first, and when the
-- student already has a row without a chat, the chat joins that row.

create or replace function public.people_link_contact_to_students(p_contact_id bigint, p_student_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  person public.people%rowtype;
  holder public.people%rowtype;
  sid bigint;
begin
  select * into person from public.people where chatwoot_contact_id = p_contact_id;
  if not found or p_student_ids is null or cardinality(p_student_ids) = 0 then
    return;
  end if;

  -- The chat of the student themself: it is that student.
  if person.kind = 'student' then
    if cardinality(p_student_ids) = 1 and person.student_id is null then
      select * into holder from public.people
        where student_id = p_student_ids[1] and id <> person.id
        order by id limit 1;
      if not found then
        update public.people set student_id = p_student_ids[1] where id = person.id;
      elsif holder.chatwoot_contact_id is null then
        -- The enrolled student already has a row without a chat: the chat joins that row.
        delete from public.people where id = person.id;
        update public.people
        set chatwoot_contact_id = p_contact_id,
            parent_id = coalesce(parent_id, person.parent_id),
            full_name = coalesce(full_name, person.full_name)
        where id = holder.id;
      end if;
    end if;
    perform public.sync_people_from_student(p_student_ids[1]);
    return;
  end if;

  foreach sid in array p_student_ids loop
    perform public.sync_people_from_student(sid);
  end loop;

  if person.kind = 'contact' then
    update public.people set kind = 'parent' where id = person.id;
  end if;
  -- Those students belong to this parent, unless they already belong to someone else.
  update public.people
  set parent_id = person.id
  where student_id = any (p_student_ids) and kind = 'student' and parent_id is null and id <> person.id;
end;
$$;

revoke all on function public.people_link_contact_to_students(bigint, bigint[]) from public, anon, authenticated;

-- One-off repair of the rows the first version left behind: a student chat with no name, whose parent
-- already has exactly one enrolled-student row without a chat. That chat is that student: it joins the row.
do $repair$
declare
  r record;
begin
  for r in
    select x.id as chat_row, x.chatwoot_contact_id as contact,
           (select y.id from public.people y
             where y.kind = 'student' and y.parent_id = x.parent_id and y.chatwoot_contact_id is null
               and y.student_id is not null) as student_row
    from public.people x
    where x.kind = 'student' and x.chatwoot_contact_id is not null and x.student_id is null
      and x.parent_id is not null and nullif(btrim(x.full_name), '') is null
      and (select count(*) from public.people y
            where y.kind = 'student' and y.parent_id = x.parent_id and y.chatwoot_contact_id is null
              and y.student_id is not null) = 1
  loop
    delete from public.people where id = r.chat_row;
    update public.people set chatwoot_contact_id = r.contact where id = r.student_row;
  end loop;
end
$repair$;
