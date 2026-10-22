-- A quick reply may have up to ten rows (was five, 20261013010000_quick_reply_steps). Only the limit changes;
-- every quick reply that exists already has five or fewer and stays as it is.

alter table public.quick_replies
  drop constraint if exists quick_replies_steps_check;
alter table public.quick_replies
  add constraint quick_replies_steps_check
  check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 10);
