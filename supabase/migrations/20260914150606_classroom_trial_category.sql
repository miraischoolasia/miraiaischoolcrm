alter table public.classrooms
  add column category text not null default 'regular'
  constraint classrooms_category_check check (category in ('regular', 'trial'));
