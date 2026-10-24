-- Automatic follow-ups (the EC system's follow-up plan, moved into the CRM; plan: auto-followup-plan.md).
-- A follow-up is the same thing the Inbox Follow up button makes: a calendar task tied to a lead (calendar_items with
-- lead_id). The automatic ones carry their round and step, so there is one list, one calendar, one bell, not two.
--   * a new lead gets its follow-ups by itself, on the days the school set (default the 1st, 2nd, 4th, 10th and 30th
--     day after it came in), for the person who handles it (its PIC's staff account);
--   * when the lead becomes Converted or Lost, or is removed (or joined into another), what is left is cancelled;
--   * when the lead's PIC changes, what is left goes to the new person;
--   * moving one follow-up's day moves the later ones of the same round as much;
--   * a due follow-up rings once in the bell of its person and of every admin (every 5 minutes);
--   * the completion rate of each person, per month, for the Data Center.
--   * a later round ("the parent asked again"): a parent message after 14 days or more of silence (the school sets
--     the days) opens the next round's first follow-up; not for a Converted lead (owner, 2026-10-23).
-- Leads that were there before this file get nothing; only new leads are scheduled (owner, 2026-10-23).

-- ---------------------------------------------------------------------------------------------------------
-- 1. The follow-up columns on calendar items.
-- ---------------------------------------------------------------------------------------------------------
alter table public.calendar_items
  add column if not exists followup_round smallint,
  add column if not exists followup_step smallint,
  add column if not exists cancelled_at timestamptz,
  add column if not exists done_at timestamptz,
  add column if not exists notified_at timestamptz;

alter table public.calendar_items drop constraint if exists calendar_items_followup_step_pair;
alter table public.calendar_items
  add constraint calendar_items_followup_step_pair
  check ((followup_round is null) = (followup_step is null)
    and (followup_round is null or (kind = 'task' and followup_round >= 1 and followup_step >= 1)));

comment on column public.calendar_items.followup_round is 'An automatic follow-up: which round (1 = when the lead came in, 2 = the parent asked again, ...).';
comment on column public.calendar_items.followup_step is 'An automatic follow-up: which one of its round (1, 2, 3, ...).';
comment on column public.calendar_items.cancelled_at is 'The lead became Converted or Lost (or was removed) before this was done: no longer to do, still counted nowhere.';
comment on column public.calendar_items.done_at is 'When it was ticked done (for the on-time rate).';
comment on column public.calendar_items.notified_at is 'When the bell rang for it (once).';

create index if not exists calendar_items_open_followups_idx
  on public.calendar_items (lead_id, followup_round, followup_step)
  where followup_step is not null and not is_done and cancelled_at is null;
create index if not exists calendar_items_due_tasks_idx
  on public.calendar_items (item_date)
  where kind = 'task' and lead_id is not null and not is_done and cancelled_at is null and notified_at is null;

-- Ticking done (or undone) keeps the time it was done.
create or replace function public.calendar_items_done_at()
returns trigger
language plpgsql
as $$
begin
  if new.is_done and not coalesce(old.is_done, false) then
    new.done_at := coalesce(new.done_at, now());
  elsif not new.is_done then
    new.done_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists calendar_items_done_at on public.calendar_items;
create trigger calendar_items_done_at
before update of is_done on public.calendar_items
for each row execute function public.calendar_items_done_at();

-- ---------------------------------------------------------------------------------------------------------
-- 2. The school's own schedule (white label): app_settings 'followup_schedule'. Without the row: the defaults.
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.followup_schedule()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select '{"enabled": true, "days": [1, 2, 4, 10, 30], "time": "10:00", "round2_after_days": 14}'::jsonb
    || coalesce((select value from public.app_settings where key = 'followup_schedule' and jsonb_typeof(value) = 'object'), '{}'::jsonb);
$$;

revoke all on function public.followup_schedule() from public, anon;
grant execute on function public.followup_schedule() to authenticated;

-- An admin changes it (Class Settings). Days: 1 to 8 of them, each 0 to 365 and later than the one before.
create or replace function public.set_followup_schedule(p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days jsonb := p_value -> 'days';
  v_last int := -1;
  v_day jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change the follow-up schedule.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_value) <> 'object'
     or jsonb_typeof(p_value -> 'enabled') <> 'boolean'
     or jsonb_typeof(v_days) <> 'array'
     or jsonb_array_length(v_days) not between 1 and 8
     or coalesce(p_value ->> 'time', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or jsonb_typeof(p_value -> 'round2_after_days') <> 'number'
     or (p_value ->> 'round2_after_days')::numeric not between 1 and 365 then
    raise exception 'The follow-up schedule is not valid.' using errcode = '22023';
  end if;
  for v_day in select value from jsonb_array_elements(v_days) loop
    if jsonb_typeof(v_day) <> 'number' or (v_day::text)::numeric <> floor((v_day::text)::numeric)
       or (v_day::text)::int not between 0 and 365 or (v_day::text)::int <= v_last then
      raise exception 'Each follow-up day must be a whole number from 0 to 365, later than the one before.' using errcode = '22023';
    end if;
    v_last := (v_day::text)::int;
  end loop;

  insert into public.app_settings (key, value)
  values ('followup_schedule', jsonb_build_object(
    'enabled', (p_value ->> 'enabled')::boolean,
    'days', v_days,
    'time', p_value ->> 'time',
    'round2_after_days', (p_value ->> 'round2_after_days')::int))
  on conflict (key) do update set value = excluded.value;
  return public.followup_schedule();
end;
$$;

revoke all on function public.set_followup_schedule(jsonb) from public, anon;
grant execute on function public.set_followup_schedule(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Making a round of follow-ups.
-- ---------------------------------------------------------------------------------------------------------
-- The staff account a lead's PIC stands for (PIC names come from the staff list, 20261101300000).
create or replace function public.lead_pic_teacher(p_pic_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select o.teacher_id from public.lead_options o where o.id = p_pic_id and o.kind = 'pic';
$$;

revoke all on function public.lead_pic_teacher(bigint) from public, anon, authenticated;

-- One round for a lead, counted from p_from (a Malaysian day): every step of the schedule, or only the first.
-- Nothing for a Converted lead, for a Lost one's first round, for a lead that already has a follow-up to do, or when
-- the school turned it off. (A Lost parent who asks again gets the first follow-up of a later round.)
create or replace function public.followup_make_round(p_lead_id bigint, p_from date, p_only_first boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule jsonb := public.followup_schedule();
  v_lead public.leads%rowtype;
  v_round smallint;
  v_count int;
  v_name text;
  v_step int := 0;
  v_day jsonb;
begin
  if not coalesce((v_schedule ->> 'enabled')::boolean, true) then
    return 0;
  end if;
  select * into v_lead from public.leads where id = p_lead_id;
  if not found or v_lead.status = 'converted' or (v_lead.status = 'lost' and not p_only_first) then
    return 0;
  end if;
  if exists (
    select 1 from public.calendar_items
    where lead_id = p_lead_id and followup_step is not null and not is_done and cancelled_at is null
  ) then
    return 0;
  end if;

  select coalesce(max(followup_round), 0) + 1 into v_round from public.calendar_items where lead_id = p_lead_id;
  v_count := case when p_only_first then 1 else jsonb_array_length(v_schedule -> 'days') end;
  v_name := coalesce(
    nullif(btrim(v_lead.full_name), ''),
    nullif(btrim(v_lead.children -> 0 ->> 'name'), ''),
    nullif(btrim(v_lead.phone), ''),
    'Lead #' || v_lead.id
  );

  for v_day in select value from jsonb_array_elements(v_schedule -> 'days') loop
    v_step := v_step + 1;
    exit when v_step > v_count;
    insert into public.calendar_items (kind, title, item_date, start_time, assignee_id, lead_id, followup_round, followup_step)
    values (
      'task',
      left(format('Follow up %s/%s · %s', v_step, v_count, v_name), 160),
      p_from + (v_day::text)::int,
      (v_schedule ->> 'time')::time,
      public.lead_pic_teacher(v_lead.pic_id),
      p_lead_id,
      v_round,
      v_step
    );
  end loop;
  return least(v_step, v_count);
end;
$$;

revoke all on function public.followup_make_round(bigint, date, boolean) from public, anon, authenticated;

-- A later round, by hand ("the parent asked again"): only its first follow-up, from today. Someone who may edit leads.
create or replace function public.start_followup_round(p_lead_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select public.has_permission('leads', 'edit')) then
    raise exception 'Only someone who may edit leads can start a follow-up round.' using errcode = '42501';
  end if;
  return public.followup_make_round(p_lead_id, (now() at time zone 'Asia/Kuala_Lumpur')::date, true);
end;
$$;

revoke all on function public.start_followup_round(bigint) from public, anon;
grant execute on function public.start_followup_round(bigint) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 4. Keeping the follow-ups in step with the lead. These run AFTER the leads' BEFORE triggers (③'s per-child stage
-- roll-up, 20261102000000, sets leads.status), so they see the final status. UPDATE is not limited to a column on
-- purpose: a status set by a BEFORE trigger does not fire an "UPDATE OF status" trigger.
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.leads_followups_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A bulk import of old leads says so (set_config('app.skip_auto_followups', 'on', true)) and gets none.
  if coalesce(current_setting('app.skip_auto_followups', true), '') = 'on' then
    return null;
  end if;
  perform public.followup_make_round(new.id, (coalesce(new.created_at, now()) at time zone 'Asia/Kuala_Lumpur')::date, false);
  return null;
end;
$$;

create or replace function public.leads_followups_on_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('converted', 'lost') and old.status is distinct from new.status then
    update public.calendar_items
    set cancelled_at = now()
    where lead_id = new.id and followup_step is not null and not is_done and cancelled_at is null;
  end if;
  if new.pic_id is distinct from old.pic_id then
    update public.calendar_items
    set assignee_id = public.lead_pic_teacher(new.pic_id)
    where lead_id = new.id and followup_step is not null and not is_done and cancelled_at is null;
  end if;
  return null;
end;
$$;

create or replace function public.leads_followups_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.calendar_items
  set cancelled_at = now()
  where lead_id = old.id and followup_step is not null and not is_done and cancelled_at is null;
  return old;
end;
$$;

revoke all on function public.leads_followups_on_insert() from public, anon, authenticated;
revoke all on function public.leads_followups_on_update() from public, anon, authenticated;
revoke all on function public.leads_followups_on_delete() from public, anon, authenticated;

drop trigger if exists leads_followups_on_insert on public.leads;
create trigger leads_followups_on_insert
after insert on public.leads
for each row execute function public.leads_followups_on_insert();

drop trigger if exists leads_followups_on_update on public.leads;
create trigger leads_followups_on_update
after update on public.leads
for each row
when (old.status is distinct from new.status or old.pic_id is distinct from new.pic_id)
execute function public.leads_followups_on_update();

drop trigger if exists leads_followups_on_delete on public.leads;
create trigger leads_followups_on_delete
before delete on public.leads
for each row execute function public.leads_followups_on_delete();

-- Moving one follow-up to another day moves the later ones of its round (not done, not cancelled) as much.
create or replace function public.calendar_items_followup_shift()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  update public.calendar_items
  set item_date = item_date + (new.item_date - old.item_date)
  where lead_id = new.lead_id
    and followup_round = new.followup_round
    and followup_step > new.followup_step
    and not is_done
    and cancelled_at is null;
  return null;
end;
$$;

revoke all on function public.calendar_items_followup_shift() from public, anon, authenticated;

drop trigger if exists calendar_items_followup_shift on public.calendar_items;
create trigger calendar_items_followup_shift
after update of item_date on public.calendar_items
for each row
when (new.followup_step is not null and new.lead_id is not null and new.item_date is distinct from old.item_date)
execute function public.calendar_items_followup_shift();

-- The parent asked again: a parent's message after round2_after_days days or more without one, in a chat tied to a
-- lead, opens that lead's next round (its first follow-up). An old message copied in later is history, not asking.
create index if not exists lead_channels_conversation_idx on public.lead_channels (conversation_id) where conversation_id is not null;

create or replace function public.inbox_messages_followup_round()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead bigint;
  v_before timestamptz;
  v_gap int := greatest(coalesce((public.followup_schedule() ->> 'round2_after_days')::int, 14), 1);
begin
  if new.sender_kind <> 'parent' or new.message_type <> 0 or new.private or new.created_at < now() - interval '1 day' then
    return null;
  end if;
  select lc.lead_id into v_lead
  from public.lead_channels lc
  where lc.conversation_id = new.conversation_id and lc.lead_id is not null
  order by lc.id
  limit 1;
  if v_lead is null then
    return null;
  end if;
  select max(m.created_at) into v_before
  from public.inbox_messages m
  where m.conversation_id = new.conversation_id and m.sender_kind = 'parent' and m.id <> new.id and m.created_at < new.created_at;
  -- The very first message is a new lead (its first round comes with the lead); a recent one is the same talk.
  if v_before is null or v_before > new.created_at - make_interval(days => v_gap) then
    return null;
  end if;
  perform public.followup_make_round(v_lead, (new.created_at at time zone 'Asia/Kuala_Lumpur')::date, true);
  return null;
end;
$$;

revoke all on function public.inbox_messages_followup_round() from public, anon, authenticated;

drop trigger if exists inbox_messages_followup_round on public.inbox_messages;
create trigger inbox_messages_followup_round
after insert on public.inbox_messages
for each row execute function public.inbox_messages_followup_round();

-- ---------------------------------------------------------------------------------------------------------
-- 5. The bell: a lead's follow-up that has come due rings once for its person and for every admin. Only what fell due
-- in the last day, so the first run does not ring for every old one.
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.notify_due_followups()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_rang int := 0;
begin
  for v_item in
    select c.id, c.title, c.lead_id, c.assignee_id
    from public.calendar_items c
    where c.kind = 'task'
      and c.lead_id is not null
      and not c.is_done
      and c.cancelled_at is null
      and c.notified_at is null
      and ((c.item_date + coalesce(c.start_time, time '09:00')) at time zone 'Asia/Kuala_Lumpur') <= now()
      and ((c.item_date + coalesce(c.start_time, time '09:00')) at time zone 'Asia/Kuala_Lumpur') > now() - interval '1 day'
    for update skip locked
  loop
    insert into public.staff_notifications (teacher_id, title, body, lead_id)
    select distinct t.id, left('Follow-up due: ' || v_item.title, 200), '', v_item.lead_id
    from public.teachers t
    where t.is_active and (t.id = v_item.assignee_id or t.role = 'admin');
    update public.calendar_items set notified_at = now() where id = v_item.id;
    v_rang := v_rang + 1;
  end loop;
  return v_rang;
end;
$$;

revoke all on function public.notify_due_followups() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'followup-notify-due') then
    perform cron.unschedule('followup-notify-due');
  end if;
  perform cron.schedule('followup-notify-due', '*/5 * * * *', 'select public.notify_due_followups()');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 6. Each person's completion of the automatic follow-ups, per month (for the Data Center). Cancelled ones and ones
-- never scheduled are not counted. Read as the person (who sees their own follow-ups, an admin all).
-- ---------------------------------------------------------------------------------------------------------
create or replace view public.followup_completion
with (security_invoker = true)
as
select
  c.assignee_id,
  date_trunc('month', c.item_date)::date as month,
  count(*) filter (where c.cancelled_at is null) as scheduled,
  count(*) filter (where c.cancelled_at is null and c.is_done) as done,
  count(*) filter (
    where c.cancelled_at is null and c.is_done and c.done_at is not null
      and (c.done_at at time zone 'Asia/Kuala_Lumpur')::date <= c.item_date
  ) as on_time,
  count(*) filter (
    where c.cancelled_at is null and not c.is_done
      and c.item_date < (now() at time zone 'Asia/Kuala_Lumpur')::date
  ) as overdue
from public.calendar_items c
where c.followup_step is not null
group by c.assignee_id, date_trunc('month', c.item_date)::date;

grant select on public.followup_completion to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 7. Follow-up templates: a quick reply can say which follow-up of a round it is for (1st, 2nd, ...). The bar above
-- the chat offers the ones for that step; picked, it is put in the message box like any quick reply (never sent by
-- itself). One per subject is a reply per subject with the same step; the team picks.
-- ---------------------------------------------------------------------------------------------------------
alter table public.quick_replies
  add column if not exists followup_step smallint check (followup_step is null or followup_step between 1 and 8);

comment on column public.quick_replies.followup_step is 'A follow-up template: offered for this follow-up of a round (1 = the first).';
