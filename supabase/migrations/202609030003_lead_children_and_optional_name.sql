-- Leads: drop email (unused), make full_name optional (the parent's name
-- isn't always known at first inquiry), and replace the single
-- "interested age group" band with a list of children (name + exact age,
-- capped at 3 in the app layer) since one parent may inquire for multiple
-- kids at once.

alter table public.leads
  drop constraint leads_interested_age_group_check;

alter table public.leads
  drop column email,
  drop column interested_age_group,
  alter column full_name drop not null,
  add column children jsonb not null default '[]'::jsonb;
