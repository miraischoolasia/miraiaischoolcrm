-- Lets the CRM page hear about a change the moment it happens (Supabase Realtime), so staff do not have
-- to refresh to see what someone else just did. Only tells the page that a row changed; what the person
-- may read is still decided by the same row-level security as every other read.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array[
    'students', 'classrooms', 'teachers', 'leads', 'lead_options', 'packages', 'schedules',
    'schedule_students', 'schedule_exceptions', 'trial_bookings', 'makeup_plans', 'lesson_logs',
    'lesson_log_student_reviews'
  ] loop
    if to_regclass('public.' || quote_ident(t)) is not null
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
       ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
