-- Working hours of the team, time off and swaps, and Team Replies counting only working time
-- (docs/teams-permissions-design.md, sections 7 and 8). Needs 20261026000000 .. 020000.
--
--   staff_shifts          a person's fixed week: weekday + from..to, valid from a day (a new week does not
--                         overwrite the old one, so old days are worked out again with the week of that time)
--   staff_roster_changes  time off ('off') and extra time ('extra'); a swap is an 'off' for one person and an
--                         'extra' for the other, tied by swap_id
--   app_settings          'business_hours' (the school's opening hours, for whoever has no week and for
--                         messages typed on the phone) and 'leave_reasons' (the kinds of time off). White-label.
--
-- Team Replies keeps the clock waits as before (waits) and adds the working-time waits (duty_waits): the part
-- of each wait in which the person who answered was working. A day with a week uses the week; a day without
-- one uses the opening hours; with no opening hours set the whole day counts, which is what the page shows
-- today. Nobody has a week yet, so the kept days get duty_waits = waits here, which is exactly right.

-- ---------------------------------------------------------------------------------------------------------
-- 1. The tables.
-- ---------------------------------------------------------------------------------------------------------

create table public.staff_shifts (
  id bigint generated always as identity primary key,
  teacher_id bigint not null references public.teachers (id) on delete cascade,
  -- 0 = Sunday ... 6 = Saturday (as extract(dow)).
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  effective_from date not null default date '2000-01-01',
  effective_to date,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  check (effective_to is null or effective_to >= effective_from)
);

create index staff_shifts_teacher_idx on public.staff_shifts (teacher_id, effective_from);

create table public.staff_roster_changes (
  id bigint generated always as identity primary key,
  teacher_id bigint not null references public.teachers (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  change text not null check (change in ('off', 'extra')),
  reason text check (reason is null or char_length(btrim(reason)) between 1 and 60),
  swap_id uuid,
  note text check (note is null or char_length(note) <= 300),
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '366 days')
);

create index staff_roster_changes_teacher_idx on public.staff_roster_changes (teacher_id, starts_at);
create index staff_roster_changes_swap_idx on public.staff_roster_changes (swap_id) where swap_id is not null;

comment on table public.staff_shifts is 'Each person''s fixed week. Old weeks are kept (effective_to) so old days can be worked out again.';
comment on table public.staff_roster_changes is 'Time off (off) and extra time (extra). A swap is one of each, with the same swap_id.';

alter table public.staff_shifts enable row level security;
alter table public.staff_roster_changes enable row level security;

-- Everyone reads their own week and time off; the Working Hours tick reads everybody's.
create policy staff_shifts_select on public.staff_shifts
  for select to authenticated
  using (teacher_id = (select public.current_teacher_id()) or (select public.has_permission('staff_hours')));

create policy staff_roster_changes_select on public.staff_roster_changes
  for select to authenticated
  using (teacher_id = (select public.current_teacher_id()) or (select public.has_permission('staff_hours')));

revoke all on public.staff_shifts, public.staff_roster_changes from anon;
revoke insert, update, delete on public.staff_shifts, public.staff_roster_changes from authenticated;
grant select on public.staff_shifts, public.staff_roster_changes to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2. Changing them (admin only; the school's lists by whoever may change Class Settings).
-- ---------------------------------------------------------------------------------------------------------

-- The school's day (Malaysia unless a school sets its own).
create or replace function public.school_time_zone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.value ->> 'time_zone' from public.app_settings s where s.key = 'business_hours'),
    'Asia/Kuala_Lumpur'
  );
$$;

