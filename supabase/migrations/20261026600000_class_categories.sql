-- Class categories each school keeps itself (white-label), like class levels
-- (20261021190000_program_levels.sql).
--
-- class_categories: the tabs of My Classroom (Regular Class, Trial Class, Camp
--   Class, ...). The school adds, renames, orders and hides them; each one
--   "works like" one of the three kinds the CRM knows (kind):
--     regular - weekly classes with a roster, 4 a month;
--     trial   - trial slots offered every week;
--     camp    - holiday camp classes.
--   Seeded with the three the CRM always had.
-- classrooms.category_name: the category an admin gives the class. A trigger
--   keeps classrooms.category (the kind every other part of the CRM reads) in
--   step with it, and picks the kind's first category when only the kind is
--   written (older screens, the Inbox enrolment flows). Hidden instead of deleted.

create table public.class_categories (
  name text primary key check (char_length(btrim(name)) between 1 and 40 and name = btrim(name)),
  kind text not null check (kind in ('regular', 'trial', 'camp')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger set_class_categories_updated_at
  before update on public.class_categories
  for each row execute function public.set_current_timestamp_updated_at();

insert into public.class_categories (name, kind, sort_order) values
  ('Regular Class', 'regular', 10),
  ('Trial Class', 'trial', 20),
  ('Camp Class', 'camp', 30);

-- The category a class of this kind gets when nobody names one: the first shown, else the first.
create or replace function public.default_class_category(p_kind text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select name from public.class_categories
  where kind = p_kind
  order by is_active desc, sort_order, name
  limit 1;
$$;

revoke all on function public.default_class_category(text) from public, anon, authenticated;

alter table public.classrooms
  add column if not exists category_name text
    references public.class_categories (name) on update cascade;

update public.classrooms
set category_name = public.default_class_category(category)
where category_name is null;

create or replace function public.sync_classroom_category()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
begin
  if new.category_name is not null
     and (tg_op = 'INSERT' or new.category_name is distinct from old.category_name) then
    select kind into v_kind from public.class_categories where name = new.category_name;
    new.category := v_kind;
  elsif new.category_name is null
     or (tg_op = 'UPDATE' and new.category is distinct from old.category
         and (select kind from public.class_categories where name = new.category_name) is distinct from new.category) then
    -- Only the kind was written: the kind's first category.
    new.category_name := public.default_class_category(new.category);
  end if;
  return new;
end;
$$;

revoke all on function public.sync_classroom_category() from public, anon, authenticated;

create trigger classrooms_sync_category
  before insert or update of category, category_name on public.classrooms
  for each row execute function public.sync_classroom_category();

-- A category that starts working like another kind takes its classes with it.
create or replace function public.class_category_kind_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.classrooms set category = new.kind where category_name = new.name and category <> new.kind;
  return null;
end;
$$;

revoke all on function public.class_category_kind_changed() from public, anon, authenticated;

create trigger class_categories_kind_changed
  after update of kind on public.class_categories
  for each row when (new.kind is distinct from old.kind)
  execute function public.class_category_kind_changed();

alter table public.class_categories enable row level security;
revoke all on public.class_categories from public, anon, authenticated;
grant select on public.class_categories to authenticated;
grant all on public.class_categories to service_role;

create policy class_categories_select_staff
  on public.class_categories for select to authenticated
  using ((select public.current_teacher_id()) is not null);

-- Add (p_name null) or change one (p_name = its current name). Admin only.
create or replace function public.save_class_category(
  p_name text,
  p_new_name text,
  p_kind text,
  p_sort_order integer,
  p_is_active boolean
)
returns public.class_categories
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.class_categories%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admin can change class categories.';
  end if;
  if p_kind is not null and p_kind not in ('regular', 'trial', 'camp') then
    raise exception 'A class category works like a regular, trial or camp class.';
  end if;

  if p_name is null then
    insert into public.class_categories (name, kind, sort_order, is_active)
    values (
      btrim(p_new_name),
      coalesce(p_kind, 'regular'),
      coalesce(p_sort_order, (select coalesce(max(sort_order), 0) + 10 from public.class_categories)),
      coalesce(p_is_active, true)
    )
    returning * into v_row;
  else
    update public.class_categories
    set name = coalesce(nullif(btrim(p_new_name), ''), name),
        kind = coalesce(p_kind, kind),
        sort_order = coalesce(p_sort_order, sort_order),
        is_active = coalesce(p_is_active, is_active)
    where name = p_name
    returning * into v_row;
    if v_row.name is null then
      raise exception 'Class category not found.';
    end if;
  end if;
  return v_row;
exception
  when unique_violation then
    raise exception '"%" is already a class category.', btrim(p_new_name);
end;
$$;

revoke all on function public.save_class_category(text, text, text, integer, boolean) from public, anon;
grant execute on function public.save_class_category(text, text, text, integer, boolean) to authenticated;
