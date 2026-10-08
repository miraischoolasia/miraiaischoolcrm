-- Source rules for the WhatsApp inbox: when the first message a parent sends
-- contains a phrase (for example the opening line an advert fills in), the
-- inbox pre-selects that rule's source and tags on the "Add as a new lead" form.
-- Nothing is saved by the rule itself; the team still presses Save lead.
--
-- Whoever can see Leads can read the rules; whoever can edit Leads can change them.

create table if not exists public.lead_source_rules (
  id bigint generated always as identity primary key,
  phrase text not null check (char_length(btrim(phrase)) between 1 and 300),
  source_id bigint references public.lead_options (id),
  tag_ids bigint[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint lead_source_rules_has_effect
    check (source_id is not null or cardinality(tag_ids) > 0)
);

create unique index if not exists lead_source_rules_phrase_key
on public.lead_source_rules (lower(btrim(phrase)));

create or replace function public.lead_source_rules_check_options()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source_id is not null and not exists (
    select 1 from public.lead_options where id = new.source_id and kind = 'source'
  ) then
    raise exception 'That is not a lead source.';
  end if;

  if cardinality(new.tag_ids) > 0 and (
    select count(distinct o.id)
    from public.lead_options o
    where o.kind = 'tag' and o.id = any (new.tag_ids)
  ) <> (select count(distinct t) from unnest(new.tag_ids) t) then
    raise exception 'That is not a lead tag.';
  end if;

  return new;
end;
$$;

revoke all on function public.lead_source_rules_check_options() from public, anon, authenticated;

drop trigger if exists lead_source_rules_check_options on public.lead_source_rules;
create trigger lead_source_rules_check_options
before insert or update of source_id, tag_ids on public.lead_source_rules
for each row execute function public.lead_source_rules_check_options();

alter table public.lead_source_rules enable row level security;

create policy "lead_source_rules_select_permitted"
on public.lead_source_rules
for select to authenticated
using ((select public.has_permission('leads')));

create policy "lead_source_rules_insert_permitted"
on public.lead_source_rules
for insert to authenticated
with check ((select public.has_permission('leads', 'edit')));

create policy "lead_source_rules_update_permitted"
on public.lead_source_rules
for update to authenticated
using ((select public.has_permission('leads', 'edit')))
with check ((select public.has_permission('leads', 'edit')));

create policy "lead_source_rules_delete_permitted"
on public.lead_source_rules
for delete to authenticated
using ((select public.has_permission('leads', 'edit')));

grant select, insert, update, delete on public.lead_source_rules to authenticated;
