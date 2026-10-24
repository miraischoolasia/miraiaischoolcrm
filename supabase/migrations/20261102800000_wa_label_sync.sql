-- The CRM's tags and "Handled by" (PIC) shown as labels on the school's WhatsApp Business numbers, every night at
-- 04:00 (boss 2026-10-23; plan: side notes wa-nightly-label-sync-plan.md). No message is ever sent: only labels are
-- put on / taken off chats, by the WhatsApp server's wa-label-sync through Evolution (the same as a staff member
-- tapping a label on the phone).
--
--   * Per number, a label budget (WhatsApp Business allows about 20 labels per number): first one "👤 <PIC>" label
--     for each PIC who handles chats on that number, then the CRM tags used on that number, most used first, until
--     the budget is full. A school can instead tick which tags go to each number (app_settings 'wa_label_sync').
--     Tags left out are listed in each night's report.
--   * Only what changed in the CRM is sent: wa_label_sync_state keeps, per chat, the labels last put there. Each
--     night: labels the CRM now wants and did not before are added; labels it wanted before and not now are taken
--     off. A label a staff member put on the phone and the CRM never had is left alone. The first time a chat is
--     synced, labels are only added.
--   * Off until an admin turns it on (enabled false).
--
-- The server reads its work with wa_label_sync_work() and writes back with wa_label_sync_done(),
-- wa_label_map_save() (which WhatsApp label id each name is) and wa_label_sync_report(), with a key of its own
-- (wa_label_sync_reporter). It needs Evolution's label patch (whatsapp-sender/evolution-patches/label_patch.py:
-- full label names, and "create"). The settings page (admin) uses
-- wa_label_sync_settings() / wa_label_sync_save_settings() / wa_label_budget() / wa_label_sync_runs.

-- ---------------------------------------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.wa_label_sync_defaults()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{
    "enabled": false,
    "max_labels": 20,
    "pic_prefix": "👤 ",
    "pic_color": 9,
    "per_night": 300,
    "gap_seconds": 3,
    "inboxes": {}
  }'::jsonb;
$$;

-- The school's settings over the defaults. "inboxes": {"<chatwoot inbox id>": {"tag_ids": [..]}}: the ticked tags
-- of a number (missing = automatic: most used first).
create or replace function public.wa_label_sync_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.wa_label_sync_defaults()
    || coalesce((select s.value from public.app_settings s where s.key = 'wa_label_sync'), '{}'::jsonb);
$$;
revoke all on function public.wa_label_sync_settings() from public, anon;
grant execute on function public.wa_label_sync_settings() to authenticated;

create or replace function public.wa_label_sync_save_settings(p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean jsonb;
  inbox text;
  ticked jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change this.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_value) is distinct from 'object' then
    raise exception 'bad settings';
  end if;
  clean := jsonb_build_object(
    'enabled', coalesce((p_value ->> 'enabled')::boolean, false),
    'max_labels', least(greatest(coalesce((p_value ->> 'max_labels')::integer, 20), 1), 60),
    'pic_prefix', left(coalesce(p_value ->> 'pic_prefix', '👤 '), 8),
    'pic_color', least(greatest(coalesce((p_value ->> 'pic_color')::integer, 9), 0), 19),
    'per_night', least(greatest(coalesce((p_value ->> 'per_night')::integer, 300), 1), 2000),
    'gap_seconds', least(greatest(coalesce((p_value ->> 'gap_seconds')::integer, 3), 1), 30),
    'inboxes', '{}'::jsonb
  );
  for inbox, ticked in select * from jsonb_each(coalesce(p_value -> 'inboxes', '{}'::jsonb)) loop
    continue when inbox !~ '^\d{1,9}$' or jsonb_typeof(ticked -> 'tag_ids') is distinct from 'array';
    clean := jsonb_set(clean, array['inboxes', inbox], jsonb_build_object('tag_ids',
      coalesce((select jsonb_agg(distinct (t)::bigint) from jsonb_array_elements_text(ticked -> 'tag_ids') t where t ~ '^\d{1,18}$'), '[]'::jsonb)));
  end loop;
  insert into public.app_settings (key, value, updated_by)
  values ('wa_label_sync', clean, (select t.id from public.teachers t where t.auth_user_id = auth.uid() limit 1))
  on conflict (key) do update set value = excluded.value, updated_at = timezone('utc', now()), updated_by = excluded.updated_by;
  return public.wa_label_sync_settings();
