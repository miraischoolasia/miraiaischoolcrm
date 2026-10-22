-- Checks for 20261030500000_quick_reply_ten_rows: a quick reply holds up to ten rows, not eleven.
-- Run on a scratch database that has every migration (never the live database); it rolls back.

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

insert into public.quick_replies (title, steps)
select 'QR ten rows test', jsonb_agg(jsonb_build_object('kind', 'text', 'text', 'Row ' || n)) from generate_series(1, 10) n;
select pg_temp.ok((select jsonb_array_length(steps) = 10 from public.quick_replies where title = 'QR ten rows test'), 'ten rows are kept');

do $$
begin
  insert into public.quick_replies (title, steps)
  select 'QR eleven rows test', jsonb_agg(jsonb_build_object('kind', 'text', 'text', 'Row ' || n)) from generate_series(1, 11) n;
  raise exception 'FAIL eleven rows are refused (no error)';
exception when check_violation then
  raise notice 'PASS eleven rows are refused';
end;
$$;

rollback;
