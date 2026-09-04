-- Per-lead follow-up tasks/reminders (inspired by Twenty CRM's task model,
-- reimplemented from scratch): a lead can have multiple independent tasks,
-- each with its own due date and completion state. Distinct from the
-- existing follow_ups log (a record of touches that already happened) --
-- tasks are forward-looking reminders. Same lightweight jsonb-array
-- approach already used for children/follow_ups on this table.

alter table public.leads
add column if not exists tasks jsonb not null default '[]'::jsonb;
