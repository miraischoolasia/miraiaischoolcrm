-- Products, part 1 (boss 2026-10-23; plan: side notes products-plan.md): the physical books a school sells (EduHero's
-- 宝典 / notes), their stock, pictures and the school's product settings. Selling them on a quotation (with their own
-- postage) and shipping come in part 2; the settings for both are kept here already.
--
-- 1. app_settings 'products': switched off until a school turns it on; its categories (宝典 / 笔记 / 其他, editable),
--    postage per order (west / east Malaysia, free from an amount, none when the parcel goes with tuition that already
--    has postage — boss), the shipping states' names. Admin changes it.
-- 2. products: name, category, level / subject (free text), price, picture, whether stock is kept, the low-stock line,
--    shown or hidden (hidden, never deleted: white-label rule), order.
-- 3. product_stock_moves: every stock change (bought in, sold, adjusted with a reason, returned). Stock = their sum;
--    a move is never changed or deleted, a mistake is put right with an adjustment.
-- 4. The 'products' tick: view (see the list and stock), edit (add / change products, stock moves). People with the
--    Quotations tick see the list too (part 2 sells from it).
-- 5. Bucket 'product-images': public pictures (2 MB, png / jpeg / webp); written by whoever may edit products.

-- ---------------------------------------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.products_defaults()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select '{
    "enabled": false,
    "categories": ["宝典", "笔记", "其他"],
    "postage": {"west": 10, "east": 20, "freeOver": null, "freeWithTuition": true},
    "shipStates": {"pending": "待寄", "shipped": "已寄", "received": "已收到"}
  }'::jsonb;
$$;

create or replace function public.products_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.products_defaults() || coalesce((select value from public.app_settings where key = 'products'), '{}'::jsonb);
$$;

revoke all on function public.products_defaults() from public, anon;
revoke all on function public.products_settings() from public, anon;
grant execute on function public.products_defaults() to authenticated;
grant execute on function public.products_settings() to authenticated;

