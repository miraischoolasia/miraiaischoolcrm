-- The Zoom accounts that host a school's lessons.
--
-- A Zoom user hosts a limited number of meetings at once (1, or 2 on plans
-- with concurrent meetings), and a school usually has a few licensed Zoom
-- users shared by its teachers. Each school lists them and says how many
-- meetings each may run at once (app_settings 'zoom_hosts': hosts in order,
-- per_host); when a lesson's meeting is made, the first one with room at that
-- time (15 minutes either side) hosts it. With no list, the ZOOM_HOST_USER
-- secret hosts every meeting, as before.
--
-- A teacher may have their own Zoom account (teachers.zoom_host_user): their
-- lessons use it first, and only when it is full at that time another one.
--
-- Two schools sharing one Zoom account must list different users: each school
-- only sees its own lessons.

alter table public.class_session_zoom
  add column if not exists host_user text check (host_user is null or char_length(host_user) <= 200);

alter table public.teachers
  add column if not exists zoom_host_user text check (zoom_host_user is null or char_length(zoom_host_user) <= 200);

comment on column public.teachers.zoom_host_user is 'The Zoom account (e-mail) this teacher''s lessons use first.';

insert into public.app_settings (key, value)
values ('zoom_hosts', '{"hosts": [], "per_host": 1}'::jsonb)
on conflict (key) do nothing;

create or replace function public.set_zoom_hosts(p_hosts text[], p_per_host integer default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hosts text[];
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the Zoom accounts.';
  end if;
  if p_per_host is null or p_per_host not between 1 and 10 then
    raise exception 'Each account runs 1 to 10 meetings at once.';
  end if;
  select coalesce(array_agg(h order by ord), '{}') into v_hosts
  from (
    select distinct on (lower(btrim(h))) lower(btrim(h)) as h, ord
    from unnest(coalesce(p_hosts, '{}')) with ordinality as t(h, ord)
    where btrim(h) <> ''
    order by lower(btrim(h)), ord
  ) cleaned;
  if cardinality(v_hosts) > 50 then
    raise exception 'List up to 50 Zoom accounts.';
  end if;
  if exists (select 1 from unnest(v_hosts) h where h !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Each Zoom account is the e-mail it signs in with.';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('zoom_hosts', jsonb_build_object('hosts', to_jsonb(v_hosts), 'per_host', p_per_host), timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_zoom_hosts(text[], integer) from public, anon;
grant execute on function public.set_zoom_hosts(text[], integer) to authenticated;

-- An admin sets (or clears, with null) a teacher's own Zoom account.
create or replace function public.set_teacher_zoom_host(p_teacher_id bigint, p_host text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host text := nullif(lower(btrim(coalesce(p_host, ''))), '');
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the Zoom accounts.';
  end if;
  if v_host is not null and v_host !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'The Zoom account is the e-mail it signs in with.';
  end if;
  update public.teachers set zoom_host_user = v_host where id = p_teacher_id;
  if not found then
    raise exception 'Teacher not found.';
  end if;
end;
$$;

revoke all on function public.set_teacher_zoom_host(bigint, text) from public, anon;
grant execute on function public.set_teacher_zoom_host(bigint, text) to authenticated;

-- The school's Zoom accounts in order (the lesson teacher's own first, marked
-- preferred), each with the lessons it already hosts
-- at this lesson's time, and busy_with set when it has no room left (null:
-- it can host this one). For the lesson's teacher.
create or replace function public.zoom_hosts_for_session(p_session_id bigint)
returns table (host_user text, busy_with text, meetings integer, preferred boolean)
language sql
stable
security definer
set search_path = public
as $$
  with lesson as (
    select cs.* from public.class_sessions cs
    where cs.id = p_session_id and public.can_run_class_session(cs.id)
  ),
  settings as (
    select coalesce(s.value -> 'hosts', '[]'::jsonb) as hosts,
      greatest(coalesce((s.value ->> 'per_host')::integer, 1), 1) as per_host
    from public.app_settings s
    where s.key = 'zoom_hosts'
  ),
  listed as (
    select lower(h.value) as host_user, h.ordinality
    from settings st, jsonb_array_elements_text(st.hosts) with ordinality h
  ),
  own as (
    select lower(t.zoom_host_user) as host_user
    from lesson l join public.teachers t on t.id = l.teacher_id
    where t.zoom_host_user is not null
  ),
  hosts as (
    select candidates.host_user, min(candidates.ordinality) as ordinality,
      coalesce((select per_host from settings), 1) as per_host,
      bool_or(candidates.preferred) as preferred
    from (
      select o.host_user, 0::bigint as ordinality, true as preferred from own o
      union all
      select li.host_user, li.ordinality, false from listed li
    ) candidates
    group by candidates.host_user
  ),
  overlapping as (
    select h.host_user,
      count(*)::integer as meetings,
      string_agg(sch.title || ' ' || to_char(other.starts_at at time zone 'Asia/Kuala_Lumpur', 'HH24:MI'), ', ' order by other.starts_at) as lessons
    from hosts h
    join public.class_session_zoom z on lower(z.host_user) = h.host_user
    join public.class_sessions other on other.id = z.session_id
    join public.schedules sch on sch.id = other.schedule_id
    join lesson l on true
    where other.id <> l.id
      and other.starts_at < l.ends_at + interval '15 minutes'
      and other.ends_at > l.starts_at - interval '15 minutes'
    group by h.host_user
  )
  select h.host_user,
    case when coalesce(o.meetings, 0) >= h.per_host then o.lessons end,
    coalesce(o.meetings, 0),
    h.preferred
  from hosts h
  left join overlapping o on o.host_user = h.host_user
  where exists (select 1 from lesson)
  order by h.ordinality;
$$;

revoke all on function public.zoom_hosts_for_session(bigint) from public, anon;
grant execute on function public.zoom_hosts_for_session(bigint) to authenticated;