end;
$$;
revoke all on function public.wa_label_sync_save_settings(jsonb) from public, anon;
grant execute on function public.wa_label_sync_save_settings(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- The budget of one number: which labels it gets
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.wa_label_budget_of(p_inbox_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with settings as (select public.wa_label_sync_settings() as s),
  chats as (
    select distinct c.chatwoot_contact_id, l.id as lead_id, l.pic_id, l.tag_ids
    from public.lead_channels c
    join public.leads l on l.id = c.lead_id
    where c.channel = 'whatsapp' and c.inbox_id = p_inbox_id
  ),
  pics as (
    select o.id, left((select s ->> 'pic_prefix' from settings) || btrim(o.label), 30) as name, count(*) as chats
    from chats ch join public.lead_options o on o.id = ch.pic_id and o.kind = 'pic'
    group by o.id, o.label
  ),
  used as (
    select o.id, left(btrim(o.label), 30) as name, o.color, count(*) as chats
    from chats ch cross join lateral unnest(ch.tag_ids) t(id)
    join public.lead_options o on o.id = t.id and o.kind = 'tag' and o.is_active
    group by o.id, o.label, o.color
  ),
  ticked as (
    select (t)::bigint as id
    from settings, jsonb_array_elements_text((settings.s -> 'inboxes' -> p_inbox_id::text) -> 'tag_ids') t
  ),
  candidates as (
    select u.*, row_number() over (order by u.chats desc, u.name) as n
    from used u
    where not exists (select 1 from settings where (s -> 'inboxes') ? p_inbox_id::text)
       or u.id in (select id from ticked)
  ),
  room as (
    select greatest((select (s ->> 'max_labels')::integer from settings) - (select count(*) from pics), 0) as n
  )
  select jsonb_build_object(
    'inbox_id', p_inbox_id,
    'max_labels', (select (s ->> 'max_labels')::integer from settings),
    'chats', (select count(*) from chats),
    'ticked', exists (select 1 from settings where (s -> 'inboxes') ? p_inbox_id::text),
    'pics', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'chats', chats) order by chats desc, name) from pics), '[]'::jsonb),
    'tags_in', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'color', color, 'chats', chats) order by n)
                         from candidates where n <= (select n from room)), '[]'::jsonb),
    'tags_out', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'chats', chats,
                                   'why', case when id in (select id from candidates) then 'full' else 'not ticked' end) order by chats desc, name)
                          from used where id not in (select id from candidates where n <= (select n from room))), '[]'::jsonb),
    'pic_color', (select (s ->> 'pic_color')::integer from settings)
  );
$$;
revoke all on function public.wa_label_budget_of(bigint) from public, anon, authenticated;

