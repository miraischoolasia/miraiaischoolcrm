-- Follow-ups from the Inbox: a task on the calendar that is tied to a lead (calendar_items.lead_id) with a day and
-- a time, which reminds someone to write to the parent again.
--
-- Until now only someone who may edit the calendar could add an item, and a person saw only the items given to
-- them. A person who works the leads (but has no calendar permission) must be able to set a follow-up from the
-- chat they are in, and to see, tick off and remove the ones they made. Only tasks tied to a lead are opened up
-- this way; every other item stays as it was.

drop policy if exists calendar_items_read on public.calendar_items;
create policy calendar_items_read on public.calendar_items
  for select to authenticated
  using (
    public.has_permission('calendar', 'edit')
    or assignee_id = public.current_teacher_id()
    or created_by = public.current_teacher_id()
    or (kind = 'event' and public.has_permission('calendar', 'view'))
  );

drop policy if exists calendar_items_insert on public.calendar_items;
create policy calendar_items_insert on public.calendar_items
  for insert to authenticated
  with check (
    public.has_permission('calendar', 'edit')
    or (kind = 'task' and lead_id is not null and public.has_permission('leads', 'edit'))
  );

drop policy if exists calendar_items_update on public.calendar_items;
create policy calendar_items_update on public.calendar_items
  for update to authenticated
  using (
    public.has_permission('calendar', 'edit')
    or assignee_id = public.current_teacher_id()
    or (kind = 'task' and lead_id is not null and created_by = public.current_teacher_id())
  )
  with check (
    public.has_permission('calendar', 'edit')
    or assignee_id = public.current_teacher_id()
    or (kind = 'task' and lead_id is not null and created_by = public.current_teacher_id())
  );

drop policy if exists calendar_items_delete on public.calendar_items;
create policy calendar_items_delete on public.calendar_items
  for delete to authenticated
  using (
    public.has_permission('calendar', 'edit')
    or (kind = 'task' and lead_id is not null and created_by = public.current_teacher_id())
  );

-- A follow-up is looked up by its lead.
create index if not exists calendar_items_lead_idx on public.calendar_items (lead_id) where lead_id is not null;
