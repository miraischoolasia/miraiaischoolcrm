-- Adds a tag to, or takes a tag off, many leads in one go (Leads > select leads >
-- bulk actions). Only the leads that really change are touched, so the number it
-- returns is the number of leads that changed, and a lead that already has the
-- tag (or never had it) keeps its last-updated time.
--
-- It runs as the caller, so only accounts that may edit leads change anything,
-- and the tag check on leads still applies: a tag id that is not a tag is
-- refused when adding.

create or replace function public.bulk_set_lead_tag(
  p_lead_ids bigint[],
  p_tag_id bigint,
  p_add boolean
)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  if p_add then
    update public.leads
    set tag_ids = (
      select coalesce(array_agg(distinct t order by t), '{}'::bigint[])
      from unnest(tag_ids || p_tag_id) as t
    )
    where id = any (p_lead_ids)
      and not (p_tag_id = any (tag_ids));
  else
    update public.leads
    set tag_ids = array_remove(tag_ids, p_tag_id)
    where id = any (p_lead_ids)
      and p_tag_id = any (tag_ids);
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.bulk_set_lead_tag(bigint[], bigint, boolean) from public, anon;
grant execute on function public.bulk_set_lead_tag(bigint[], bigint, boolean) to authenticated;
