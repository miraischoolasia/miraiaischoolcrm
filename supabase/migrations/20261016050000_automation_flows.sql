-- Automation flows: the drag-and-drop canvas on the Automations page.
--
-- A flow is one trigger (a regular class starts, a trial starts, ...) and a small graph:
--   trigger --> condition (age / classroom) --Yes--> message "1 hour before: ..."
--                                           --No---> message "1 day before: ..."
-- Each message block carries its own "how long before the event" and its text, so a flow can send
-- several messages for one event, and different messages to different children.
--
-- This replaces the single-card automation_rules from the previous step: the rules already saved are
-- copied into flows first (same trigger, wait, filters, message and on/off), then the old table is
-- removed. The runner automation.run_rules() now reads flows.
--
-- * Everybody who can see Leads can read the flows; only an admin can add, change or remove one.
-- * The graph is checked on every save (known block types, sizes, a message 5 minutes to 7 days
--   before), and a flow that still fails when it runs is skipped and shows its error on the page, so
--   one broken flow never stops the others.
-- * Nothing is sent by a flow: it only adds messages to automation_queue, which people approve.

-- ---------------------------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------------------------

create table if not exists public.automation_flows (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  trigger_type text not null
    check (trigger_type in ('class_start', 'replacement_start', 'trial_start', 'zoom_start')),
  enabled boolean not null default false,
  -- {"trigger":{"x":..,"y":..},
  --  "nodes":[{"id":"m1","type":"message","x":..,"y":..,"mins":60,"text":"Hi {child}"},
  --           {"id":"c1","type":"condition","x":..,"y":..,"kind":"age","min":10,"max":null},
  --           {"id":"c2","type":"condition","x":..,"y":..,"kind":"classroom","ids":[1,2]}],
  --  "edges":[{"from":"trigger","port":"out","to":"c1"},{"from":"c1","port":"yes","to":"m1"}]}
  graph jsonb not null default '{"trigger":{"x":40,"y":140},"nodes":[],"edges":[]}'::jsonb,
  last_run_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 600),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.automation_flows_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  g jsonb := new.graph;
  nodes jsonb;
  edges jsonb;
  n jsonb;
  e jsonb;
  ids text[] := array['trigger'];
  nid text;
  from_type text;
  lim text;
begin
  if g is null or jsonb_typeof(g) <> 'object' then
    raise exception 'The flow is not valid.';
  end if;
  nodes := coalesce(g -> 'nodes', '[]'::jsonb);
  edges := coalesce(g -> 'edges', '[]'::jsonb);
  if jsonb_typeof(nodes) <> 'array' or jsonb_typeof(edges) <> 'array' then
    raise exception 'The flow is not valid.';
  end if;
  if jsonb_array_length(nodes) > 40 then
    raise exception 'A flow can have up to 40 blocks.';
  end if;
  if jsonb_array_length(edges) > 80 then
    raise exception 'A flow can have up to 80 lines.';
  end if;

  for n in select value from jsonb_array_elements(nodes) as t(value) loop
    nid := n ->> 'id';
    if nid is null or nid !~ '^[A-Za-z0-9_-]{1,20}$' or nid = any (ids) then
      raise exception 'A block has a missing or repeated id.';
    end if;
    ids := ids || nid;

    if n ->> 'type' = 'message' then
      if coalesce(n ->> 'mins', '') !~ '^[0-9]{1,5}$' or (n ->> 'mins')::integer not between 5 and 10080 then
        raise exception 'A message must be set 5 minutes to 7 days before.';
      end if;
      if char_length(btrim(coalesce(n ->> 'text', ''))) not between 1 and 3000 then
        raise exception 'Every message needs text (up to 3000 characters).';
      end if;
    elsif n ->> 'type' = 'condition' then
      if n ->> 'kind' = 'age' then
        foreach lim in array array['min', 'max'] loop
          if n ->> lim is not null and ((n ->> lim) !~ '^[0-9]{1,2}$' or (n ->> lim)::integer > 30) then
            raise exception 'Ages must be whole numbers from 0 to 30.';
          end if;
        end loop;
        if n ->> 'min' is null and n ->> 'max' is null then
          raise exception 'An age condition needs a lowest or a highest age.';
        end if;
        if n ->> 'min' is not null and n ->> 'max' is not null and (n ->> 'min')::integer > (n ->> 'max')::integer then
          raise exception 'The lowest age is higher than the highest age.';
        end if;
      elsif n ->> 'kind' = 'classroom' then
        if jsonb_typeof(n -> 'ids') <> 'array'
           or jsonb_array_length(n -> 'ids') not between 1 and 50
           or exists (select 1 from jsonb_array_elements(n -> 'ids') x where jsonb_typeof(x) <> 'number') then
          raise exception 'A class condition needs at least one class.';
        end if;
      else
        raise exception 'A condition has an unknown kind.';
      end if;
    else
      raise exception 'A block has an unknown type.';
    end if;
  end loop;

  for e in select value from jsonb_array_elements(edges) as t(value) loop
    if not (e ->> 'from') = any (ids) or not (e ->> 'to') = any (ids) or (e ->> 'to') = 'trigger' then
      raise exception 'A line connects to a block that does not exist.';
    end if;
    if e ->> 'from' = 'trigger' then
      from_type := 'trigger';
    else
      select x ->> 'type' into from_type
      from jsonb_array_elements(nodes) x
      where x ->> 'id' = e ->> 'from'
      limit 1;
    end if;
    if from_type = 'message' then
      raise exception 'A message is the end of a line; nothing can follow it.';
    end if;
    if (from_type = 'trigger' and e ->> 'port' <> 'out')
       or (from_type = 'condition' and coalesce(e ->> 'port', '') not in ('yes', 'no')) then
      raise exception 'A line starts from an unknown point.';
    end if;
  end loop;

  return new;