-- A person's week from a day on: [{"weekday": 1, "start": "09:00", "end": "18:00"}, ...]. An empty list
-- ends the week (from then on the opening hours count). The first week a person gets counts for the past too.
create or replace function public.save_staff_week(p_teacher_id bigint, p_shifts jsonb, p_from date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.teachers%rowtype;
  v_from date;
  v_before jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change working hours.' using errcode = '42501';
  end if;
  select * into v_account from public.teachers where id = p_teacher_id;
  if not found then
    raise exception 'Account not found.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(coalesce(p_shifts, '[]'::jsonb)) <> 'array' or exists (
    select 1 from jsonb_array_elements(coalesce(p_shifts, '[]'::jsonb)) s
    where jsonb_typeof(s -> 'weekday') <> 'number'
      or (s ->> 'weekday')::int not between 0 and 6
      or coalesce(s ->> 'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(s ->> 'end', '') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
      or (s ->> 'end')::time <= (s ->> 'start')::time and s ->> 'end' <> '24:00'
  ) then
    raise exception 'Each time needs a day and a start before its end, like 09:00 to 18:00.' using errcode = '22023';
  end if;

  v_from := case
    when not exists (select 1 from public.staff_shifts where teacher_id = p_teacher_id) then date '2000-01-01'
    else coalesce(p_from, (now() at time zone public.school_time_zone())::date)
  end;

  select coalesce(jsonb_agg(jsonb_build_object('weekday', weekday, 'start', to_char(start_time, 'HH24:MI'), 'end', to_char(end_time, 'HH24:MI')) order by weekday, start_time), '[]'::jsonb)
  into v_before
  from public.staff_shifts
  where teacher_id = p_teacher_id and effective_from <= v_from and (effective_to is null or effective_to >= v_from);

  delete from public.staff_shifts where teacher_id = p_teacher_id and effective_from >= v_from;
  update public.staff_shifts set effective_to = v_from - 1
  where teacher_id = p_teacher_id and (effective_to is null or effective_to >= v_from);

  insert into public.staff_shifts (teacher_id, weekday, start_time, end_time, effective_from)
  select p_teacher_id, (s ->> 'weekday')::smallint, (s ->> 'start')::time,
    case when s ->> 'end' = '24:00' then time '23:59:59' else (s ->> 'end')::time end, v_from
  from jsonb_array_elements(coalesce(p_shifts, '[]'::jsonb)) s;

  perform public.record_admin_activity('working_hours_updated', 'teacher', p_teacher_id, v_account.full_name,
    jsonb_build_object('from', v_from, 'previous', v_before, 'new', coalesce(p_shifts, '[]'::jsonb)));
end;
$$;

-- Time off or extra time for one person. Returns its id.
create or replace function public.add_roster_change(
  p_teacher_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_change text,
  p_reason text default null,
  p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.teachers%rowtype;
  v_id bigint;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change working hours.' using errcode = '42501';
  end if;
  select * into v_account from public.teachers where id = p_teacher_id;
  if not found then
    raise exception 'Account not found.' using errcode = 'P0002';
  end if;
  insert into public.staff_roster_changes (teacher_id, starts_at, ends_at, change, reason, note, created_by)
  values (p_teacher_id, p_starts_at, p_ends_at, p_change, nullif(btrim(coalesce(p_reason, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''), public.current_teacher_id())
  returning id into v_id;
  perform public.record_admin_activity(case p_change when 'off' then 'time_off_added' else 'extra_time_added' end,
    'teacher', p_teacher_id, v_account.full_name,
    jsonb_build_object('starts_at', p_starts_at, 'ends_at', p_ends_at, 'reason', p_reason));
  return v_id;
end;
$$;

-- A swap: p_from_teacher does not work then, p_to_teacher works instead. Returns the swap id.
create or replace function public.add_shift_swap(
  p_from_teacher_id bigint,
  p_to_teacher_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_swap uuid := gen_random_uuid();
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change working hours.' using errcode = '42501';
  end if;
  if p_from_teacher_id = p_to_teacher_id then
    raise exception 'A swap needs two different people.' using errcode = '22023';
  end if;
  if (select count(*) from public.teachers where id in (p_from_teacher_id, p_to_teacher_id)) <> 2 then
    raise exception 'Account not found.' using errcode = 'P0002';
  end if;
  insert into public.staff_roster_changes (teacher_id, starts_at, ends_at, change, reason, swap_id, note, created_by)
  values
    (p_from_teacher_id, p_starts_at, p_ends_at, 'off', nullif(btrim(coalesce(p_reason, '')), ''), v_swap,
      nullif(btrim(coalesce(p_note, '')), ''), public.current_teacher_id()),
    (p_to_teacher_id, p_starts_at, p_ends_at, 'extra', nullif(btrim(coalesce(p_reason, '')), ''), v_swap,
      nullif(btrim(coalesce(p_note, '')), ''), public.current_teacher_id());
  perform public.record_admin_activity('shift_swapped', 'teacher', p_from_teacher_id,
    (select full_name from public.teachers where id = p_from_teacher_id),
    jsonb_build_object('to_teacher_id', p_to_teacher_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at));
  return v_swap;
end;
$$;

-- Removes a time off / extra time (and the other half of a swap).
create or replace function public.delete_roster_change(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_roster_changes%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change working hours.' using errcode = '42501';
  end if;
  select * into v_row from public.staff_roster_changes where id = p_id;
  if not found then
    return;
  end if;
  delete from public.staff_roster_changes
  where id = p_id or (v_row.swap_id is not null and swap_id = v_row.swap_id);
  perform public.record_admin_activity('roster_change_removed', 'teacher', v_row.teacher_id,
    (select full_name from public.teachers where id = v_row.teacher_id),
    jsonb_build_object('starts_at', v_row.starts_at, 'ends_at', v_row.ends_at, 'change', v_row.change, 'swap', v_row.swap_id is not null));
end;
$$;

-- The school's opening hours: {"days": {"1": [{"start": "09:00", "end": "18:00"}], ...}, "time_zone": "Asia/Kuala_Lumpur"}.
-- An empty "days" means the whole day counts.
create or replace function public.set_business_hours(p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('class_settings', 'edit') then
    raise exception 'Your account is not allowed to change Class Settings.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_value) <> 'object'
    or (p_value ? 'days' and jsonb_typeof(p_value -> 'days') <> 'object')
    or exists (
      select 1 from jsonb_each(coalesce(p_value -> 'days', '{}'::jsonb)) d
      where d.key !~ '^[0-6]$' or jsonb_typeof(d.value) <> 'array'
        or exists (
          select 1 from jsonb_array_elements(d.value) s
          where coalesce(s ->> 'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            or coalesce(s ->> 'end', '') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
            or ((s ->> 'end') <> '24:00' and (s ->> 'end')::time <= (s ->> 'start')::time)
        )
    )
    or (p_value ? 'time_zone' and not exists (select 1 from pg_timezone_names where name = p_value ->> 'time_zone')) then
    raise exception 'These opening hours are not valid.' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('business_hours', p_value, now(), public.current_teacher_id())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
end;
$$;

-- The kinds of time off the school uses (white-label): ["Annual leave", "Sick leave", ...].
create or replace function public.set_leave_reasons(p_reasons jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('class_settings', 'edit') then
    raise exception 'Your account is not allowed to change Class Settings.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_reasons) <> 'array' or jsonb_array_length(p_reasons) > 30 or exists (
    select 1 from jsonb_array_elements(p_reasons) r
    where jsonb_typeof(r) <> 'string' or char_length(btrim(r #>> '{}')) not between 1 and 60
  ) then
    raise exception 'Each kind of time off needs a name of up to 60 letters.' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('leave_reasons', p_reasons, now(), public.current_teacher_id())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
end;
$$;

-- Mirai's starting list (a school changes it in Class Settings).
insert into public.app_settings (key, value)
values ('leave_reasons', '["Annual leave", "Sick leave", "Off day", "Swap"]'::jsonb)
on conflict (key) do nothing;

revoke all on function public.school_time_zone() from public, anon;
revoke all on function public.save_staff_week(bigint, jsonb, date) from public, anon;
revoke all on function public.add_roster_change(bigint, timestamptz, timestamptz, text, text, text) from public, anon;
revoke all on function public.add_shift_swap(bigint, bigint, timestamptz, timestamptz, text, text) from public, anon;
revoke all on function public.delete_roster_change(bigint) from public, anon;
revoke all on function public.set_business_hours(jsonb) from public, anon;
revoke all on function public.set_leave_reasons(jsonb) from public, anon;
grant execute on function public.school_time_zone() to authenticated;
grant execute on function public.save_staff_week(bigint, jsonb, date) to authenticated;
grant execute on function public.add_roster_change(bigint, timestamptz, timestamptz, text, text, text) to authenticated;
grant execute on function public.add_shift_swap(bigint, bigint, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.delete_roster_change(bigint) to authenticated;
grant execute on function public.set_business_hours(jsonb) to authenticated;
grant execute on function public.set_leave_reasons(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3. How many seconds of a stretch of time someone was working.
-- ---------------------------------------------------------------------------------------------------------

-- p_teacher_id null: the school's opening hours (messages typed on the phone, the automatic sender).
create or replace function public.duty_seconds(p_teacher_id bigint, p_from timestamptz, p_to timestamptz)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text := public.school_time_zone();
  v_hours jsonb := (select s.value -> 'days' from public.app_settings s where s.key = 'business_hours');
  v_on tstzmultirange;
  v_off tstzmultirange;
  v_duty tstzmultirange;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    return 0;
  end if;
  if v_hours is not null and v_hours = '{}'::jsonb then
    v_hours := null;
  end if;

  with days as (
    select g::date as d
    from generate_series((p_from at time zone v_tz)::date, (p_to at time zone v_tz)::date, interval '1 day') g
  ),
  scheduled as (
    -- The days this person has a week for (any weekday of a week valid that day).
    select d.d from days d
    where p_teacher_id is not null and exists (
      select 1 from public.staff_shifts s
      where s.teacher_id = p_teacher_id and s.effective_from <= d.d and (s.effective_to is null or s.effective_to >= d.d)
    )
  ),
  ranges as (
    -- Their week on the days that have one.
    select tstzrange((sd.d + s.start_time) at time zone v_tz, (sd.d + s.end_time) at time zone v_tz) as r
    from scheduled sd
    join public.staff_shifts s
      on s.teacher_id = p_teacher_id and s.weekday = extract(dow from sd.d)
     and s.effective_from <= sd.d and (s.effective_to is null or s.effective_to >= sd.d)
    union all
    -- The opening hours on the other days.
    select tstzrange(
      (d.d + (h ->> 'start')::time) at time zone v_tz,
      case when h ->> 'end' = '24:00' then (d.d + 1)::timestamp at time zone v_tz else (d.d + (h ->> 'end')::time) at time zone v_tz end
    )
    from days d
    cross join lateral jsonb_array_elements(coalesce(v_hours -> extract(dow from d.d)::int::text, '[]'::jsonb)) h
    where v_hours is not null and d.d not in (select sd.d from scheduled sd)
    union all
    -- No opening hours set: the whole of the other days.
    select tstzrange(d.d::timestamp at time zone v_tz, (d.d + 1)::timestamp at time zone v_tz)
    from days d
    where v_hours is null and d.d not in (select sd.d from scheduled sd)
    union all
    -- Extra time.
    select tstzrange(c.starts_at, c.ends_at)
    from public.staff_roster_changes c
    where p_teacher_id is not null and c.teacher_id = p_teacher_id and c.change = 'extra'
      and c.starts_at < p_to and c.ends_at > p_from
  )
  select range_agg(r) into v_on from ranges where not isempty(r);

  select range_agg(tstzrange(c.starts_at, c.ends_at)) into v_off
  from public.staff_roster_changes c
  where p_teacher_id is not null and c.teacher_id = p_teacher_id and c.change = 'off'
    and c.starts_at < p_to and c.ends_at > p_from;

  v_duty := (coalesce(v_on, '{}'::tstzmultirange) * tstzmultirange(tstzrange(p_from, p_to)))
    - coalesce(v_off, '{}'::tstzmultirange);

  return coalesce((
    select sum(floor(extract(epoch from upper(x)) - extract(epoch from lower(x))))::integer
    from unnest(v_duty) x
  ), 0);
end;
$$;

revoke all on function public.duty_seconds(bigint, timestamptz, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 4. Team Replies: the working-time waits beside the clock waits.
-- ---------------------------------------------------------------------------------------------------------

alter table public.team_reply_days
  add column duty_waits integer[] not null default '{}',
  add column duty_within_target integer not null default 0 check (duty_within_target >= 0),
  add column duty_slowest integer;

comment on column public.team_reply_days.duty_waits is
  'Seconds of each wait in which the person who answered was working (staff_shifts, time off, opening hours).';

-- Nobody has a week, opening hours or time off yet, so working time is the whole clock: the same numbers.
update public.team_reply_days
set duty_waits = waits, duty_within_target = within_target, duty_slowest = slowest;

drop function if exists public.team_reply_today();
drop function if exists public.team_reply_rows(timestamptz, timestamptz);

-- Same as 20261024810000 plus the duty columns.
create function public.team_reply_rows(p_from timestamptz, p_to timestamptz)
returns table (
  day date,
  replier text,
  staff_id bigint,
  replies integer,
  chat_ids bigint[],
  waits integer[],
  within_target integer,
  slowest integer,
  duty_waits integer[],
  duty_within_target integer,
  duty_slowest integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with answered_chats as (
    select distinct m.conversation_id
    from public.inbox_messages m
    where m.created_at >= p_from and m.created_at < p_to
      and m.message_type = 1 and not m.private and not m.deleted
  ),
  counted as (
    select
      m.conversation_id,
      m.id,
      floor(extract(epoch from m.created_at))::bigint as at_second,
      m.message_type,
      m.sender_kind,
      m.staff_id,
      coalesce(sum(case when m.message_type = 1 then 1 else 0 end) over (
        partition by m.conversation_id
        order by date_trunc('second', m.created_at), m.id
        rows between unbounded preceding and 1 preceding
      ), 0) as grp
    from public.inbox_messages m
    join answered_chats c on c.conversation_id = m.conversation_id
    where m.created_at < p_to and not m.private and not m.deleted and m.message_type in (0, 1)
  ),
  waited as (
    select
      c.*,
      min(c.at_second) filter (where c.message_type = 0) over (partition by c.conversation_id, c.grp) as waiting_from
    from counted c
  ),
  ours as (
    select
      (to_timestamp(w.at_second) at time zone 'Asia/Kuala_Lumpur')::date as day,
      case
        when w.sender_kind = 'staff' and w.staff_id > 0 then 'staff:' || w.staff_id
        when w.sender_kind = 'automation' then 'automation'
        else 'phone'
      end as replier,
      case when w.sender_kind = 'staff' and w.staff_id > 0 then w.staff_id end as staff_id,
      w.conversation_id,
      case when w.waiting_from is not null then greatest(0, w.at_second - w.waiting_from)::integer end as wait,
      case when w.waiting_from is not null then public.duty_seconds(
        case when w.sender_kind = 'staff' and w.staff_id > 0 then w.staff_id end,
        to_timestamp(w.waiting_from),
        to_timestamp(greatest(w.at_second, w.waiting_from))
      ) end as duty_wait
    from waited w
    where w.message_type = 1
      and w.at_second >= floor(extract(epoch from p_from))
      and w.at_second < floor(extract(epoch from p_to))
  )
  select
    o.day,
    o.replier,
    max(o.staff_id),
    count(*)::integer,
    array_agg(distinct o.conversation_id order by o.conversation_id),
    coalesce(array_agg(o.wait order by o.wait) filter (where o.wait is not null), '{}'),
    (count(*) filter (where o.wait <= 1800))::integer,
    max(o.wait),
    coalesce(array_agg(o.duty_wait order by o.duty_wait) filter (where o.duty_wait is not null), '{}'),
    (count(*) filter (where o.duty_wait <= 1800))::integer,
    max(o.duty_wait)
  from ours o
  group by o.day, o.replier;
$$;

revoke all on function public.team_reply_rows(timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.team_reply_compute_day(p_day date, p_source text default 'manual')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := (p_day::timestamp at time zone 'Asia/Kuala_Lumpur');
  v_to timestamptz := ((p_day + 1)::timestamp at time zone 'Asia/Kuala_Lumpur');
  v_count integer;
begin
  if p_day is null or p_day >= (now() at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Only a finished day can be kept.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('team_reply_day'), (p_day - date '2000-01-01'));

  delete from public.team_reply_days where day = p_day;

  insert into public.team_reply_days (day, replier, staff_id, replies, chat_ids, waits, within_target, slowest,
    duty_waits, duty_within_target, duty_slowest, computed_at)
  select r.day, r.replier, r.staff_id, r.replies, r.chat_ids, r.waits, r.within_target, r.slowest,
    r.duty_waits, r.duty_within_target, r.duty_slowest, now()
  from public.team_reply_rows(v_from, v_to) r
  where r.day = p_day;
  get diagnostics v_count = row_count;

  insert into public.team_reply_day_runs (day, computed_at, source, chats_read, replies)
  select
    p_day,
    now(),
    coalesce(p_source, 'manual'),
    (select count(distinct x) from public.team_reply_days d, unnest(d.chat_ids) x where d.day = p_day)::integer,
    (select coalesce(sum(d.replies), 0) from public.team_reply_days d where d.day = p_day)::integer
  on conflict (day) do update
    set computed_at = excluded.computed_at,
        source = excluded.source,
        chats_read = excluded.chats_read,
        replies = excluded.replies;

  return v_count;
end;
$$;

revoke all on function public.team_reply_compute_day(date, text) from public, anon, authenticated;

create function public.team_reply_today()
returns table (
  day date,
  replier text,
  staff_id bigint,
  replies integer,
  chat_ids bigint[],
  waits integer[],
  within_target integer,
  slowest integer,
  duty_waits integer[],
  duty_within_target integer,
  duty_slowest integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
  from public.team_reply_rows(
    ((now() at time zone 'Asia/Kuala_Lumpur')::date)::timestamp at time zone 'Asia/Kuala_Lumpur',
    now() + interval '1 minute'
  ) r
  where public.in_scope(
    (select public.permission_scope('team_replies', 'view')),
    r.staff_id = (select public.current_teacher_id()),
    false
  );
$$;

revoke all on function public.team_reply_today() from public, anon;
grant execute on function public.team_reply_today() to authenticated;

-- Does anyone have a week or does the school have opening hours? (The page then counts working time first.)
create or replace function public.team_hours_in_use()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff_shifts)
    or exists (select 1 from public.app_settings s where s.key = 'business_hours' and coalesce(s.value -> 'days', '{}'::jsonb) <> '{}'::jsonb)
    or exists (select 1 from public.staff_roster_changes);
$$;

revoke all on function public.team_hours_in_use() from public, anon;
grant execute on function public.team_hours_in_use() to authenticated;
