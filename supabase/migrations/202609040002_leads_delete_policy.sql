-- Leads had select/insert/update policies but no delete policy, so admins
-- had no way to remove a mistaken or duplicate lead from the database.
create policy "leads_delete_admin"
on public.leads
for delete
to authenticated
using (public.is_admin());