end;
$$;

create or replace function public.automation_flows_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only a real edit moves updated_at; the runner writing last_run_at does not.
  if (new.name, new.trigger_type, new.enabled, new.graph)
     is distinct from (old.name, old.trigger_type, old.enabled, old.graph) then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists automation_flows_validate on public.automation_flows;
create trigger automation_flows_validate
before insert or update of graph on public.automation_flows
for each row execute function public.automation_flows_validate();

drop trigger if exists automation_flows_touch on public.automation_flows;
create trigger automation_flows_touch
before update on public.automation_flows
for each row execute function public.automation_flows_touch();

alter table public.automation_flows enable row level security;

create policy "automation_flows_select_permitted"
on public.automation_flows
for select to authenticated
using ((select public.has_permission('leads')));

create policy "automation_flows_insert_admin"
on public.automation_flows
for insert to authenticated
with check ((select public.is_admin()));

create policy "automation_flows_update_admin"
on public.automation_flows
for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "automation_flows_delete_admin"
on public.automation_flows
for delete to authenticated
using ((select public.is_admin()));

revoke all on public.automation_flows from anon, authenticated;
grant select on public.automation_flows to authenticated;
grant insert (name, trigger_type, enabled, graph) on public.automation_flows to authenticated;
grant update (name, trigger_type, enabled, graph) on public.automation_flows to authenticated;
grant delete on public.automation_flows to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Carry over the rules saved so far: each becomes
--   trigger -> [class condition] -> [age condition] -> message
-- ---------------------------------------------------------------------------------------------

do $$
declare
  r record;
  nodes jsonb;
  edges jsonb;
  prev text;
  x integer;
