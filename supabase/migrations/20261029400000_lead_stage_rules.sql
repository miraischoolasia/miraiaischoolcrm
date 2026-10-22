-- Lead stage rules: the moves a lead makes by itself, as switches the school sets.
--
-- Until now four rules were written into the database and the chat-activity function, and nobody could see or
-- switch them. They are now rows of public.lead_stage_rules (one set per school database), and every place that moved
-- a lead reads its switch from here:
--   contacted_on_reply          the school writes to the parent: New -> Contacted
--                               option count_automated: an automatic message counts too (true) / only a person's (false)
--   trial_scheduled_on_booking  a trial is booked (book_trial_slot): New / Contacted -> Trial Scheduled
--   converted_on_enrol          a student is made from a lead, or an HOA student is converted: -> Converted
--   converted_on_student_phone  a student has the lead's number (link_student_to_lead): -> Converted
--                               option students: all (every student) / regular (a trial student does not count)
-- The defaults are exactly what the database did before, so nothing changes until someone switches a rule.
--
-- Two new flow triggers, from the attendance a teacher takes in a trial class (HOA):
--   trial_attended  the child was marked present      trial_absent  the child was marked absent (or on leave)
-- They start a flow like any other, so "Change stage" can follow them (present -> Trial Completed, ...).

-- ---------------------------------------------------------------------------------------------
-- The switches
-- ---------------------------------------------------------------------------------------------

create table if not exists public.lead_stage_rules (
  key text primary key check (key in (
    'contacted_on_reply', 'trial_scheduled_on_booking', 'converted_on_enrol', 'converted_on_student_phone'
  )),
  enabled boolean not null default true,
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  updated_at timestamptz not null default now()
);

insert into public.lead_stage_rules (key, enabled, options) values
  ('contacted_on_reply', true, '{"count_automated": true}'),
  ('trial_scheduled_on_booking', true, '{}'),
  ('converted_on_enrol', true, '{}'),
  ('converted_on_student_phone', true, '{"students": "all"}')
on conflict (key) do nothing;

alter table public.lead_stage_rules enable row level security;

drop policy if exists "lead_stage_rules_select_permitted" on public.lead_stage_rules;
create policy "lead_stage_rules_select_permitted"
on public.lead_stage_rules
for select to authenticated
using ((select public.has_permission('automations')) or (select public.has_permission('leads')));

revoke all on public.lead_stage_rules from anon, authenticated;
grant select on public.lead_stage_rules to authenticated;

-- Changing a rule goes through here, so only the known options can be written.
create or replace function public.set_lead_stage_rule(p_key text, p_enabled boolean, p_options jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if not public.has_permission('automations', 'edit') then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  select options into v_old from public.lead_stage_rules where key = p_key;
  if not found then
    raise exception 'That rule does not exist.';
  end if;
  v_new := coalesce(p_options, v_old);
  if p_key = 'contacted_on_reply' then
    if jsonb_typeof(v_new -> 'count_automated') is distinct from 'boolean' then
      raise exception 'count_automated must be true or false.';
    end if;
    v_new := jsonb_build_object('count_automated', v_new -> 'count_automated');
  elsif p_key = 'converted_on_student_phone' then
    if (v_new ->> 'students') is null or (v_new ->> 'students') not in ('all', 'regular') then
      raise exception 'students must be all or regular.';
    end if;
    v_new := jsonb_build_object('students', v_new ->> 'students');
  else
    v_new := '{}'::jsonb;
  end if;
  update public.lead_stage_rules
  set enabled = coalesce(p_enabled, enabled), options = v_new, updated_at = now()
  where key = p_key;
end;
$$;

revoke all on function public.set_lead_stage_rule(text, boolean, jsonb) from public, anon;
grant execute on function public.set_lead_stage_rule(text, boolean, jsonb) to authenticated;

-- What the moving functions ask. A rule that is missing counts as on (the old behaviour).
create or replace function public.lead_stage_rule_on(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select r.enabled from public.lead_stage_rules r where r.key = p_key), true);
$$;

create or replace function public.lead_stage_rule_option(p_key text, p_option text, p_default text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select r.options ->> p_option from public.lead_stage_rules r where r.key = p_key), p_default);
$$;

