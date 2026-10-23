-- Leads settings > Sources, PIC & Tags: the school puts its tags (and the other names) in its own order by
-- dragging them. Every list of tags in the CRM (Leads, Inbox, the filters, the pickers) follows that order; a
-- hidden name always comes after the shown ones. A name that was never moved keeps its place by id, so nothing
-- changes for a school until someone drags.

alter table public.lead_options
  add column if not exists sort_order integer;

comment on column public.lead_options.sort_order is
  'The school''s own order of the names of one kind (null: never moved, after the moved ones, by id).';

-- Saves a new order in one go: the ids in the order wanted. Runs as the person, so only someone who may edit
-- Leads (the lead_options update policy) changes anything; ids of other kinds keep their own numbers.
create or replace function public.set_lead_option_order(p_ids bigint[])
returns void
language sql
security invoker
set search_path = public
as $$
  update public.lead_options o
  set sort_order = t.position::integer
  from unnest(p_ids) with ordinality as t(id, position)
  where o.id = t.id
    and o.sort_order is distinct from t.position::integer;
$$;

revoke all on function public.set_lead_option_order(bigint[]) from public, anon;
grant execute on function public.set_lead_option_order(bigint[]) to authenticated;
