-- Checks for 20261031900000_quotation_links_qr.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/quotation_links_qr.sql

begin;

create function pg_temp.fails(p_sql text, p_pattern text, p_name text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then
      raise notice 'PASS % [%]', p_name, sqlerrm;
      return;
    end if;
    raise exception 'FAIL % (wrong error: %)', p_name, sqlerrm;
  end;
  raise exception 'FAIL % (no error)', p_name;
end;
$$;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

-- 1 admin, 2 EC (quotations edit), 3 viewer (quotations view), 4 nothing.
insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000005' || lpad(n::text, 2, '0'))::uuid, 'qlink' || n || '@mirai.internal',
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 4) n;

insert into public.teachers (id, full_name, username, role, is_active, auth_user_id, permissions)
overriding system value
values
  (9501, 'Link Admin', 'qlink_admin', 'admin', true, '00000000-0000-0000-0000-000000000501', '{}'),
  (9502, 'Link EC', 'qlink_ec', 'staff', true, '00000000-0000-0000-0000-000000000502', '{"quotations": {"level": "edit"}}'),
  (9503, 'Link Viewer', 'qlink_view', 'staff', true, '00000000-0000-0000-0000-000000000503', '{"quotations": {"level": "view"}}'),
  (9504, 'Link None', 'qlink_none', 'staff', true, '00000000-0000-0000-0000-000000000504', '{}');

create function pg_temp.as_user(p_n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005' || lpad(p_n::text, 2, '0'), true);
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000005' || lpad(p_n::text, 2, '0'), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function pg_temp.as_user(int) to authenticated;
grant execute on function pg_temp.ok(boolean, text) to authenticated;
grant execute on function pg_temp.fails(text, text, text) to authenticated;

-- The QR bucket: public, small pictures only.
select pg_temp.ok((select public and file_size_limit = 2097152 and allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
  from storage.buckets where id = 'quotation-public'), 'QR bucket is public, 2 MB, pictures only');

-- The new columns and event kinds.
select pg_temp.ok((select count(*) = 4 from information_schema.columns where table_schema = 'public' and table_name = 'quotations'
  and column_name in ('after_pay_url', 'contact_url', 'parent_said_paid_at', 'parent_said_wrong_at')), 'quotations has the 4 new columns');
select pg_temp.ok(pg_get_constraintdef((select oid from pg_constraint where conname = 'quotation_events_kind_check')) like '%parent_paid%parent_wrong%',
  'events take parent_paid and parent_wrong');

set local role authenticated;

-- The EC sets their own links.
select pg_temp.as_user(2);
select public.set_quotation_staff_link(9502, 'https://wa.me/60123456789?text=Hi', null);
select pg_temp.ok((select after_pay_url = 'https://wa.me/60123456789?text=Hi' and contact_url is null from public.quotation_staff_links where teacher_id = 9502), 'the EC sets their own after-payment link');
select pg_temp.fails($$select public.set_quotation_staff_link(9503, 'https://x.example', null)$$, 'only admin', 'the EC cannot set someone else''s');
select pg_temp.fails($$select public.set_quotation_staff_link(9502, 'http://not-safe.example', null)$$, 'must start with https', 'only https links');
select pg_temp.fails($$select public.set_quotation_staff_link(9502, 'https://a b', null)$$, 'must start with https', 'no spaces in a link');
select pg_temp.fails($$insert into public.quotation_staff_links (teacher_id, after_pay_url) values (9502, 'https://x')$$, 'permission denied', 'no direct writes');
select pg_temp.fails($$insert into storage.objects (bucket_id, name, owner) values ('quotation-public', 'qr/x.png', auth.uid())$$, 'row-level security', 'the EC cannot upload the school QR');

-- A viewer sees links, cannot set even their own (needs edit).
select pg_temp.as_user(3);
select pg_temp.ok((select count(*) = 1 from public.quotation_staff_links), 'a Quotations viewer sees the links');
select pg_temp.fails($$select public.set_quotation_staff_link(9503, 'https://x.example', null)$$, 'only admin', 'view tick alone cannot set links');

-- Nobody else sees them.
select pg_temp.as_user(4);
select pg_temp.ok((select count(*) = 0 from public.quotation_staff_links), 'no tick: no links');

-- The admin sets anyone's, and the school QR.
select pg_temp.as_user(1);
select public.set_quotation_staff_link(9503, 'https://eduhero.example/thanks', 'https://wa.me/60111222333');
select pg_temp.ok((select contact_url = 'https://wa.me/60111222333' from public.quotation_staff_links where teacher_id = 9503), 'admin sets someone''s links');
select public.set_quotation_staff_link(9502, null, null);
select pg_temp.ok((select after_pay_url is null from public.quotation_staff_links where teacher_id = 9502), 'clearing a link');
insert into storage.objects (bucket_id, name, owner) values ('quotation-public', 'qr/bank.png', auth.uid());

reset role;
-- Counted as the database owner: staff need no listing (parents open the picture by its public address).
select pg_temp.ok((select count(*) = 1 from storage.objects where bucket_id = 'quotation-public'), 'admin uploads the school QR');
rollback;