revoke all on function public.lead_stage_rule_on(text), public.lead_stage_rule_option(text, text, text) from public, anon;
grant execute on function public.lead_stage_rule_on(text), public.lead_stage_rule_option(text, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 1. The school writes to the parent: New -> Contacted
--    (the chat-activity function now also says whether the message was sent by an automation)
-- ---------------------------------------------------------------------------------------------

drop function if exists public.mark_lead_contacted_from_chat(text, bigint, text);

create or replace function public.mark_lead_contacted_from_chat(
  p_key text,
  p_contact_id bigint,
  p_phone text,
  p_automated boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_key text;
  digits text;
  lead_found bigint;
begin
  select webhook_key into stored_key from public.chat_webhook_settings limit 1;
  if p_key is null or stored_key is null or p_key <> stored_key then
    raise exception 'The key is not right.' using errcode = '28000';
  end if;

  -- The rule is switched off, or an automatic message does not count.
  if not public.lead_stage_rule_on('contacted_on_reply') then
    return null;
  end if;
  if coalesce(p_automated, false)
     and public.lead_stage_rule_option('contacted_on_reply', 'count_automated', 'true') <> 'true' then
    return null;
  end if;

  -- The lead the chat's contact is already tied to.
  if p_contact_id is not null then
    select pe.lead_id into lead_found
    from public.people pe
    where pe.chatwoot_contact_id = p_contact_id and pe.lead_id is not null
    limit 1;
  end if;

  -- Otherwise the lead that owns the chat's real number (its own, or a child's).
  if lead_found is null then
    digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
    if digits ~ '^(60|65)[0-9]{8,10}$' then
      select l.id into lead_found
      from public.leads l
      where public.people_digits(l.phone) = digits
         or exists (
           select 1 from jsonb_array_elements(coalesce(l.children, '[]'::jsonb)) c
           where public.people_digits(c ->> 'phone') = digits
         )
      order by l.id
      limit 1;
    end if;
  end if;

  if lead_found is null then
    return null;
  end if;

  update public.leads set status = 'contacted'
  where id = lead_found and status = 'new' and public.lead_stage_active('contacted');
  if not found then
    return null;
  end if;
  return lead_found;
end;
$$;

revoke all on function public.mark_lead_contacted_from_chat(text, bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.mark_lead_contacted_from_chat(text, bigint, text, boolean) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 2-4. The other functions: each takes its own text and only the line that moves the stage changes.
--      If a line is not found the migration stops, so a rule can never be left unread by mistake.
-- ---------------------------------------------------------------------------------------------

create or replace function pg_temp.patch_function(p_name text, p_from text, p_to text)
returns void
language plpgsql
as $$
declare
  v_oid oid;
  v_def text;
  v_found boolean := false;
begin
  -- Every version of the function (a function can exist with more than one list of arguments).
  for v_oid in
    select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = p_name
  loop
    v_def := pg_get_functiondef(v_oid);
    if position(p_to in v_def) > 0 then
      v_found := true;
    elsif position(p_from in v_def) > 0 then
      execute replace(v_def, p_from, p_to);
      v_found := true;
    end if;
  end loop;
  if not v_found then
    raise exception 'The stage line was not found in %.', p_name;
  end if;
end;
$$;

-- A trial is booked: an existing lead moves to Trial Scheduled, a lead made by the booking starts there.
select pg_temp.patch_function(
  'book_trial_slot',
  $s$status = case when status in ('new', 'contacted') and public.lead_stage_active('trial_scheduled') then 'trial_scheduled' else status end$s$,
  $s$status = case when status in ('new', 'contacted') and public.lead_stage_active('trial_scheduled') and public.lead_stage_rule_on('trial_scheduled_on_booking') then 'trial_scheduled' else status end$s$);
select pg_temp.patch_function(
  'book_trial_slot',
  $s$case when public.lead_stage_active('trial_scheduled') then 'trial_scheduled' else 'new' end,$s$,
  $s$case when public.lead_stage_active('trial_scheduled') and public.lead_stage_rule_on('trial_scheduled_on_booking') then 'trial_scheduled' else 'new' end,$s$);

-- A student is made from a lead, and an HOA student is converted: the lead is tied to the student either way;
-- it becomes Converted only while the rule is on.
select pg_temp.patch_function(
  'create_student_record',
  $s$set status = 'converted', converted_student_id = v_student_id$s$,
  $s$set status = case when public.lead_stage_rule_on('converted_on_enrol') then 'converted' else status end, converted_student_id = v_student_id$s$);
select pg_temp.patch_function(
  'convert_hoa_student',
  $s$set status = 'converted', converted_student_id = p_student_id$s$,
  $s$set status = case when public.lead_stage_rule_on('converted_on_enrol') then 'converted' else status end, converted_student_id = p_student_id$s$);

-- A student has the lead's number: with the rule off, or for a trial student when only regular ones count,
-- the lead is left as it is (the family record is still tied to the parent below).
select pg_temp.patch_function(
  'link_student_to_lead',
  $s$if v_lead.converted_student_id is null then$s$,
  $s$if v_lead.converted_student_id is null
     and public.lead_stage_rule_on('converted_on_student_phone')
     and (public.lead_stage_rule_option('converted_on_student_phone', 'students', 'all') = 'all'
          or s.student_type = 'regular') then$s$);

-- ---------------------------------------------------------------------------------------------
-- The new flow triggers
-- ---------------------------------------------------------------------------------------------

alter table public.automation_flows drop constraint if exists automation_flows_trigger_type_check;
alter table public.automation_flows
  add constraint automation_flows_trigger_type_check
  check (trigger_type in (
    'class_start', 'replacement_start', 'trial_start', 'zoom_start',
    'lesson_expiry', 'account_fee_expiry', 'club_fee_expiry', 'lead_created', 'form_submitted',
    'parent_no_reply', 'parent_waiting',
    'trial_booked', 'package_start', 'lead_idle', 'task_due',
    'message_keyword',
    'trial_attended', 'trial_absent'
  ));

-- One event per trial booking once the teacher has taken attendance: from the moment the (latest) attendance was
-- saved. Present = attended; absent or on leave = absent. The columns are those of automation.rule_events_base.
create or replace view automation.trial_result_events as
select
  case when r.attendance_status = 'present' then 'trial_attended' else 'trial_absent' end as trigger_type,
  case when r.attendance_status = 'present' then 'trial_attended:' else 'trial_absent:' end || t.id as event_key,
  t.phone,
  ld.full_name as parent_name,
  t.child_name,
  t.student_id,
  t.lead_id,
  r.submitted_at as starts_at,
  to_char(r.submitted_at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI am') as start_label,
  t.booking_date as class_date,
  coalesce(t.classroom_name, t.class_title) as class_label,
  t.classroom_id,
  t.child_age as age,
  null::numeric as hours_left,
  ld.status as lead_status,
  case when r.attendance_status = 'present' then 'trial_attended:' else 'trial_absent:' end || t.id as group_key
from automation.trials t
join public.trial_bookings tb on tb.id = t.id
join lateral (
  select ll.submitted_at, lls.attendance_status
  from public.lesson_logs ll
  join public.lesson_log_students lls on lls.lesson_log_id = ll.id and lls.student_id = t.student_id
  where ll.schedule_id = tb.schedule_id and ll.lesson_date = t.booking_date
  order by ll.revision_number desc
  limit 1
) r on true
left join automation.leads ld on ld.id = t.lead_id
where t.student_id is not null
  and r.attendance_status in ('present', 'absent', 'leave')
  and r.submitted_at > now() - interval '62 days';

revoke all on automation.trial_result_events from public, anon, authenticated;

-- Everything a rule can be about: the old events plus these two.
create or replace view automation.rule_events as
select
  b.trigger_type,
  b.event_key,
  b.phone,
  b.parent_name,
  b.child_name,
  b.student_id,
  b.lead_id,
  b.starts_at,
  b.start_label,
  b.class_date,
  b.class_label,
  b.classroom_id,
  b.age,
  b.hours_left,
  b.lead_status,
  b.group_key,
  x.source_id,
  x.pic_id,
  x.tag_ids,
  x.form_ids,
  x.keyword_id
from (
  select * from automation.rule_events_base
  union all
  select * from automation.trial_result_events
) b
left join lateral (
  select
    l.source_id,
    l.pic_id,
    l.source_rule_id as keyword_id,
    coalesce(l.tag_ids, '{}')::bigint[] as tag_ids,
    coalesce(
      (
        select array_agg(distinct fs.form_id::text)
        from public.form_submissions fs
        where fs.lead_id = l.id and fs.status = 'completed'
      ),
      '{}'::text[]
    ) as form_ids
  from public.leads l
  where l.id = coalesce(
    b.lead_id,
    (
      select par.lead_id
      from public.people ch
      join public.people par on par.id = ch.parent_id
      where ch.student_id = b.student_id and par.lead_id is not null
      limit 1
    )
  )
) x on true;

revoke all on automation.rule_events from public, anon, authenticated;
