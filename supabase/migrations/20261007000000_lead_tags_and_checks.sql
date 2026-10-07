-- Lead tags, and three tick columns that show how far a lead has been followed up.
--
-- * Tags: the admin's list of tags lives in lead_options (kind 'tag', with a
--   colour). A lead holds the ids of its tags in leads.tag_ids. Tags are hidden,
--   never deleted, like sources and PICs.
-- * Tick columns: three fixed columns whose names the admin can change (kind
--   'check', legacy keys check_1 .. check_3). leads.checks holds the ticked
--   ones as { "1": { "at": time, "by": teacher id }, ... }; the time and the
--   person are stamped here, not sent by the browser, and stay when the lead is
--   saved again. set_lead_check() ticks or unticks one box on its own, so two
--   people ticking different boxes of the same lead never undo each other.

alter table public.lead_options
  drop constraint if exists lead_options_kind_check;
alter table public.lead_options
  add constraint lead_options_kind_check check (kind in ('source', 'pic', 'tag', 'check'));

alter table public.lead_options
  add column if not exists color text;
alter table public.lead_options
  drop constraint if exists lead_options_color_check;
alter table public.lead_options
  add constraint lead_options_color_check check (color is null or color ~ '^#[0-9a-fA-F]{6}$');

insert into public.lead_options (kind, label, legacy_key)
values
  ('check', 'Follow up 1', 'check_1'),
  ('check', 'Follow up 2', 'check_2'),
  ('check', 'Follow up 3', 'check_3')
on conflict (legacy_key) do nothing;

alter table public.leads
  add column if not exists tag_ids bigint[] not null default '{}',
  add column if not exists checks jsonb not null default '{}'::jsonb;

create index if not exists idx_leads_tag_ids on public.leads using gin (tag_ids);

-- Same checks as before, plus: every tag id has to be a tag.
create or replace function public.leads_check_options()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source_id is null then
    select id into new.source_id
    from public.lead_options
    where legacy_key = coalesce(new.source, 'other');
  end if;

  if new.source_id is not null and not exists (
    select 1 from public.lead_options where id = new.source_id and kind = 'source'
  ) then
    raise exception 'That is not a lead source.';
  end if;

  if new.pic_id is not null and not exists (
    select 1 from public.lead_options where id = new.pic_id and kind = 'pic'
  ) then
    raise exception 'That is not a PIC.';
  end if;

  if coalesce(array_length(new.tag_ids, 1), 0) > 0 and (
    select count(distinct o.id)
    from public.lead_options o
    where o.kind = 'tag' and o.id = any (new.tag_ids)
  ) <> (select count(distinct t) from unnest(new.tag_ids) t) then
    raise exception 'That is not a lead tag.';
  end if;

  return new;
end;
$$;

revoke all on function public.leads_check_options() from public, anon, authenticated;

drop trigger if exists leads_check_options on public.leads;
create trigger leads_check_options
before insert or update of source, source_id, pic_id, tag_ids on public.leads
for each row execute function public.leads_check_options();

-- Keeps only boxes 1 to 3, and gives each newly ticked box its time and person.
create or replace function public.leads_stamp_checks()
returns trigger
language plpgsql
as $$
declare
  v_old jsonb := case when tg_op = 'UPDATE' then coalesce(old.checks, '{}'::jsonb) else '{}'::jsonb end;
  v_new jsonb := '{}'::jsonb;
  v_slot text;
begin
  foreach v_slot in array array['1', '2', '3']
  loop
    if jsonb_typeof(new.checks) = 'object'
       and new.checks ? v_slot
       and new.checks -> v_slot not in ('false'::jsonb, 'null'::jsonb) then
      v_new := v_new || jsonb_build_object(
        v_slot,
        case
          when v_old ? v_slot then v_old -> v_slot
          else jsonb_build_object('at', to_jsonb(now()), 'by', public.current_teacher_id())
        end
      );
    end if;
  end loop;

  new.checks := v_new;
  return new;
end;
$$;

revoke all on function public.leads_stamp_checks() from public, anon, authenticated;

drop trigger if exists leads_stamp_checks on public.leads;
create trigger leads_stamp_checks
before insert or update of checks on public.leads
for each row execute function public.leads_stamp_checks();

-- Ticks or unticks one box. Runs as the caller, so only accounts that may edit
-- leads change anything; returns false when no lead was changed.
create or replace function public.set_lead_check(p_lead_id bigint, p_slot int, p_checked boolean)
returns boolean
language plpgsql
as $$
begin
  if p_slot not between 1 and 3 then
    raise exception 'There are only three tick columns.';
  end if;

  update public.leads
  set checks = case
    when p_checked then coalesce(checks, '{}'::jsonb) || jsonb_build_object(p_slot::text, true)
    else coalesce(checks, '{}'::jsonb) - p_slot::text
  end
  where id = p_lead_id;

  return found;
end;
$$;

revoke all on function public.set_lead_check(bigint, int, boolean) from public, anon;
grant execute on function public.set_lead_check(bigint, int, boolean) to authenticated;
