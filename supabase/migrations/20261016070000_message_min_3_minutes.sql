-- A message can be set as little as 3 minutes before the event (it was 5). Only the check on save
-- changes: automation_flows_validate() is the one from 20261016060000 with the lower bound 3.
-- Flows saved before this are all still valid, and the runner is not touched.

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
      if coalesce(n ->> 'mins', '') !~ '^[0-9]{1,5}$' or (n ->> 'mins')::integer not between 3 and 10080 then
        raise exception 'A message must be set 3 minutes to 7 days before.';
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
    -- The trigger and a message have one way out ("out"); a condition has Yes and No.
    if (from_type in ('trigger', 'message') and coalesce(e ->> 'port', '') <> 'out')
       or (from_type = 'condition' and coalesce(e ->> 'port', '') not in ('yes', 'no')) then
      raise exception 'A line starts from an unknown point.';
    end if;
  end loop;

  return new;
end;
$$;
