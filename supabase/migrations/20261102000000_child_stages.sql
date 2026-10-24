-- A stage for each child of a lead.
--
-- A family with two children is not one step along the pipeline: one child can have booked HOA while the other is
-- only Contacted. Each child in leads.children may now carry its own `stage` (the key of one of the school's
-- lead_stages). A child without a `stage` follows the family, so every existing lead is unchanged and nothing is
-- migrated.
--
-- leads.status stays what every screen, flow and stage rule already reads: it is the family's stage, worked out
-- from the children as the child who still needs following up (boss rule 2026-10-23):
--   * a child that is Lost is not counted, a child that is Converted is not counted;
--   * of the others, the child furthest BEHIND (lowest stage order) is the family's stage;
--   * when nobody is left: all Lost -> Lost; otherwise (everybody Converted or Lost) -> Converted.
-- The roll-up runs only when a person (or a rule) writes the children list and at least one child has its own
-- stage; a lead whose children have no stage of their own is never touched, and a change of status alone is left alone.

create or replace function public.lead_children_rollup(p_children jsonb, p_status text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_open text;
  v_converted integer := 0;
  v_lost integer := 0;
  v_total integer := 0;
begin
  if p_children is null or jsonb_typeof(p_children) <> 'array' or jsonb_array_length(p_children) = 0 then
    return p_status;
  end if;

  select
    (array_agg(stage_key order by order_no, stage_key) filter (where stage_key not in ('converted', 'lost')))[1],
    count(*) filter (where stage_key = 'converted'),
    count(*) filter (where stage_key = 'lost'),
    count(*)
  into v_open, v_converted, v_lost, v_total
  from (
    select c.stage_key, coalesce(s.sort_order, 0) as order_no
    from (
      select coalesce(
               (select ls.key from public.lead_stages ls where ls.key = nullif(btrim(child ->> 'stage'), '')),
               p_status
             ) as stage_key
      from jsonb_array_elements(p_children) child
    ) c
    left join public.lead_stages s on s.key = c.stage_key
  ) x;

  if v_open is not null then
    return v_open;
  end if;
  if v_lost = v_total then
    return 'lost';
  end if;
  return 'converted';
end;
$$;

revoke all on function public.lead_children_rollup(jsonb, text) from public, anon;
grant execute on function public.lead_children_rollup(jsonb, text) to authenticated, service_role;

create or replace function public.leads_child_stage_rollup()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.children is not distinct from old.children then
    return new;
  end if;
  if new.children is null or jsonb_typeof(new.children) <> 'array' then
    return new;
  end if;
  -- Only a lead that has a child with a stage of its own is worked out.
  if not exists (
    select 1 from jsonb_array_elements(new.children) child
    where nullif(btrim(child ->> 'stage'), '') is not null
  ) then
    return new;
  end if;
  new.status := public.lead_children_rollup(new.children, new.status);
  return new;
end;
$$;

revoke all on function public.leads_child_stage_rollup() from public, anon, authenticated;

drop trigger if exists leads_child_stage_rollup on public.leads;
create trigger leads_child_stage_rollup
before insert or update of children on public.leads
for each row execute function public.leads_child_stage_rollup();
