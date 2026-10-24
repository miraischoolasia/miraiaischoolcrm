-- Checks for 20261101500000_products.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/products.sql

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

insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000009' || lpad(n::text, 2, '0'))::uuid, 'prod' || n || '@mirai.internal',
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 4) n;

-- 1 admin, 2 stock keeper (products edit), 3 EC (quotations view only), 4 nothing.
insert into public.teachers (id, full_name, username, role, is_active, auth_user_id, permissions)
overriding system value
values
  (9901, 'Prod Admin', 'prod_admin', 'admin', true, '00000000-0000-0000-0000-000000000901', '{}'),
  (9902, 'Prod Keeper', 'prod_keeper', 'staff', true, '00000000-0000-0000-0000-000000000902', '{"products": {"level": "edit"}}'),
  (9903, 'Prod EC', 'prod_ec', 'staff', true, '00000000-0000-0000-0000-000000000903', '{"quotations": {"level": "view"}}'),
  (9904, 'Prod None', 'prod_none', 'staff', true, '00000000-0000-0000-0000-000000000904', '{}');

create function pg_temp.as_user(p_n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000009' || lpad(p_n::text, 2, '0'), true);
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000009' || lpad(p_n::text, 2, '0'), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function pg_temp.as_user(int) to authenticated;
grant execute on function pg_temp.ok(boolean, text) to authenticated;
grant execute on function pg_temp.fails(text, text, text) to authenticated;

-- ---- The tick ----
select pg_temp.ok(public.valid_account_permissions('{"products": {"level": "edit", "delete": true}}'), 'products view / edit / delete is a valid tick');
select pg_temp.ok(not public.valid_account_permissions('{"products": {"level": "view", "scope": "own"}}'), 'products has no "whose" scope');
select pg_temp.ok(public.valid_account_permissions('{"quotations": {"level": "edit"}, "data_center": {"level": "view"}}'), 'the other ticks still valid');
select pg_temp.ok((select public and file_size_limit = 2097152 from storage.buckets where id = 'product-images'), 'picture bucket: public, 2 MB');

set local role authenticated;

-- ---- Settings ----
select pg_temp.as_user(2);
select pg_temp.ok((select public.products_settings() ->> 'enabled' = 'false'
    and public.products_settings() -> 'categories' = '["宝典", "笔记", "其他"]'::jsonb
    and (public.products_settings() -> 'postage' ->> 'west')::numeric = 10
    and public.products_settings() -> 'postage' ->> 'freeWithTuition' = 'true'), 'off by default; 宝典 / 笔记 / 其他; postage west 10, free with tuition');
select pg_temp.fails($$select public.set_products_settings('{"enabled": true}')$$, 'only an admin', 'only an admin changes the settings');

select pg_temp.as_user(1);
select public.set_products_settings('{"enabled": true, "postage": {"west": 8, "east": 18, "freeOver": 200, "freeWithTuition": true}}');
select pg_temp.ok((select public.products_settings() ->> 'enabled' = 'true' and (public.products_settings() -> 'postage' ->> 'freeOver')::numeric = 200),
  'admin switches it on and sets postage');
select pg_temp.fails($$select public.set_products_settings('{"categories": []}')$$, 'between 1 and 20', 'at least one category');
select pg_temp.fails($$select public.set_products_settings('{"categories": ["A", "A"]}')$$, 'twice', 'no category twice');
select pg_temp.fails($$select public.set_products_settings('{"postage": {"west": -1, "east": 5, "freeOver": null, "freeWithTuition": false}}')$$, 'postage', 'no negative postage');
select pg_temp.fails($$select public.set_products_settings('{"shipStates": {"pending": "Wait"}}')$$, 'three shipping states', 'all three shipping states named');
select pg_temp.fails($$select public.set_products_settings('{"colour": "red"}')$$, 'unknown setting', 'no unknown settings');

-- ---- Products ----
select pg_temp.as_user(2);
create temporary table p as select public.save_product(null, 'P4 Math 宝典', '宝典', 'P4 · Math', 45, 'p/abc.png', true, 3, true, null) as id;
grant select on p to authenticated;
select pg_temp.ok((select name = 'P4 Math 宝典' and price = 45 and image_path = 'p/abc.png' and low_stock_at = 3 from public.products where id = (select id from p)),
  'the stock keeper adds a product');
select pg_temp.fails($$select public.save_product(null, 'X', 'Toys', null, 1, null, true, 1, true, null)$$, 'one of the product categories', 'only the school''s categories');
select pg_temp.fails($$select public.save_product(null, 'X', '宝典', null, -1, null, true, 1, true, null)$$, 'check constraint', 'no negative price');
select pg_temp.fails($$select public.save_product(null, 'X', '宝典', null, 1, '../evil.png', true, 1, true, null)$$, 'check constraint', 'pictures only in the products folder');
select public.save_product((select id from p), 'P4 Math 宝典', '宝典', 'P4 · Math', 48, 'p/abc.png', true, 3, false, null);
select pg_temp.ok((select price = 48 and not is_active from public.products where id = (select id from p)), 'changed and hidden (never deleted)');
select pg_temp.fails($$delete from public.products$$, 'permission denied', 'nobody deletes products');

-- ---- Stock ----
select pg_temp.ok((select public.add_stock_move((select id from p), 'purchase', 20, 'From the printer') = 20), 'bought in 20: stock 20');
select pg_temp.ok((select public.add_stock_move((select id from p), 'adjust', -2, 'Two damaged') = 18), 'adjusted -2 with a reason: 18');
select pg_temp.ok((select public.add_stock_move((select id from p), 'return', 1, null) = 19), 'one returned: 19');
select pg_temp.fails($$select public.add_stock_move((select id from p), 'adjust', -1, '')$$, 'say why', 'an adjustment needs a reason');
select pg_temp.fails($$select public.add_stock_move((select id from p), 'sale', -1, null)$$, 'sales come from paid quotations', 'no sales by hand');
select pg_temp.fails($$select public.add_stock_move((select id from p), 'purchase', -5, null)$$, 'more than 0', 'bought in is more than 0');
select pg_temp.fails($$update public.product_stock_moves set qty = 100$$, 'permission denied', 'a move is never changed');
select pg_temp.ok((select stock = 19 from public.product_stock where product_id = (select id from p)), 'the stock view adds the moves up');

-- ---- Who sees what ----
select pg_temp.as_user(3);
select pg_temp.ok((select count(*) = 1 from public.products where id = (select id from p)), 'an EC with Quotations sees the product list (to sell later)');
select pg_temp.ok((select count(*) = 0 from public.product_stock_moves), 'but not the stock moves');
select pg_temp.fails($$select public.save_product(null, 'X', '宝典', null, 1, null, true, 1, true, null)$$, 'only someone who may edit products', 'an EC cannot add products');
select pg_temp.fails($$insert into storage.objects (bucket_id, name, owner) values ('product-images', 'p/x.png', auth.uid())$$, 'row-level security', 'an EC cannot upload pictures');

select pg_temp.as_user(4);
select pg_temp.ok((select count(*) = 0 from public.products), 'no tick: no products');
select pg_temp.fails($$select public.add_stock_move((select id from p), 'purchase', 1, null)$$, 'only someone who may edit products', 'no tick: no stock moves');

select pg_temp.as_user(2);
insert into storage.objects (bucket_id, name, owner) values ('product-images', 'p/new.png', auth.uid());
reset role;
select pg_temp.ok((select count(*) = 1 from storage.objects where bucket_id = 'product-images' and name = 'p/new.png'), 'the stock keeper uploads a picture');

rollback;
