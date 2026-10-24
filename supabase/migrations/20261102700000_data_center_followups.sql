-- Data Center: everyone's automatic follow-up rate (boss 2026-10-23: EC performance is an open ranking, so the
-- follow-up rate is too; numbers only, no leads). Department 1's view followup_completion (20261102500000) shows a
-- person only their own rows (security_invoker); this reads it for the Data Center, for whoever has its tick.

create or replace function public.data_center_followups(p_month date)
returns table (
  assignee_id bigint,
  scheduled integer,
  done integer,
  on_time integer,
  overdue integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('data_center', 'view') then
    raise exception 'You do not have the Data Center tick.' using errcode = '42501';
  end if;
  if p_month is null then
    raise exception 'Pick a month.';
  end if;
  return query
  select f.assignee_id, f.scheduled::integer, f.done::integer, f.on_time::integer, f.overdue::integer
  from public.followup_completion f
  where f.month = date_trunc('month', p_month)::date;
end;
$$;

revoke all on function public.data_center_followups(date) from public, anon;
grant execute on function public.data_center_followups(date) to authenticated;
