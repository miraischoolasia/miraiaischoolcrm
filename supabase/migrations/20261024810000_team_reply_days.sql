-- Team replies: how each person answers the chats, worked out in the database from the inbox copy
-- (inbox_messages, 20261024800000) and kept one school day at a time (Malaysia time), so the Team Replies
-- page adds kept days together instead of reading every chat again.
--
-- One row per day and replier: a person ('staff:<id>'), the automatic sender ('automation') or a message
-- typed on the phone ('phone'). Every single wait is kept (waits), so the middle wait of 7 or 30 days is
-- found from all of them, not from the middles of each day. No message text is kept here.
--
-- The rules are the same as supabase/functions/team-replies/logic.ts (the page's own copy, tested against
-- this function in supabase/tests/inbox_copy_and_team_replies.sql):
--   * a reply is a message of ours (message_type 1), not a private note, not deleted;
--   * a parent waits from their FIRST message nobody has answered yet until our next message, and that wait
--     belongs to whoever sent that message, on the day it was sent;
--   * times count in whole seconds, as Chatwoot's own screens do.
--
-- A new permission tick "Team Replies" (view only) decides who sees the page; an admin always does.
-- The nightly job is NOT made here (see supabase/manual/team_replies_cron.sql): it is set up on its own,
-- after this has been checked on the live database.

-- 1. The new tick. Same rules as before, plus 'team_replies', which like the Activity Log is view only.
create or replace function public.valid_account_permissions(p jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(p) = 'object' and not exists (
    select 1
    from jsonb_each(p) as e(module, value)
    where e.module not in ('calendar', 'classrooms', 'students', 'leads', 'forms', 'activity', 'team_replies')
      or jsonb_typeof(e.value) <> 'object'
      or coalesce(e.value ->> 'level', '') not in ('view', 'edit')
      or (e.value ? 'delete' and jsonb_typeof(e.value -> 'delete') <> 'boolean')
      or (e.value -> 'delete' = 'true'::jsonb and e.value ->> 'level' <> 'edit')
      or (e.module in ('activity', 'team_replies') and (e.value ->> 'level' <> 'view' or e.value -> 'delete' = 'true'::jsonb))
  );
$$;

-- 2. The kept days.
create table public.team_reply_days (
  day date not null,
  replier text not null check (replier ~ '^(staff:[1-9][0-9]*|automation|phone)$'),
  staff_id bigint,
  replies integer not null default 0 check (replies >= 0),
  -- The chats answered that day (Chatwoot conversation numbers), so a chat answered on several days counts once.
  chat_ids bigint[] not null default '{}',
  -- Seconds each parent waited for the first answer, one entry per answer.
  waits integer[] not null default '{}',
  within_target integer not null default 0 check (within_target >= 0),
  slowest integer,
  computed_at timestamptz not null default now(),
  primary key (day, replier)
);

comment on table public.team_reply_days is
  'Team Replies page: one Malaysian day per replier, worked out from inbox_messages. No message text.';

-- Which days have been worked out (a quiet day has no replier rows but is still done).
create table public.team_reply_day_runs (
  day date primary key,
  computed_at timestamptz not null default now(),
  -- 'daily' from the nightly job, 'backfill' from "Work out the days", 'manual' for one day.
  source text not null check (source in ('daily', 'backfill', 'manual')),
  chats_read integer not null default 0,
  replies integer not null default 0
);

alter table public.team_reply_days enable row level security;
alter table public.team_reply_day_runs enable row level security;

create policy "Team replies tick reads the kept days"
  on public.team_reply_days for select to authenticated
  using ((select public.has_permission('team_replies', 'view')));

create policy "Team replies tick reads which days are done"
  on public.team_reply_day_runs for select to authenticated
  using ((select public.has_permission('team_replies', 'view')));

revoke all on public.team_reply_days, public.team_reply_day_runs from anon;
revoke insert, update, delete on public.team_reply_days, public.team_reply_day_runs from authenticated;

-- 3. The work of a period [p_from, p_to), one row per Malaysian day and replier. Not kept: the callers keep it.
create or replace function public.team_reply_rows(p_from timestamptz, p_to timestamptz)
returns table (
  day date,
  replier text,
  staff_id bigint,
  replies integer,
  chat_ids bigint[],
  waits integer[],
  within_target integer,
  slowest integer
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
    -- Every message of those chats up to the end of the period, in order. grp numbers the stretches
    -- between our messages: a message of ours closes the stretch of parent messages before it.
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
    -- The first parent message of the stretch is where the wait began.
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
      case when w.waiting_from is not null then greatest(0, w.at_second - w.waiting_from)::integer end as wait
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
    max(o.wait)
  from ours o
  group by o.day, o.replier;
$$;

revoke all on function public.team_reply_rows(timestamptz, timestamptz) from public, anon, authenticated;

-- 4. Keeping one day: its rows are replaced as a whole, so working a day out again (late messages,
-- "Work out the days" pressed twice) gives the same result. Two at once wait for each other.
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

  insert into public.team_reply_days (day, replier, staff_id, replies, chat_ids, waits, within_target, slowest, computed_at)
  select r.day, r.replier, r.staff_id, r.replies, r.chat_ids, r.waits, r.within_target, r.slowest, now()
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

-- 5. What the nightly job runs (00:15 Malaysia time): yesterday, and the day before again for messages
-- that arrived late; then the copy's own check for chats that fell behind.
create or replace function public.team_reply_nightly()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  perform public.team_reply_compute_day(v_today - 2, 'daily');
  perform public.team_reply_compute_day(v_today - 1, 'daily');
  perform public.inbox_copy_check();
end;
$$;

revoke all on function public.team_reply_nightly() from public, anon, authenticated;

-- 6. "Work out the days" on the page (an admin, after "Copy old chats"): up to 62 days a call, so the
-- page can show how far it has got. Days already kept are simply worked out again.
create or replace function public.team_reply_compute_range(p_first date, p_last date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date;
  v_last date := least(p_last, (now() at time zone 'Asia/Kuala_Lumpur')::date - 1);
  v_done integer := 0;
begin
  if not (select public.is_admin()) then
    raise exception 'Only an admin can work out the days.' using errcode = '42501';
  end if;
  if p_first is null or v_last is null or p_first > v_last then
    return 0;
  end if;
  if v_last - p_first > 61 then
    raise exception 'At most 62 days at a time.' using errcode = '22023';
  end if;
  v_day := p_first;
  while v_day <= v_last loop
    perform public.team_reply_compute_day(v_day, 'backfill');
    v_done := v_done + 1;
    v_day := v_day + 1;
  end loop;
  return v_done;
end;
$$;

revoke all on function public.team_reply_compute_range(date, date) from public, anon;
grant execute on function public.team_reply_compute_range(date, date) to authenticated;

-- 7. Today, worked out on the spot (today is never kept: it is not over).
create or replace function public.team_reply_today()
returns table (
  day date,
  replier text,
  staff_id bigint,
  replies integer,
  chat_ids bigint[],
  waits integer[],
  within_target integer,
  slowest integer
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
  where (select public.has_permission('team_replies', 'view'));
$$;

revoke all on function public.team_reply_today() from public, anon;
grant execute on function public.team_reply_today() to authenticated;
