-- Checks for 20261102000000_child_stages.sql: each child of a lead may carry its own stage; the lead's status is the
-- child who still needs following up.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/child_stages.sql

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

create function pg_temp.stage(p_lead bigint) returns text language sql as $$
  select status from public.leads where id = p_lead;
$$;

-- The function itself.
select pg_temp.ok(public.lead_children_rollup('[]', 'contacted') = 'contacted', 'no children: the family stage');
select pg_temp.ok(public.lead_children_rollup('[{"name":"A","age":7},{"name":"B","age":9}]', 'trial_scheduled') = 'trial_scheduled',
  'children without a stage follow the family');
select pg_temp.ok(public.lead_children_rollup('[{"name":"A","age":7,"stage":"trial_scheduled"},{"name":"B","age":9}]', 'contacted') = 'contacted',
  'a child without a stage counts as the family stage (furthest behind wins)');
select pg_temp.ok(public.lead_children_rollup('[{"name":"A","age":7,"stage":"trial_scheduled"},{"name":"B","age":9,"stage":"trial_completed"}]', 'new') = 'trial_scheduled',
  'the child furthest behind is the family stage');
select pg_temp.ok(public.lead_children_rollup('[{"name":"A","age":7,"stage":"converted"},{"name":"B","age":9,"stage":"contacted"}]', 'new') = 'contacted',
  'a Converted child is not counted while another still needs following up');
select pg_temp.ok(public.lead_children_rollup('[{"name":"A","age":7,"stage":"lost"},{"name":"B","age":9,"stage":"trial_scheduled"}]', 'new') = 'trial_scheduled',
  'a Lost child is not counted');
select pg_temp.ok(public.lead_children_rollup('[{"name":"A","age":7,"stage":"lost"},{"name":"B","age":9,"stage":"lost"}]', 'new') = 'lost',
  'every child Lost: Lost');
select pg_temp.ok(public.lead_children_rollup('[{"name":"A","age":7,"stage":"converted"},{"name":"B","age":9,"stage":"converted"}]', 'new') = 'converted',
  'every child Converted: Converted');
select pg_temp.ok(public.lead_children_rollup('[{"name":"A","age":7,"stage":"converted"},{"name":"B","age":9,"stage":"lost"}]', 'new') = 'converted',
  'Converted and Lost only: Converted');
select pg_temp.ok(public.lead_children_rollup('[{"name":"A","age":7,"stage":"no_such_stage"}]', 'contacted') = 'contacted',
  'a stage the school does not have is read as the family stage');

-- On the table.
insert into public.leads (id, full_name, phone, status, children) overriding system value
values (99801, 'Plain Family', '60123480801', 'contacted', '[{"name":"A","age":7,"phone":null},{"name":"B","age":9,"phone":null}]'),
       (99802, 'Stage Family', '60123480802', 'contacted',
        '[{"name":"A","age":7,"phone":null,"stage":"trial_scheduled"},{"name":"B","age":9,"phone":null}]');
select pg_temp.ok(pg_temp.stage(99801) = 'contacted', 'a lead whose children have no stage is left alone');
select pg_temp.ok(pg_temp.stage(99802) = 'contacted', 'on insert: the child furthest behind is the family stage');

update public.leads set children = '[{"name":"A","age":7,"phone":null,"stage":"trial_scheduled"},{"name":"B","age":9,"phone":null,"stage":"trial_scheduled"}]' where id = 99802;
select pg_temp.ok(pg_temp.stage(99802) = 'trial_scheduled', 'both children booked: Trial Scheduled');

update public.leads set children = '[{"name":"A","age":7,"phone":null,"stage":"converted"},{"name":"B","age":9,"phone":null,"stage":"trial_scheduled"}]' where id = 99802;
select pg_temp.ok(pg_temp.stage(99802) = 'trial_scheduled', 'one child Converted, the other still booked: the family is Trial Scheduled');

update public.leads set children = '[{"name":"A","age":7,"phone":null,"stage":"converted"},{"name":"B","age":9,"phone":null,"stage":"converted"}]' where id = 99802;
select pg_temp.ok(pg_temp.stage(99802) = 'converted', 'every child Converted: the family is Converted');

-- A change of status alone is not worked out again (rules and people still move the family).
update public.leads set status = 'contacted' where id = 99802;
select pg_temp.ok(pg_temp.stage(99802) = 'contacted', 'changing the status alone does not run the roll-up');

-- Other columns do not run it either.
update public.leads set notes = 'x' where id = 99802;
select pg_temp.ok(pg_temp.stage(99802) = 'contacted', 'another column does not run the roll-up');

-- Taking the stages away from the children leaves the status where it is.
update public.leads set children = '[{"name":"A","age":7,"phone":null},{"name":"B","age":9,"phone":null}]' where id = 99802;
select pg_temp.ok(pg_temp.stage(99802) = 'contacted', 'children with no stage again: the status stays');

rollback;
