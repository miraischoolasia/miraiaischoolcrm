-- Team replies by channel: every channel (one Chatwoot inbox: a WhatsApp number, a Messenger Page, an
-- Instagram account) counted on its own, day by day, and which channels each person answered.
-- Needs 20261024810000_team_reply_days, 20261026010000_permission_scopes and 20261026030000_staff_hours.
--
-- What is added
--   1. inbox_chat_done: when a chat was marked Done (resolved). The copy only knew a chat's status right now,
--      so from here on every change to Done is written down as it reaches the copy. Chats already Done when
--      this runs get one entry at their last message (all the copy knows of them).
--   2. team_reply_days gains the channel (inbox_id, part of the key now) and the chats each replier marked
--      Done that day (done_chat_ids: a Done counts for the last of our messages before it).
--   3. team_channel_days: per day and channel, the parents' messages and chats, the chats answered, the
--      chats marked Done and each chat's first wait of the day (clock and working time).
--   4. team_reply_rows / team_reply_today / team_reply_compute_day again, with the channel; new
--      team_channel_rows / team_channel_today.
--   5. Every day already kept is worked out again, so it is split by channel at once.
--
-- The rules of 20261024810000 do not change: a reply is a message of ours (message_type 1), not a private
-- note, not deleted; a parent waits from their FIRST unanswered message until our next message, and that
-- wait belongs to whoever sent that message, on the day it was sent; days are Malaysian days.
--
-- Channel numbers (the whole team's) are for whoever sees everybody's Team Replies (scope 'all'); someone
-- who sees only their own rows still sees their own rows split by channel.

-- ---------------------------------------------------------------------------------------------------------
-- 1. When a chat was marked Done.
-- ---------------------------------------------------------------------------------------------------------

create table public.inbox_chat_done (
  id bigint generated always as identity primary key,
  conversation_id bigint not null,
  inbox_id bigint,
  done_at timestamptz not null default now(),
  -- live: the copy saw the chat turn Done; copy: a chat first copied in already Done (time = its last
  -- message); seed: already Done when this was made (time = its last message).
  source text not null check (source in ('live', 'copy', 'seed'))
);

create index inbox_chat_done_at_idx on public.inbox_chat_done (done_at);
create index inbox_chat_done_chat_idx on public.inbox_chat_done (conversation_id, done_at);

comment on table public.inbox_chat_done is
  'When each chat was marked Done (resolved), written as the inbox copy sees it change. Read by Team Replies.';

alter table public.inbox_chat_done enable row level security;
-- Nobody reads it directly: the Team Replies functions do.
revoke all on public.inbox_chat_done from anon, authenticated;

create or replace function public.inbox_chat_done_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'resolved' and (tg_op = 'INSERT' or old.status is distinct from 'resolved') then
    insert into public.inbox_chat_done (conversation_id, inbox_id, done_at, source)
    values (
      new.conversation_id,
      new.inbox_id,
      case when tg_op = 'INSERT' then least(now(), coalesce(new.last_activity_at, now())) else now() end,
      case when tg_op = 'INSERT' then 'copy' else 'live' end
    );
  end if;
  return null;
end;
$$;

revoke all on function public.inbox_chat_done_log() from public, anon, authenticated;

create trigger inbox_chats_done_log
after insert or update of status on public.inbox_chats
for each row execute function public.inbox_chat_done_log();

insert into public.inbox_chat_done (conversation_id, inbox_id, done_at, source)
select c.conversation_id, c.inbox_id, coalesce(c.last_activity_at, c.updated_at), 'seed'
from public.inbox_chats c
where c.status = 'resolved';

-- ---------------------------------------------------------------------------------------------------------
-- 2. The kept days get the channel.
-- ---------------------------------------------------------------------------------------------------------

alter table public.team_reply_days
  add column inbox_id bigint not null default 0,
  add column done_chat_ids bigint[] not null default '{}';

comment on column public.team_reply_days.inbox_id is
  'The Chatwoot inbox (channel) of these replies; 0 when the copy does not know it.';
comment on column public.team_reply_days.done_chat_ids is
  'Chats marked Done that day whose last message of ours before Done was this replier''s.';

alter table public.team_reply_days drop constraint team_reply_days_pkey;
alter table public.team_reply_days add primary key (day, replier, inbox_id);

-- ---------------------------------------------------------------------------------------------------------
-- 3. One row per day and channel.
-- ---------------------------------------------------------------------------------------------------------

create table public.team_channel_days (
  day date not null,
  inbox_id bigint not null default 0,
  -- Messages from parents (not private, not deleted).
  incoming_messages integer not null default 0 check (incoming_messages >= 0),
  -- Chats with at least one message from the parent that day.
  incoming_chat_ids bigint[] not null default '{}',
  -- Of those, the chats where we answered after the parent's last message of the day, the same day.
  replied_chat_ids bigint[] not null default '{}',
  -- Chats marked Done that day.
  done_chat_ids bigint[] not null default '{}',
  -- Each chat's first answer of the day to a waiting parent: seconds waited, and the same counting only the
  -- working time of whoever answered.
  first_waits integer[] not null default '{}',
  duty_first_waits integer[] not null default '{}',
  computed_at timestamptz not null default now(),
  primary key (day, inbox_id)
);

comment on table public.team_channel_days is
  'Team Replies page: one Malaysian day per channel (Chatwoot inbox), worked out from inbox_messages. No message text.';

alter table public.team_channel_days enable row level security;

create policy "Team replies tick for everybody reads the channel days"
  on public.team_channel_days for select to authenticated
  using (public.in_scope((select public.permission_scope('team_replies', 'view')), false, false));

revoke all on public.team_channel_days from anon;
revoke insert, update, delete on public.team_channel_days from authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 4. The working out.
-- ---------------------------------------------------------------------------------------------------------

-- Every message of ours sent in [p_from, p_to), with where the parent's wait began (null: nobody was waiting).
create or replace function public.team_reply_answers(p_from timestamptz, p_to timestamptz)
returns table (
  day date,
  inbox_id bigint,
  conversation_id bigint,
  message_id bigint,
  at_second bigint,
  waiting_from bigint,
  replier text,
  staff_id bigint
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
      m.inbox_id,
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
  )
  select
    (to_timestamp(w.at_second) at time zone 'Asia/Kuala_Lumpur')::date,
    coalesce(w.inbox_id, 0),
    w.conversation_id,
    w.id,
    w.at_second,
    w.waiting_from,
    case
      when w.sender_kind = 'staff' and w.staff_id > 0 then 'staff:' || w.staff_id
      when w.sender_kind = 'automation' then 'automation'
      else 'phone'
    end,
    case when w.sender_kind = 'staff' and w.staff_id > 0 then w.staff_id end
  from waited w
  where w.message_type = 1
    and w.at_second >= floor(extract(epoch from p_from))
    and w.at_second < floor(extract(epoch from p_to));
$$;

revoke all on function public.team_reply_answers(timestamptz, timestamptz) from public, anon, authenticated;

-- The chats marked Done in [p_from, p_to), once per chat and day, with whose message of ours came last before
-- Done (replier null: we never wrote in that chat).
create or replace function public.team_reply_done(p_from timestamptz, p_to timestamptz)
returns table (
  day date,
  inbox_id bigint,
  conversation_id bigint,
  replier text,
  staff_id bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (d.conversation_id, (d.done_at at time zone 'Asia/Kuala_Lumpur')::date)
    (d.done_at at time zone 'Asia/Kuala_Lumpur')::date,
    coalesce(d.inbox_id, c.inbox_id, 0),
    d.conversation_id,
    last.replier,
    last.staff_id
  from public.inbox_chat_done d
  left join public.inbox_chats c on c.conversation_id = d.conversation_id
  left join lateral (
    select
      case
        when m.sender_kind = 'staff' and m.staff_id > 0 then 'staff:' || m.staff_id
        when m.sender_kind = 'automation' then 'automation'
        else 'phone'
      end as replier,
      case when m.sender_kind = 'staff' and m.staff_id > 0 then m.staff_id end as staff_id
    from public.inbox_messages m
    where m.conversation_id = d.conversation_id
      and m.message_type = 1 and not m.private and not m.deleted
      and m.created_at <= d.done_at
    order by m.created_at desc, m.id desc
    limit 1
  ) last on true
  where d.done_at >= p_from and d.done_at < p_to
  order by d.conversation_id, (d.done_at at time zone 'Asia/Kuala_Lumpur')::date, d.done_at desc;
$$;

revoke all on function public.team_reply_done(timestamptz, timestamptz) from public, anon, authenticated;

drop function if exists public.team_reply_today();
drop function if exists public.team_reply_rows(timestamptz, timestamptz);

-- Same as 20261026030000 with the channel, and the chats each replier marked Done (columns added at the end).
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
  duty_slowest integer,
  inbox_id bigint,
  done_chat_ids bigint[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with ours as (
    select
      a.day,
      a.inbox_id,
      a.replier,
      a.staff_id,
      a.conversation_id,
      case when a.waiting_from is not null then greatest(0, a.at_second - a.waiting_from)::integer end as wait,
      case when a.waiting_from is not null then public.duty_seconds(
        a.staff_id,
        to_timestamp(a.waiting_from),
        to_timestamp(greatest(a.at_second, a.waiting_from))
      ) end as duty_wait
    from public.team_reply_answers(p_from, p_to) a
  ),
  worked as (
    select
      o.day,
      o.replier,
      o.inbox_id,
      max(o.staff_id) as staff_id,
      count(*)::integer as replies,
      array_agg(distinct o.conversation_id order by o.conversation_id) as chat_ids,
      coalesce(array_agg(o.wait order by o.wait) filter (where o.wait is not null), '{}') as waits,
      (count(*) filter (where o.wait <= 1800))::integer as within_target,
      max(o.wait) as slowest,
      coalesce(array_agg(o.duty_wait order by o.duty_wait) filter (where o.duty_wait is not null), '{}') as duty_waits,
      (count(*) filter (where o.duty_wait <= 1800))::integer as duty_within_target,
      max(o.duty_wait) as duty_slowest
    from ours o
    group by o.day, o.replier, o.inbox_id
  ),
  done as (
    select
      d.day,
      d.replier,
      d.inbox_id,
      max(d.staff_id) as staff_id,
      array_agg(distinct d.conversation_id order by d.conversation_id) as done_chat_ids
    from public.team_reply_done(p_from, p_to) d
    where d.replier is not null
    group by d.day, d.replier, d.inbox_id
  )
  select
    coalesce(w.day, d.day),
    coalesce(w.replier, d.replier),
    coalesce(w.staff_id, d.staff_id),
    coalesce(w.replies, 0),
    coalesce(w.chat_ids, '{}'),
    coalesce(w.waits, '{}'),
    coalesce(w.within_target, 0),
    w.slowest,
    coalesce(w.duty_waits, '{}'),
    coalesce(w.duty_within_target, 0),
    w.duty_slowest,
    coalesce(w.inbox_id, d.inbox_id),
    coalesce(d.done_chat_ids, '{}')
  from worked w
  full join done d on d.day = w.day and d.replier = w.replier and d.inbox_id = w.inbox_id;
$$;

revoke all on function public.team_reply_rows(timestamptz, timestamptz) from public, anon, authenticated;

-- Per day and channel in [p_from, p_to).
create or replace function public.team_channel_rows(p_from timestamptz, p_to timestamptz)
returns table (
  day date,
  inbox_id bigint,
  incoming_messages integer,
  incoming_chat_ids bigint[],
  replied_chat_ids bigint[],
  done_chat_ids bigint[],
  first_waits integer[],
  duty_first_waits integer[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with incoming as (
    -- Each chat's messages from the parent that day, and the last of them.
    select
      (m.created_at at time zone 'Asia/Kuala_Lumpur')::date as day,
      coalesce(m.inbox_id, 0) as inbox_id,
      m.conversation_id,
      count(*)::integer as messages,
      max(m.created_at) as last_at
    from public.inbox_messages m
    where m.created_at >= p_from and m.created_at < p_to
      and m.message_type = 0 and not m.private and not m.deleted
    group by 1, 2, 3
  ),
  incoming_days as (
    select
      i.day,
      i.inbox_id,
      sum(i.messages)::integer as messages,
      array_agg(i.conversation_id order by i.conversation_id) as chat_ids,
      coalesce(array_agg(i.conversation_id order by i.conversation_id) filter (where exists (
        select 1
        from public.inbox_messages r
        where r.conversation_id = i.conversation_id
          and r.message_type = 1 and not r.private and not r.deleted
          and r.created_at > i.last_at
          and r.created_at < least(p_to, ((i.day + 1)::timestamp at time zone 'Asia/Kuala_Lumpur'))
      )), '{}') as replied_ids
    from incoming i
    group by i.day, i.inbox_id
  ),
  first_answers as (
    -- Each chat's first answer of the day to a waiting parent.
    select distinct on (a.conversation_id, a.day)
      a.day, a.inbox_id, a.staff_id, a.at_second, a.waiting_from
    from public.team_reply_answers(p_from, p_to) a
    where a.waiting_from is not null
    order by a.conversation_id, a.day, a.at_second, a.message_id
  ),
  first_days as (
    select
      f.day,
      f.inbox_id,
      array_agg(greatest(0, f.at_second - f.waiting_from)::integer order by greatest(0, f.at_second - f.waiting_from)) as waits,
      array_agg(f.duty order by f.duty) as duty_waits
    from (
      select
        f.*,
        public.duty_seconds(f.staff_id, to_timestamp(f.waiting_from), to_timestamp(greatest(f.at_second, f.waiting_from))) as duty
      from first_answers f
    ) f
    group by f.day, f.inbox_id
  ),
  done_days as (
    select d.day, d.inbox_id, array_agg(distinct d.conversation_id order by d.conversation_id) as chat_ids
    from public.team_reply_done(p_from, p_to) d
    group by d.day, d.inbox_id
  ),
  keys as (
    select k.day, k.inbox_id from incoming_days k
    union
    select k.day, k.inbox_id from first_days k
    union
    select k.day, k.inbox_id from done_days k
  )
  select
    k.day,
    k.inbox_id,
    coalesce(i.messages, 0),
    coalesce(i.chat_ids, '{}'),
    coalesce(i.replied_ids, '{}'),
    coalesce(d.chat_ids, '{}'),
    coalesce(f.waits, '{}'),
    coalesce(f.duty_waits, '{}')
  from keys k
  left join incoming_days i on i.day = k.day and i.inbox_id = k.inbox_id
  left join first_days f on f.day = k.day and f.inbox_id = k.inbox_id
  left join done_days d on d.day = k.day and d.inbox_id = k.inbox_id;
$$;

revoke all on function public.team_channel_rows(timestamptz, timestamptz) from public, anon, authenticated;

-- Keeping one day: both tables' rows of that day are replaced as a whole.
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
    duty_waits, duty_within_target, duty_slowest, inbox_id, done_chat_ids, computed_at)
  select r.day, r.replier, r.staff_id, r.replies, r.chat_ids, r.waits, r.within_target, r.slowest,
    r.duty_waits, r.duty_within_target, r.duty_slowest, r.inbox_id, r.done_chat_ids, now()
  from public.team_reply_rows(v_from, v_to) r
  where r.day = p_day;
  get diagnostics v_count = row_count;

  delete from public.team_channel_days where day = p_day;

  insert into public.team_channel_days (day, inbox_id, incoming_messages, incoming_chat_ids, replied_chat_ids,
    done_chat_ids, first_waits, duty_first_waits, computed_at)
  select r.day, r.inbox_id, r.incoming_messages, r.incoming_chat_ids, r.replied_chat_ids,
    r.done_chat_ids, r.first_waits, r.duty_first_waits, now()
  from public.team_channel_rows(v_from, v_to) r
  where r.day = p_day;

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

-- Today, worked out on the spot (same scope rule as 20261026030000).
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
  duty_slowest integer,
  inbox_id bigint,
  done_chat_ids bigint[]
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

-- Today's channel numbers, for whoever sees everybody's Team Replies.
create or replace function public.team_channel_today()
returns table (
  day date,
  inbox_id bigint,
  incoming_messages integer,
  incoming_chat_ids bigint[],
  replied_chat_ids bigint[],
  done_chat_ids bigint[],
  first_waits integer[],
  duty_first_waits integer[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
  from public.team_channel_rows(
    ((now() at time zone 'Asia/Kuala_Lumpur')::date)::timestamp at time zone 'Asia/Kuala_Lumpur',
    now() + interval '1 minute'
  ) r
  where public.in_scope((select public.permission_scope('team_replies', 'view')), false, false);
$$;

revoke all on function public.team_channel_today() from public, anon;
grant execute on function public.team_channel_today() to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 5. The days already kept, worked out again with the channel.
-- ---------------------------------------------------------------------------------------------------------

do $$
declare
  v_run record;
begin
  for v_run in select r.day, r.source from public.team_reply_day_runs r order by r.day loop
    perform public.team_reply_compute_day(v_run.day, v_run.source);
  end loop;
end;
$$;
