-- The date a lead was added should be something the admin sets when they
-- log the inquiry (e.g. backfilling a walk-in from yesterday), not just
-- the literal insert timestamp. Leads are ordered by this date.
alter table public.leads
  add column added_date date not null default current_date;
