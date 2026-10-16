-- Lead stages the school can set up itself: a name, a colour, an order, any number of them. The six stages
-- the CRM was made with stay (they are what the automatic moves use: the first reply makes a lead Contacted, a
-- booked trial makes it Trial Scheduled, becoming a student makes it Converted), and the school can rename,
-- recolour and reorder them, and turn off the optional ones (Contacted, Trial Scheduled, Trial Completed).
-- On top of them the school adds stages of its own. leads.status keeps holding the stage's key.

create table if not exists public.lead_stages (
  key text primary key default ('stage_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  color text not null default 'slate'
    check (color in ('slate', 'sky', 'amber', 'violet', 'emerald', 'red', 'pink', 'orange', 'teal', 'indigo')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  -- The six the CRM was made with; they cannot be deleted.
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.lead_stages (key, label, color, sort_order, is_system) values
  ('new', 'New', 'slate', 10, true),
  ('contacted', 'Contacted', 'sky', 20, true),
  ('trial_scheduled', 'Trial Scheduled', 'amber', 30, true),
  ('trial_completed', 'Trial Completed', 'violet', 40, true),
  ('converted', 'Converted', 'emerald', 50, true),
  ('lost', 'Lost', 'red', 60, true)
on conflict (key) do nothing;

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads drop constraint if exists leads_status_fkey;
alter table public.leads
  add constraint leads_status_fkey foreign key (status) references public.lead_stages (key) on update cascade;

-- ---------------------------------------------------------------------------------------------
-- Rules a stage keeps
-- ---------------------------------------------------------------------------------------------

create or replace function public.lead_stages_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count bigint;
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'The stage "%" is built in and cannot be deleted.', old.label;
    end if;
    select count(*) into v_count from public.leads where status = old.key;
    if v_count > 0 then
      raise exception '% lead(s) are in "%". Move them to another stage first.', v_count, old.label;
    end if;
    return old;
  end if;

  if new.key <> old.key or new.is_system <> old.is_system then
    raise exception 'A stage''s key cannot be changed.';
  end if;
  if old.is_active and not new.is_active then
    if old.key in ('new', 'converted', 'lost') then
      raise exception 'The stage "%" cannot be turned off.', old.label;
    end if;
    select count(*) into v_count from public.leads where status = old.key;
    if v_count > 0 then
      raise exception '% lead(s) are in "%". Move them to another stage first.', v_count, old.label;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists lead_stages_guard on public.lead_stages;
create trigger lead_stages_guard
before update or delete on public.lead_stages
for each row execute function public.lead_stages_guard();

-- ---------------------------------------------------------------------------------------------
-- Who can do what: everyone who sees Leads reads the stages, only an admin changes them
-- ---------------------------------------------------------------------------------------------

alter table public.lead_stages enable row level security;

create policy "lead_stages_select_permitted"
on public.lead_stages for select to authenticated
using ((select public.has_permission('leads')));

create policy "lead_stages_insert_admin"
on public.lead_stages for insert to authenticated
with check ((select public.is_admin()) and not is_system);

create policy "lead_stages_update_admin"
on public.lead_stages for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "lead_stages_delete_admin"
on public.lead_stages for delete to authenticated
using ((select public.is_admin()) and not is_system);

revoke all on public.lead_stages from anon, authenticated;
grant select on public.lead_stages to authenticated;
grant insert (label, color, sort_order, is_active) on public.lead_stages to authenticated;
grant update (label, color, sort_order, is_active) on public.lead_stages to authenticated;
grant delete on public.lead_stages to authenticated;

create or replace function public.reorder_lead_stages(p_keys text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Only an admin can change the stages.';
  end if;
  update public.lead_stages as s
  set sort_order = ordered.position * 10
  from unnest(p_keys) with ordinality as ordered (key, position)
  where s.key = ordered.key;
end;
$$;

revoke all on function public.reorder_lead_stages(text[]) from public, anon;
grant execute on function public.reorder_lead_stages(text[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Questions the other functions ask about a stage
-- ---------------------------------------------------------------------------------------------

create or replace function public.is_lead_stage(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.lead_stages where key = p_key);
$$;

create or replace function public.lead_stage_active(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.lead_stages where key = p_key and is_active);
$$;

-- A flow may move a lead to any stage that is on, except Converted (a lead becomes that by becoming a student).
create or replace function public.is_settable_lead_stage(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.lead_stages where key = p_key and is_active and key <> 'converted');
$$;

-- How far along a stage is, for joining two leads: the furthest one stays. Lost is the least, Converted the most.
create or replace function public.lead_stage_rank(p_key text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case p_key
    when 'lost' then -1
    when 'converted' then 1000000
    else coalesce((select sort_order from public.lead_stages where key = p_key), 0)
  end;
$$;

revoke all on function public.is_lead_stage(text), public.lead_stage_active(text),
  public.is_settable_lead_stage(text), public.lead_stage_rank(text) from public, anon;
grant execute on function public.is_lead_stage(text), public.lead_stage_active(text),
  public.is_settable_lead_stage(text), public.lead_stage_rank(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The functions that had the six stages written into them now ask the table. Each is taken as it is in
-- the database and only the lines about stages change.
-- ---------------------------------------------------------------------------------------------

do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  -- A flow's stage conditions and settings, and the stage a step moves a lead to.
  select p.oid into v_oid from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'automation_flows_validate';
  if v_oid is not null then
    v_def := pg_get_functiondef(v_oid);
    v_new := replace(v_def,
      $s$(s #>> '{}') not in ('new', 'contacted', 'trial_scheduled', 'trial_completed', 'converted', 'lost')$s$,
      $s$not public.is_lead_stage(s #>> '{}')$s$);
    v_new := replace(v_new,
      $s$coalesce(n ->> 'value', '') not in ('new', 'contacted', 'trial_scheduled', 'trial_completed', 'lost')$s$,
      $s$not public.is_settable_lead_stage(coalesce(n ->> 'value', ''))$s$);
    v_new := replace(v_new,
      $s$jsonb_array_length(n -> 'stages') not between 1 and 6$s$,
      $s$jsonb_array_length(n -> 'stages') not between 1 and 40$s$);
    v_new := replace(v_new,
      $s$jsonb_array_length(g -> 'settings' -> 'stopStages') > 6$s$,
      $s$jsonb_array_length(g -> 'settings' -> 'stopStages') > 40$s$);
    if v_new <> v_def then
      execute v_new;
    end if;
  end if;

  -- A booked trial makes a lead Trial Scheduled, when that stage is on.
  select p.oid into v_oid from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'book_trial_slot';
  if v_oid is not null then
    v_def := pg_get_functiondef(v_oid);
    v_new := replace(v_def,
      $s$'trial_scheduled',$s$,
      $s$case when public.lead_stage_active('trial_scheduled') then 'trial_scheduled' else 'new' end,$s$);
    v_new := replace(v_new,
      $s$status = case when status in ('new', 'contacted') then 'trial_scheduled' else status end$s$,
      $s$status = case when status in ('new', 'contacted') and public.lead_stage_active('trial_scheduled') then 'trial_scheduled' else status end$s$);
    if v_new <> v_def then
      execute v_new;
    end if;
  end if;

  -- The stage a flow step moves a lead to.
  select p.oid into v_oid from pg_proc p
  where p.pronamespace = 'automation'::regnamespace and p.proname = 'do_flow_action';
  if v_oid is not null then
    v_def := pg_get_functiondef(v_oid);
    v_new := replace(v_def,
      $s$p_value not in ('new', 'contacted', 'trial_scheduled', 'trial_completed', 'lost')$s$,
      $s$not public.is_settable_lead_stage(p_value)$s$);
    if v_new <> v_def then
      execute v_new;
    end if;
  end if;

  -- The first reply makes a lead Contacted, when that stage is on.
  select p.oid into v_oid from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'mark_lead_contacted_from_chat';
  if v_oid is not null then
    v_def := pg_get_functiondef(v_oid);
    v_new := replace(v_def,
      $s$update public.leads set status = 'contacted' where id = lead_found and status = 'new';$s$,
      $s$update public.leads set status = 'contacted' where id = lead_found and status = 'new' and public.lead_stage_active('contacted');$s$);
    if v_new <> v_def then
      execute v_new;
    end if;
  end if;

  -- Joining two leads keeps the furthest stage.
  select p.oid into v_oid from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'merge_leads';
  if v_oid is not null then
    v_def := pg_get_functiondef(v_oid);
    v_new := replace(v_def,
      $s$array_position(array['lost', 'new', 'contacted', 'trial_scheduled', 'trial_completed', 'converted'], main.status)$s$,
      $s$public.lead_stage_rank(main.status)$s$);
    v_new := replace(v_new,
      $s$array_position(array['lost', 'new', 'contacted', 'trial_scheduled', 'trial_completed', 'converted'], other.status)$s$,
      $s$public.lead_stage_rank(other.status)$s$);
    if v_new <> v_def then
      execute v_new;
    end if;
  end if;
end;
$$;