-- For the settings page (admin): the budget of a number as it would be tonight.
create or replace function public.wa_label_budget(p_inbox_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can see this.' using errcode = '42501';
  end if;
  return public.wa_label_budget_of(p_inbox_id);
end;
$$;
revoke all on function public.wa_label_budget(bigint) from public, anon;
grant execute on function public.wa_label_budget(bigint) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- What was last put on each chat, the nights' reports, the server's key
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.wa_label_sync_state (
  inbox_id bigint not null,
  chatwoot_contact_id bigint not null,
  lead_id bigint references public.leads (id) on delete set null,
  -- The label names the CRM wanted on this chat when it was last synced.
  labels text[] not null default '{}',
  synced_at timestamptz not null default now(),
  primary key (inbox_id, chatwoot_contact_id)
);
alter table public.wa_label_sync_state enable row level security;
revoke all on public.wa_label_sync_state from public, anon, authenticated;

create table if not exists public.wa_label_sync_runs (
  id bigint generated always as identity primary key,
  inbox_id bigint not null,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  dry_run boolean not null default false,
  -- Counts and lists only (no names of people): chats changed / skipped / failed, labels added / removed,
  -- labels missing on the phone (to create there), tags left out (full / not ticked), stopped early and why.
  summary jsonb not null default '{}'::jsonb
);
create index if not exists wa_label_sync_runs_inbox on public.wa_label_sync_runs (inbox_id, finished_at desc);
alter table public.wa_label_sync_runs enable row level security;
revoke all on public.wa_label_sync_runs from public, anon, authenticated;
grant select on public.wa_label_sync_runs to authenticated;
drop policy if exists wa_label_sync_runs_read on public.wa_label_sync_runs;
create policy wa_label_sync_runs_read on public.wa_label_sync_runs for select to authenticated using ((select public.is_admin()));

create table if not exists public.wa_label_sync_reporter (
  id boolean primary key default true check (id),
  reporter_key text not null
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
insert into public.wa_label_sync_reporter (id) values (true) on conflict (id) do nothing;
alter table public.wa_label_sync_reporter enable row level security;
revoke all on public.wa_label_sync_reporter from public, anon, authenticated;

create or replace function public.wa_label_sync_check_key(p_key text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_key is null or not exists (select 1 from public.wa_label_sync_reporter r where r.reporter_key = p_key) then
    raise exception 'not allowed' using errcode = '28000';
  end if;
end;
$$;
revoke all on function public.wa_label_sync_check_key(text) from public, anon, authenticated;


-- Which WhatsApp label (its id on that number) each CRM label name is. Written by the server when it finds a label
-- of that name on the phone or makes one (Evolution keeps the full name since its label patch); a label made
-- by the CRM is marked so. The ids are WhatsApp's own, one set per number.
create table if not exists public.wa_label_map (
  inbox_id bigint not null,
  name text not null check (char_length(name) between 1 and 100),
  label_id text not null check (label_id ~ '^\d{1,6}$'),
  made_by_crm boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (inbox_id, name),
  unique (inbox_id, label_id)
);
alter table public.wa_label_map enable row level security;
revoke all on public.wa_label_map from public, anon, authenticated;
grant select on public.wa_label_map to authenticated;
drop policy if exists wa_label_map_read on public.wa_label_map;
create policy wa_label_map_read on public.wa_label_map for select to authenticated using ((select public.is_admin()));

create or replace function public.wa_label_map_save(p_key text, p_inbox_id bigint, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved integer;
begin
  perform public.wa_label_sync_check_key(p_key);
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 200 then
    raise exception 'bad items';
  end if;
  -- A label id now given to another name (renamed on the phone) leaves its old name.
  delete from public.wa_label_map m
  using jsonb_array_elements(p_items) x
  where m.inbox_id = p_inbox_id and m.label_id = x ->> 'label_id' and m.name <> x ->> 'name';
  insert into public.wa_label_map as m (inbox_id, name, label_id, made_by_crm, updated_at)
  select p_inbox_id, left(x ->> 'name', 100), x ->> 'label_id', coalesce((x ->> 'made_by_crm')::boolean, false), now()
  from jsonb_array_elements(p_items) x
  where (x ->> 'label_id') ~ '^\d{1,6}$' and coalesce(x ->> 'name', '') <> ''
  on conflict (inbox_id, name) do update
    set label_id = excluded.label_id, made_by_crm = m.made_by_crm or excluded.made_by_crm, updated_at = now();
  get diagnostics saved = row_count;
  return saved;
end;
$$;
revoke all on function public.wa_label_map_save(text, bigint, jsonb) from public;
grant execute on function public.wa_label_map_save(text, bigint, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- The server's side
-- ---------------------------------------------------------------------------------------------------------

-- Tonight's work for one number: the settings, the budget, and the chats whose wanted labels differ from what was
-- last put there (at most p_limit; p_lead_id = only that lead's chats, for a test).
--   chats: [{chatwoot_contact_id, lead_id, add: [names], remove: [names], first: bool}]
create or replace function public.wa_label_sync_work(p_key text, p_inbox_id bigint, p_limit integer default 300, p_lead_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  budget jsonb;
begin
  perform public.wa_label_sync_check_key(p_key);
  budget := public.wa_label_budget_of(p_inbox_id);
  return jsonb_build_object(
    'settings', public.wa_label_sync_settings(),
    'budget', budget,
    'map', coalesce((select jsonb_object_agg(m.name, m.label_id) from public.wa_label_map m where m.inbox_id = p_inbox_id), '{}'::jsonb),
    'chats', coalesce((
      with chats as (
        select distinct on (c.chatwoot_contact_id) c.chatwoot_contact_id, l.id as lead_id, l.pic_id, l.tag_ids
        from public.lead_channels c join public.leads l on l.id = c.lead_id
        where c.channel = 'whatsapp' and c.inbox_id = p_inbox_id and (p_lead_id is null or l.id = p_lead_id)
        order by c.chatwoot_contact_id, l.id
      ),
      wanted as (
        -- Sorted by name, as wa_label_sync_done() keeps them, so the same labels compare equal.
        select ch.chatwoot_contact_id, ch.lead_id,
          coalesce((select array_agg(n order by n) from (
                      select x ->> 'name' as n from jsonb_array_elements(budget -> 'pics') x where (x ->> 'id')::bigint = ch.pic_id
                      union
                      select x ->> 'name' from jsonb_array_elements(budget -> 'tags_in') x where (x ->> 'id')::bigint = any (ch.tag_ids)
                    ) names), '{}') as labels
        from chats ch
      ),
      diff as (
        select w.chatwoot_contact_id, w.lead_id, w.labels, s.labels as before, s.inbox_id is null as first
        from wanted w
        left join public.wa_label_sync_state s on s.inbox_id = p_inbox_id and s.chatwoot_contact_id = w.chatwoot_contact_id
      )
      select jsonb_agg(jsonb_build_object(
        'chatwoot_contact_id', d.chatwoot_contact_id,
        'lead_id', d.lead_id,
        'labels', to_jsonb(d.labels),
        'add', to_jsonb(array(select unnest(d.labels) except select unnest(coalesce(d.before, '{}')))),
        -- Only a label the CRM itself put there before and no longer wants is taken off (never one a staff
        -- member added on the phone).
        'remove', to_jsonb(array(select unnest(coalesce(d.before, '{}')) except select unnest(d.labels))),
        'first', d.first))
      from (
        select * from diff
        where (first and cardinality(labels) > 0) or (not first and labels is distinct from before)
        order by first, chatwoot_contact_id
        limit greatest(least(coalesce(p_limit, 300), 2000), 1)
      ) d
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.wa_label_sync_work(text, bigint, integer, bigint) from public;
grant execute on function public.wa_label_sync_work(text, bigint, integer, bigint) to anon, authenticated;

-- What was put on a chat: [{chatwoot_contact_id, lead_id, labels: [names actually there now]}].
create or replace function public.wa_label_sync_done(p_key text, p_inbox_id bigint, p_chats jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved integer;
begin
  perform public.wa_label_sync_check_key(p_key);
  if jsonb_typeof(p_chats) is distinct from 'array' or jsonb_array_length(p_chats) > 2000 then
    raise exception 'bad chats';
  end if;
  insert into public.wa_label_sync_state as s (inbox_id, chatwoot_contact_id, lead_id, labels, synced_at)
  select p_inbox_id, (x ->> 'chatwoot_contact_id')::bigint, (x ->> 'lead_id')::bigint,
         coalesce(array(select jsonb_array_elements_text(x -> 'labels') order by 1), '{}'), now()
  from jsonb_array_elements(p_chats) x
  where (x ->> 'chatwoot_contact_id') ~ '^\d{1,18}$'
  on conflict (inbox_id, chatwoot_contact_id) do update
    set labels = excluded.labels, lead_id = excluded.lead_id, synced_at = excluded.synced_at;
  get diagnostics saved = row_count;
  return saved;
end;
$$;
revoke all on function public.wa_label_sync_done(text, bigint, jsonb) from public;
grant execute on function public.wa_label_sync_done(text, bigint, jsonb) to anon, authenticated;

create or replace function public.wa_label_sync_report(p_key text, p_inbox_id bigint, p_started_at timestamptz, p_dry_run boolean, p_summary jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.wa_label_sync_check_key(p_key);
  if jsonb_typeof(p_summary) is distinct from 'object' or length(p_summary::text) > 20000 then
    raise exception 'bad summary';
  end if;
  insert into public.wa_label_sync_runs (inbox_id, started_at, dry_run, summary)
  values (p_inbox_id, p_started_at, coalesce(p_dry_run, false), p_summary);
  delete from public.wa_label_sync_runs where finished_at < now() - interval '90 days';
end;
$$;
revoke all on function public.wa_label_sync_report(text, bigint, timestamptz, boolean, jsonb) from public;
grant execute on function public.wa_label_sync_report(text, bigint, timestamptz, boolean, jsonb) to anon, authenticated;
