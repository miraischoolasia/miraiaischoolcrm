-- The table-level check constraint on admin_activity_logs.entity_type was
-- missed when record_admin_activity() was updated to accept 'lead' in the
-- prior migration - the function-level guard alone isn't enough since the
-- column itself still rejected the new value.
alter table public.admin_activity_logs
  drop constraint admin_activity_logs_entity_type_check;

alter table public.admin_activity_logs
  add constraint admin_activity_logs_entity_type_check
  check (entity_type = any (array['student', 'teacher', 'classroom', 'schedule', 'lead']));
