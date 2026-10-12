-- A database login for n8n (the automation tool) that can do only what automations need.
--
-- n8n must not hold the all-powerful service key. This role can:
--   * read the queue and the settings (the pause switch, daily cap and gap),
--   * add a message to the queue (always as 'pending'),
--   * mark a pending message 'expired' when it is no longer relevant,
--   * delete finished messages older than 90 days,
--   * read who a family is (people: name, phone, links to the lead / student / parent).
-- It cannot read leads, students, attendance, accounts or anything else. When a rule needs more
-- (for example the date of a trial class), that is added then, one grant at a time.
--
-- There is deliberately NO password in this file. Set it yourself once, in the Supabase SQL
-- editor, and paste the same password into the n8n credential:
--   alter role n8n_automation with password 'a long password only you know';
-- Until a password is set nobody can log in as this role.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'n8n_automation') then
    create role n8n_automation login nosuperuser nocreatedb nocreaterole noinherit nobypassrls
      connection limit 5;
  end if;
end
$$;

alter role n8n_automation set statement_timeout = '30s';
alter role n8n_automation set idle_in_transaction_session_timeout = '30s';

grant usage on schema public to n8n_automation;

grant select, insert on public.automation_queue to n8n_automation;
grant update (status, error) on public.automation_queue to n8n_automation;
grant delete on public.automation_queue to n8n_automation;
grant select on public.automation_settings to n8n_automation;
grant select (id, kind, full_name, phone, lead_id, student_id, parent_id)
on public.people to n8n_automation;

create policy "automation_queue_n8n_select"
on public.automation_queue
for select to n8n_automation
using (true);

create policy "automation_queue_n8n_insert"
on public.automation_queue
for insert to n8n_automation
with check (status = 'pending');

create policy "automation_queue_n8n_expire"
on public.automation_queue
for update to n8n_automation
using (status = 'pending')
with check (status = 'expired');

create policy "automation_queue_n8n_tidy"
on public.automation_queue
for delete to n8n_automation
using (status in ('sent', 'skipped', 'expired', 'failed') and created_at < now() - interval '90 days');

create policy "automation_settings_n8n_select"
on public.automation_settings
for select to n8n_automation
using (true);

create policy "people_n8n_select"
on public.people
for select to n8n_automation
using (true);