begin
  if to_regclass('public.automation_rules') is null then
    return;
  end if;
  if exists (select 1 from public.automation_flows) then
    return;
  end if;

  for r in select * from public.automation_rules order by id loop
    nodes := '[]'::jsonb;
    edges := '[]'::jsonb;
    prev := 'trigger';
    x := 290;

    if cardinality(r.classroom_ids) > 0 then
      nodes := nodes || jsonb_build_array(jsonb_build_object(
        'id', 'c1', 'type', 'condition', 'kind', 'classroom', 'ids', to_jsonb(r.classroom_ids), 'x', x, 'y', 140));
      edges := edges || jsonb_build_array(jsonb_build_object('from', prev, 'port', 'out', 'to', 'c1'));
      prev := 'c1';
      x := x + 240;
    end if;

    if r.age_min is not null or r.age_max is not null then
      nodes := nodes || jsonb_build_array(jsonb_build_object(
        'id', 'c2', 'type', 'condition', 'kind', 'age', 'min', r.age_min, 'max', r.age_max, 'x', x, 'y', 140));
      edges := edges || jsonb_build_array(jsonb_build_object(
        'from', prev, 'port', case when prev = 'trigger' then 'out' else 'yes' end, 'to', 'c2'));
      prev := 'c2';
      x := x + 240;
    end if;

    nodes := nodes || jsonb_build_array(jsonb_build_object(
      'id', 'm1', 'type', 'message', 'mins', r.offset_minutes, 'text', r.message, 'x', x, 'y', 140));
    edges := edges || jsonb_build_array(jsonb_build_object(
      'from', prev, 'port', case when prev = 'trigger' then 'out' else 'yes' end, 'to', 'm1'));

    insert into public.automation_flows (name, trigger_type, enabled, graph, created_by, created_at)
    values (
      r.name,
      r.trigger_type,
      r.enabled,
      jsonb_build_object('trigger', jsonb_build_object('x', 24, 'y', 140), 'nodes', nodes, 'edges', edges),
      r.created_by,
      r.created_at
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Which messages one event gets from a flow: walk the graph from the trigger, answering each
-- condition for this child, and collect the message blocks reached.
-- ---------------------------------------------------------------------------------------------

create or replace function automation.flow_messages(p_graph jsonb, p_age integer, p_classroom bigint)
returns table (node_id text, mins integer, message_text text)
language plpgsql
stable
set search_path = ''
as $$
declare
  stack text[] := array['trigger'];
  seen text[] := '{}';
  cur text;
  node jsonb;
  edge jsonb;
  port text;
  lo integer;
  hi integer;
begin
  while coalesce(array_length(stack, 1), 0) > 0 loop
    cur := stack[1];
    stack := coalesce(stack[2:array_length(stack, 1)], '{}');
    if cur = any (seen) then
      continue;
    end if;
    seen := seen || cur;

    if cur = 'trigger' then
      port := 'out';
    else
      select x into node
      from jsonb_array_elements(coalesce(p_graph -> 'nodes', '[]'::jsonb)) x
      where x ->> 'id' = cur
      limit 1;
      if node is null then
        continue;
      end if;

      if node ->> 'type' = 'message' then
        node_id := cur;
        mins := (node ->> 'mins')::integer;
        message_text := node ->> 'text';
        return next;
        continue;
      end if;

      -- A condition: an unknown age or classroom never matches, so the child goes down No.
      if node ->> 'kind' = 'age' then
        lo := (node ->> 'min')::integer;
        hi := (node ->> 'max')::integer;
        port := case
          when p_age is not null and (lo is null or p_age >= lo) and (hi is null or p_age <= hi) then 'yes'
          else 'no'
        end;
      elsif node ->> 'kind' = 'classroom' then
        port := case
          when p_classroom is not null
            and exists (
              select 1 from jsonb_array_elements(node -> 'ids') i where (i #>> '{}')::bigint = p_classroom
            ) then 'yes'
          else 'no'
        end;
      else
        port := 'no';
      end if;
    end if;

    for edge in select value from jsonb_array_elements(coalesce(p_graph -> 'edges', '[]'::jsonb)) as t(value) loop
      if edge ->> 'from' = cur and edge ->> 'port' = port then
        stack := stack || (edge ->> 'to');
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function automation.flow_messages(jsonb, integer, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The runner, now reading flows. Same timing as before: a message is queued from 3 hours before it
-- is due, up to 1 hour late, and never for an event that has already started.
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
            insert into public.automation_queue
              (rule_key, rule_name, dedupe_key, phone, parent_name, child_name, lead_id, student_id,
               message, due_at, expires_at)
            values (
              'flow_' || f.id,
              f.name,
              'flow:' || f.id || ':' || m.node_id || ':' || ev.event_key,
              ev.phone,
              left(ev.parent_name, 200),
              left(ev.child_name, 200),
              ev.lead_id,
              ev.student_id,
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
-- The single-card rules are now flows.
-- ---------------------------------------------------------------------------------------------

drop table if exists public.automation_rules;
drop function if exists public.automation_rules_touch();
