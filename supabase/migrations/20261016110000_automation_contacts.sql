-- Send a message to a chosen contact instead of the family.
--
-- Until now every automation message went to the parent of the child the event is about. A message
-- block can now be sent to one saved contact instead (the team's own number, a teacher, anyone): the
-- contact is picked on the block ("Send to"). Typical use: a note for Lex when a class starts, or when
-- a child's lessons are about to run out.
--
-- * Contacts are a small list (name + number, up to 50). Everybody who can see Leads can read it; only
--   an admin adds, changes or removes one.
-- * A message block stores the contact as "contactId" in the flow graph. Leaving it out means the parent,
--   as before, so every flow saved so far keeps working.
-- * The contact must exist when the flow is saved, and a contact that a flow still uses cannot be
--   deleted.
-- * The message still goes to the approval queue like any other and is sent from the WhatsApp inbox
--   after someone approves it. It is not tied to the family's lead or student, so it never lands in the
--   parent's chat; {child}, {parent}, {time}, {date} and {class} are still the event's.
-- * "Send a test to my phone" sends everything to the tester's own number; a message meant for a contact
--   starts with "[TEST -> name]" so it can be told from the parent's.

-- ---------------------------------------------------------------------------------------------
-- The contacts
-- ---------------------------------------------------------------------------------------------

create table if not exists public.automation_contacts (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  -- Digits only, with the country code: 60123456789.
  phone text not null check (phone ~ '^[0-9]{8,15}$'),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.automation_contacts_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.automation_contacts) >= 50 then
    raise exception 'There can be up to 50 contacts.';
  end if;
  new.name := btrim(new.name);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists automation_contacts_before_write on public.automation_contacts;
create trigger automation_contacts_before_write
before insert or update on public.automation_contacts
for each row execute function public.automation_contacts_before_write();

-- A contact a flow still sends to cannot be removed.
create or replace function public.automation_contacts_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  flow_name text;
begin
  select f.name into flow_name
  from public.automation_flows f
  where exists (
    select 1
    from jsonb_array_elements(coalesce(f.graph -> 'nodes', '[]'::jsonb)) n
    where n ->> 'contactId' = old.id::text
  )
  limit 1;
  if flow_name is not null then
    raise exception 'The flow "%" still sends a message to this contact. Change that message first.', flow_name;
  end if;
  return old;
end;
$$;

drop trigger if exists automation_contacts_before_delete on public.automation_contacts;
create trigger automation_contacts_before_delete
before delete on public.automation_contacts
for each row execute function public.automation_contacts_before_delete();

alter table public.automation_contacts enable row level security;

create policy "automation_contacts_select_permitted"
on public.automation_contacts
for select to authenticated
using ((select public.has_permission('leads')));

create policy "automation_contacts_insert_admin"
on public.automation_contacts
for insert to authenticated
with check ((select public.is_admin()));

create policy "automation_contacts_update_admin"
on public.automation_contacts
for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "automation_contacts_delete_admin"
on public.automation_contacts
for delete to authenticated
using ((select public.is_admin()));

revoke all on public.automation_contacts from anon, authenticated;
grant select on public.automation_contacts to authenticated;
grant insert (name, phone) on public.automation_contacts to authenticated;
grant update (name, phone) on public.automation_contacts to authenticated;
grant delete on public.automation_contacts to authenticated;

-- ---------------------------------------------------------------------------------------------
-- A flow's message may only name a contact that exists
-- ---------------------------------------------------------------------------------------------

create or replace function public.automation_flows_validate_contacts()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  n jsonb;
begin
  for n in select value from jsonb_array_elements(coalesce(new.graph -> 'nodes', '[]'::jsonb)) as t(value) loop
    if n ->> 'type' = 'message' and n -> 'contactId' is not null and jsonb_typeof(n -> 'contactId') <> 'null' then
      if jsonb_typeof(n -> 'contactId') <> 'number'
         or not exists (select 1 from public.automation_contacts c where c.id = (n ->> 'contactId')::bigint) then
        raise exception 'A message is sent to a contact that does not exist. Pick the contact again.';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists automation_flows_validate_contacts on public.automation_flows;
create trigger automation_flows_validate_contacts
before insert or update of graph on public.automation_flows
for each row execute function public.automation_flows_validate_contacts();

-- ---------------------------------------------------------------------------------------------
-- The runner: a message with a contact goes to the contact's number
-- ---------------------------------------------------------------------------------------------

create or replace function automation.run_rules()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued integer := 0;
  added integer;
  is_paused boolean;
  f record;
  ev record;
  m record;
  due timestamptz;
  contact_id bigint;
  to_phone text;
  to_name text;
  to_lead bigint;
  to_student bigint;
begin
  -- Reminders for events that already started are no longer useful.
  update public.automation_queue
  set status = 'expired'
  where status = 'pending'
    and expires_at is not null
    and expires_at < now();

  -- Finished rows older than 90 days are tidied away.
  delete from public.automation_queue
  where status in ('sent', 'skipped', 'expired')
    and created_at < now() - interval '90 days';

  select s.paused into is_paused from public.automation_settings s limit 1;
  if coalesce(is_paused, false) then
    return 0;
  end if;

  for f in
    select id, name, trigger_type, graph
    from public.automation_flows
    where enabled
    order by id
  loop
    begin
      for ev in
        select *
        from automation.rule_events e
        where e.trigger_type = f.trigger_type
          and e.starts_at > now()
          and e.starts_at <= now() + interval '8 days'
      loop
        for m in select * from automation.flow_messages(f.graph, ev.age, ev.classroom_id) loop
          due := ev.starts_at - make_interval(mins => m.mins);
          if due <= now() + interval '3 hours' and due >= now() - interval '1 hour' then
            -- Who gets it: the family of the event, or the contact named on the block.
            select nullif(x ->> 'contactId', '')::bigint into contact_id
            from jsonb_array_elements(coalesce(f.graph -> 'nodes', '[]'::jsonb)) x
            where x ->> 'id' = m.node_id
            limit 1;

            to_phone := ev.phone;
            to_name := ev.parent_name;
            to_lead := ev.lead_id;
            to_student := ev.student_id;
            if contact_id is not null then
              select c.phone, c.name into to_phone, to_name
              from public.automation_contacts c
              where c.id = contact_id;
              if not found then
                raise exception 'A message is sent to a contact that no longer exists.';
              end if;
              to_lead := null;
              to_student := null;
            end if;

            insert into public.automation_queue
              (rule_key, rule_name, dedupe_key, phone, parent_name, child_name, lead_id, student_id,
               message, due_at, expires_at)
            values (
              'flow_' || f.id,
              f.name,
              'flow:' || f.id || ':' || m.node_id || ':' || ev.event_key,
              to_phone,
              left(to_name, 200),
              left(ev.child_name, 200),
              to_lead,
              to_student,
              left(
                replace(replace(replace(replace(replace(m.message_text,
                  '{child}', coalesce(nullif(btrim(ev.child_name), ''), 'your child')),
                  '{parent}', coalesce(nullif(btrim(ev.parent_name), ''), 'there')),
                  '{time}', ev.start_label),
                  '{date}', to_char(ev.class_date, 'Dy DD Mon')),
                  '{class}', coalesce(ev.class_label, 'class')),
                4000),
              due,
              ev.starts_at
            )
            on conflict (dedupe_key) do nothing;
            get diagnostics added = row_count;
            queued := queued + added;
          end if;
        end loop;
      end loop;

      update public.automation_flows set last_run_at = now(), last_error = null where id = f.id;
    exception when others then
      -- One broken flow must not stop the others; the page shows what went wrong.
      update public.automation_flows
      set last_run_at = now(), last_error = left(sqlerrm, 500)
      where id = f.id;
    end;
  end loop;

  return queued;
end;
$$;

revoke all on function automation.run_rules() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- "Send a test to my phone": a message meant for a contact is marked, still sent to the tester
-- ---------------------------------------------------------------------------------------------

create or replace function public.queue_automation_test(
  p_flow_id bigint,
  p_phone text,
  p_age integer default null,
  p_classroom_id bigint default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  f record;
  m record;
  digits text;
  waiting integer;
  added integer := 0;
  n integer;
  contact_name text;
begin
  if not (select public.is_admin()) then
    raise exception 'Only an admin can send a test.';
  end if;

  digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if digits !~ '^[0-9]{8,15}$' then
    raise exception 'Type the phone number with its country code, like 60123456789.';
  end if;
  if p_age is not null and p_age not between 0 and 30 then
    raise exception 'Ages must be whole numbers from 0 to 30.';
  end if;

  select id, name, graph into f from public.automation_flows where id = p_flow_id;
  if not found then
    raise exception 'This flow was not found. Save it first.';
  end if;

  select count(*) into waiting
  from public.automation_queue
  where rule_key like 'flow_test_%' and status = 'pending';
  if waiting >= 20 then
    raise exception 'There are already 20 test messages waiting. Approve or skip some first.';
  end if;

  for m in select * from automation.flow_messages(f.graph, p_age, p_classroom_id) loop
    select c.name into contact_name
    from jsonb_array_elements(coalesce(f.graph -> 'nodes', '[]'::jsonb)) x
    join public.automation_contacts c on c.id = nullif(x ->> 'contactId', '')::bigint
    where x ->> 'id' = m.node_id
    limit 1;

    insert into public.automation_queue
      (rule_key, rule_name, dedupe_key, phone, parent_name, child_name, message, due_at, expires_at)
    values (
      'flow_test_' || f.id,
      left('TEST · ' || f.name, 120),
      'test:' || f.id || ':' || m.node_id || ':' || gen_random_uuid()::text,
      digits,
      coalesce(contact_name, 'Mrs Lim'),
      'Ethan',
      left(
        case when contact_name is null then '[TEST] ' else '[TEST -> ' || contact_name || '] ' end ||
        replace(replace(replace(replace(replace(m.message_text,
          '{child}', 'Ethan'),
          '{parent}', 'Mrs Lim'),
          '{time}', '8:30 pm'),
          '{date}', to_char(now() at time zone 'Asia/Kuala_Lumpur', 'Dy DD Mon')),
          '{class}', 'Coder A'),
        4000),
      now(),
      now() + interval '1 hour'
    );
    get diagnostics n = row_count;
    added := added + n;
  end loop;

  return added;
end;
$$;

revoke all on function public.queue_automation_test(bigint, text, integer, bigint) from public, anon;
grant execute on function public.queue_automation_test(bigint, text, integer, bigint) to authenticated;