create or replace function public.set_products_settings(p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := coalesce((select value from public.app_settings where key = 'products'), '{}'::jsonb);
  v jsonb;
  k text;
  c jsonb;
  v_names text[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change the product settings.' using errcode = '42501';
  end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception 'The settings are not valid.';
  end if;
  for k in select jsonb_object_keys(p_value) loop
    if k not in (select jsonb_object_keys(public.products_defaults())) then
      raise exception 'Unknown setting %.', k;
    end if;
  end loop;
  v := public.products_defaults() || v_old || p_value;

  if jsonb_typeof(v -> 'enabled') <> 'boolean' then
    raise exception 'On or off, please.';
  end if;
  if jsonb_typeof(v -> 'categories') <> 'array' or jsonb_array_length(v -> 'categories') not between 1 and 20 then
    raise exception 'Give between 1 and 20 categories.';
  end if;
  for c in select * from jsonb_array_elements(v -> 'categories') loop
    if jsonb_typeof(c) <> 'string' or char_length(btrim(c #>> '{}')) not between 1 and 40 then
      raise exception 'Each category needs a name of up to 40 characters.';
    end if;
    if btrim(c #>> '{}') = any (v_names) then
      raise exception 'Category % is there twice.', c #>> '{}';
    end if;
    v_names := v_names || btrim(c #>> '{}');
  end loop;
  if jsonb_typeof(v -> 'postage') <> 'object'
     or jsonb_typeof(v -> 'postage' -> 'west') <> 'number' or (v -> 'postage' ->> 'west')::numeric not between 0 and 10000
     or jsonb_typeof(v -> 'postage' -> 'east') <> 'number' or (v -> 'postage' ->> 'east')::numeric not between 0 and 10000
     or (jsonb_typeof(v -> 'postage' -> 'freeOver') <> 'null'
         and (jsonb_typeof(v -> 'postage' -> 'freeOver') <> 'number' or (v -> 'postage' ->> 'freeOver')::numeric not between 0 and 100000))
     or jsonb_typeof(v -> 'postage' -> 'freeWithTuition') <> 'boolean' then
    raise exception 'Postage: west and east as amounts from 0, free from an amount (or none), and whether books with tuition ship free.';
  end if;
  if jsonb_typeof(v -> 'shipStates') <> 'object'
     or exists (select 1 from jsonb_each(v -> 'shipStates') e
                where e.key not in ('pending', 'shipped', 'received')
                   or jsonb_typeof(e.value) <> 'string' or char_length(btrim(e.value #>> '{}')) not between 1 and 30)
     or (select count(*) from jsonb_object_keys(v -> 'shipStates')) <> 3 then
    raise exception 'Give the three shipping states a name of up to 30 characters.';
  end if;

  insert into public.app_settings (key, value, updated_by)
  values ('products', v_old || p_value, public.current_teacher_id())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by,
    updated_at = timezone('utc', now());
  return public.products_settings();
end;
$$;

revoke all on function public.set_products_settings(jsonb) from public, anon;
grant execute on function public.set_products_settings(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2 + 3. Products and their stock
-- ---------------------------------------------------------------------------------------------------------

create table public.products (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 120 and name = btrim(name)),
  category text not null check (char_length(btrim(category)) between 1 and 40),
  level_label text check (level_label is null or char_length(level_label) <= 60),
  price numeric(10, 2) not null check (price >= 0 and price <= 100000),
  image_path text check (image_path is null or image_path ~ '^p/[A-Za-z0-9._-]{1,100}\.(png|jpe?g|webp)$'),
  track_stock boolean not null default true,
  low_stock_at integer not null default 5 check (low_stock_at between 0 and 100000),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by bigint references public.teachers (id) on delete set null
);

create trigger set_products_updated_at
  before update on public.products
  for each row execute function public.set_current_timestamp_updated_at();

create table public.product_stock_moves (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products (id) on delete cascade,
  qty integer not null check (qty <> 0 and qty between -100000 and 100000),
  kind text not null check (kind in ('purchase', 'sale', 'adjust', 'return')),
  -- part 2: the quotation a sale or return belongs to
  quotation_id uuid references public.quotations (id) on delete set null,
  note text check (note is null or char_length(note) <= 300),
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  check (kind <> 'adjust' or char_length(btrim(coalesce(note, ''))) > 0),
  check ((kind in ('purchase', 'return') and qty > 0) or (kind = 'sale' and qty < 0) or kind = 'adjust')
);

create index product_stock_moves_product_idx on public.product_stock_moves (product_id, created_at desc);

alter table public.products enable row level security;
alter table public.product_stock_moves enable row level security;
revoke all on public.products, public.product_stock_moves from public, anon, authenticated;
grant select on public.products, public.product_stock_moves to authenticated;
grant all on public.products, public.product_stock_moves to service_role;

create policy products_select on public.products for select to authenticated
  using (public.has_permission('products', 'view') or public.has_permission('quotations', 'view'));
create policy product_stock_moves_select on public.product_stock_moves for select to authenticated
  using (public.has_permission('products', 'view'));

-- Each product with its stock (the sum of its moves).
create or replace view public.product_stock
with (security_invoker = true)
as
select p.id as product_id, coalesce(sum(m.qty), 0)::integer as stock
from public.products p
left join public.product_stock_moves m on m.product_id = p.id
group by p.id;

grant select on public.product_stock to authenticated;

-- Adds or changes a product (p_id null = new). Whoever may edit products.
create or replace function public.save_product(
  p_id bigint,
  p_name text,
  p_category text,
  p_level_label text,
  p_price numeric,
  p_image_path text,
  p_track_stock boolean,
  p_low_stock_at integer,
  p_is_active boolean,
  p_sort_order integer
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.has_permission('products', 'edit') then
    raise exception 'Only someone who may edit products can do this.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from jsonb_array_elements_text(public.products_settings() -> 'categories') c where c = btrim(coalesce(p_category, ''))
  ) then
    raise exception 'Pick one of the product categories.';
  end if;
  if p_id is null then
    insert into public.products (name, category, level_label, price, image_path, track_stock, low_stock_at, is_active, sort_order, updated_by)
    values (btrim(p_name), btrim(p_category), nullif(btrim(coalesce(p_level_label, '')), ''), p_price, p_image_path,
            coalesce(p_track_stock, true), coalesce(p_low_stock_at, 5), coalesce(p_is_active, true),
            coalesce(p_sort_order, (select coalesce(max(sort_order), 0) + 10 from public.products)), public.current_teacher_id())
    returning id into v_id;
  else
    update public.products
    set name = btrim(p_name), category = btrim(p_category), level_label = nullif(btrim(coalesce(p_level_label, '')), ''),
        price = p_price, image_path = p_image_path, track_stock = coalesce(p_track_stock, track_stock),
        low_stock_at = coalesce(p_low_stock_at, low_stock_at), is_active = coalesce(p_is_active, is_active),
        sort_order = coalesce(p_sort_order, sort_order), updated_by = public.current_teacher_id()
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'That product is not there.';
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_product(bigint, text, text, text, numeric, text, boolean, integer, boolean, integer) from public, anon;
grant execute on function public.save_product(bigint, text, text, text, numeric, text, boolean, integer, boolean, integer) to authenticated;

-- A stock move by a person: bought in (+), returned (+), or an adjustment (+/-, with a reason). Sales are written by
-- part 2 when a quotation is paid, never by hand.
create or replace function public.add_stock_move(p_product_id bigint, p_kind text, p_qty integer, p_note text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('products', 'edit') then
    raise exception 'Only someone who may edit products can do this.' using errcode = '42501';
  end if;
  if p_kind not in ('purchase', 'adjust', 'return') then
    raise exception 'Pick bought in, returned or an adjustment (sales come from paid quotations).';
  end if;
  if p_qty is null or p_qty = 0 or (p_kind in ('purchase', 'return') and p_qty < 0) then
    raise exception 'Give how many (bought in and returned are more than 0).';
  end if;
  if p_kind = 'adjust' and char_length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'Say why the stock is adjusted.';
  end if;
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'That product is not there.';
  end if;
  insert into public.product_stock_moves (product_id, qty, kind, note, created_by)
  values (p_product_id, p_qty, p_kind, nullif(btrim(coalesce(p_note, '')), ''), public.current_teacher_id());
  return (select stock from public.product_stock where product_id = p_product_id);
end;
$$;

revoke all on function public.add_stock_move(bigint, text, integer, text) from public, anon;
grant execute on function public.add_stock_move(bigint, text, integer, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 4. The tick (view / edit; no "whose" scope). Patched into the latest valid_account_permissions.
-- ---------------------------------------------------------------------------------------------------------

create or replace function pg_temp.products_patch(p_fn regprocedure, p_label text, p_from text, p_to text)
returns void
language plpgsql
as $$
declare
  v_def text := replace(pg_get_functiondef(p_fn), chr(13), '');
begin
  if position(p_to in v_def) > 0 then
    raise notice '%: already there', p_label;
    return;
  end if;
  if position(p_from in v_def) = 0 then
    raise exception '%: the text to change was not found', p_label;
  end if;
  execute replace(v_def, p_from, p_to);
end;
$$;

select pg_temp.products_patch(
  'public.valid_account_permissions(jsonb)'::regprocedure,
  'valid_account_permissions: products',
  $x$'progress_cards', 'quotations'$x$,
  $x$'progress_cards', 'quotations', 'products'$x$
);

-- ---------------------------------------------------------------------------------------------------------
-- 5. Pictures
-- ---------------------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "product_images_insert_editors"
on storage.objects
for insert to authenticated
with check (bucket_id = 'product-images' and (select public.has_permission('products', 'edit')));

create policy "product_images_update_editors"
on storage.objects
for update to authenticated
using (bucket_id = 'product-images' and (select public.has_permission('products', 'edit')))
with check (bucket_id = 'product-images' and (select public.has_permission('products', 'edit')));

create policy "product_images_delete_editors"
on storage.objects
for delete to authenticated
using (bucket_id = 'product-images' and (select public.has_permission('products', 'edit')));
