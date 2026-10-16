-- A programme can belong to a category the school names itself ("Form 1", "Products", "Camps"). The Inbox panel lists
-- programmes grouped by category and searchable, so a school with fifteen or more courses can find one quickly.

alter table public.programmes
  add column if not exists category text
  check (category is null or char_length(btrim(category)) between 1 and 40);

grant insert (category) on public.programmes to authenticated;
grant update (category) on public.programmes to authenticated;
