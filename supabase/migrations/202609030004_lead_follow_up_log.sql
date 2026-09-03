-- Replace the single follow_up_date field with a small history log: each
-- admin follow-up touch (date + note) is appended, capped at 7 in the app
-- layer, so the listing can show progress like "Follow-up 3/7" and the
-- lead detail can show what was said at each touch.
alter table public.leads
  drop column follow_up_date,
  add column follow_ups jsonb not null default '[]'::jsonb;
