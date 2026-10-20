-- Recording access by age group x subject x month, apart from classes (boss, 2026-10-20).
--
-- With month access on (app_settings 'class_videos'.month_access, EduHero), a
-- student watches a month of recordings when staff ticked that month for the
-- age group and subject of the class the video belongs to - whichever class or
-- teacher it is, and whether or not the student is in that class. A class with
-- no subject is ticked as itself (class grant). With month access off (Mirai)
-- nothing changes: the student's own classes show all their videos.
--
-- 1. student_video_grants, filled from today's student_video_access (13k rows on
--    EduHero: class x month -> age group x subject x month), so every child still
--    sees what they saw. student_video_access stays, unused, for going back.
--    The topic is the class's subject when this runs: on EduHero the 双语班 and
--    备战班 classes already have subjects of their own (SCI 双语, SEJ备战班,
--    GEO备战班; changed in the data 2026-10-20), so their months stay apart
--    from the normal class of that subject.
-- 2. Only staff ticks months (staff who may edit students; never a teacher login),
--    one student or many at once. Nothing is opened by itself.
-- 3. When a child leaves a class (its place ends or is removed), their months of
--    that class's age group x subject close from the leaving day - unless they are
--    still in another class of the same age group and subject (a move between
--    teachers). Other age groups or subjects ticked by staff stay as they are.

-- ---------------------------------------------------------------------------
-- 1. The grants

create table public.student_video_grants (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students (id) on delete cascade,
  age_group text references public.age_groups (name) on update cascade,
  subject_id bigint references public.subjects (id) on delete cascade,
  classroom_id bigint references public.classrooms (id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  starts_on date,
  ends_on date,
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  check (
    (classroom_id is null and age_group is not null and subject_id is not null)
    or (classroom_id is not null and age_group is null and subject_id is null)
  ),
  check (starts_on is null or ends_on is null or starts_on <= ends_on)
);

create unique index student_video_grants_key on public.student_video_grants
  (student_id, coalesce(classroom_id, 0), coalesce(age_group, ''), coalesce(subject_id, 0), year, month);
create index student_video_grants_topic_idx on public.student_video_grants (age_group, subject_id, year, month);
create index student_video_grants_class_idx on public.student_video_grants (classroom_id, year, month) where classroom_id is not null;

alter table public.student_video_grants enable row level security;
revoke all on public.student_video_grants from public, anon, authenticated;
grant select on public.student_video_grants to authenticated;
grant all on public.student_video_grants to service_role;

-- Whoever may see the student sees their grants.
create policy student_video_grants_select_scoped
  on public.student_video_grants for select to authenticated
  using (exists (select 1 from public.students s where s.id = student_video_grants.student_id));

-- Today's class x month access, as age group x subject x month (or the class itself
-- when it has no subject). Several classes of one topic merge: the earliest start
-- and latest end (no start / no end wins).
insert into public.student_video_grants (student_id, age_group, subject_id, classroom_id, year, month, starts_on, ends_on, created_by, created_at)
select a.student_id,
       case when c.subject_id is not null then c.age_group end,
       c.subject_id,
       case when c.subject_id is null then c.id end,
       a.year, a.month,
       case when bool_or(a.starts_on is null) then null else min(a.starts_on) end,
       case when bool_or(a.ends_on is null) then null else max(a.ends_on) end,
       min(a.created_by),
       min(a.created_at)
from public.student_video_access a
join public.classrooms c on c.id = a.classroom_id
group by a.student_id,
         case when c.subject_id is not null then c.age_group end,
         c.subject_id,
         case when c.subject_id is null then c.id end,
         a.year, a.month
on conflict do nothing;

-- A child no longer in any class of a topic (they stopped) could not watch it before,
-- because the old rule needed the class: their converted months close from yesterday.
delete from public.student_video_grants g
where g.starts_on >= (timezone('Asia/Kuala_Lumpur', now()))::date
  and not exists (
    select 1 from public.student_classroom_periods p join public.classrooms c on c.id = p.classroom_id
    where p.student_id = g.student_id
      and (p.end_date is null or p.end_date >= (timezone('Asia/Kuala_Lumpur', now()))::date)
      and (c.id = g.classroom_id or (g.classroom_id is null and c.age_group = g.age_group and c.subject_id = g.subject_id)));
update public.student_video_grants g
set ends_on = least(coalesce(g.ends_on, (timezone('Asia/Kuala_Lumpur', now()))::date - 1), (timezone('Asia/Kuala_Lumpur', now()))::date - 1)
where not exists (
    select 1 from public.student_classroom_periods p join public.classrooms c on c.id = p.classroom_id
    where p.student_id = g.student_id
      and (p.end_date is null or p.end_date >= (timezone('Asia/Kuala_Lumpur', now()))::date)
      and (c.id = g.classroom_id or (g.classroom_id is null and c.age_group = g.age_group and c.subject_id = g.subject_id)));

-- ---------------------------------------------------------------------------
-- 2. Who may watch: the new rule

create or replace function public.student_can_watch_video(p_student_id bigint, p_video_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_videos v
    join public.classrooms c on c.id = v.classroom_id
    where v.id = p_video_id and not v.is_archived and v.status = 'ready'
      and case
        when coalesce((select (value ->> 'month_access')::boolean from public.app_settings where key = 'class_videos'), false) = false
          then public.is_in_classroom_on(p_student_id, v.classroom_id, (timezone('Asia/Kuala_Lumpur', now()))::date)
        else exists (
          select 1 from public.student_video_grants g
          where g.student_id = p_student_id and g.year = v.year and g.month = v.month
            and (g.classroom_id = v.classroom_id
                 or (g.classroom_id is null and g.age_group = c.age_group and g.subject_id = c.subject_id))
            and (g.starts_on is null or g.starts_on <= (timezone('Asia/Kuala_Lumpur', now()))::date)
            and (g.ends_on is null or (timezone('Asia/Kuala_Lumpur', now()))::date <= g.ends_on)
        )
      end
  );
$$;

revoke all on function public.student_can_watch_video(bigint, bigint) from public, anon;
grant execute on function public.student_can_watch_video(bigint, bigint) to authenticated;

-- What the app shows: the child's own classes and, with month access on, every
-- other class with a video they were given; per class the videos they may watch
-- now and the months still closed to them (own classes only).
create or replace function public.portal_class_videos(p_student_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_month_access boolean := coalesce((select (value ->> 'month_access')::boolean from public.app_settings where key = 'class_videos'), false);
begin
  if not public.portal_may_act_for(p_student_id) then
    raise exception 'Not found.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'classroom_id', c.id,
      'class', c.name,
      'videos', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', v.id,
          'title', v.title,
          'description', v.description,
          'year', v.year,
          'month', v.month,
          'lesson_date', v.lesson_date,
          'embed_url', 'https://player.mediadelivery.net/embed/' || v.bunny_library_id || '/' || v.bunny_video_id,
          'thumbnail_url', 'https://player.mediadelivery.net/embed/' || v.bunny_library_id || '/' || v.bunny_video_id || '/thumbnail.jpg',
          'watched', coalesce(pr.watch_percentage, 0),
          'completed', pr.completed_at is not null
        ) order by v.year desc, v.month desc, v.lesson_date desc nulls last, v.id desc)
        from public.class_videos v
        left join public.class_video_progress pr on pr.video_id = v.id and pr.student_id = p_student_id
        where v.classroom_id = c.id and public.student_can_watch_video(p_student_id, v.id)
      ), '[]'::jsonb),
      'closed_months', case when public.is_in_classroom_on(p_student_id, c.id, v_today) then coalesce((
        select jsonb_agg(distinct jsonb_build_object('year', v.year, 'month', v.month))
        from public.class_videos v
        where v.classroom_id = c.id and not v.is_archived and v.status = 'ready'
          and not public.student_can_watch_video(p_student_id, v.id)
      ), '[]'::jsonb) else '[]'::jsonb end
    ) order by c.name)
    from public.classrooms c
    where public.is_in_classroom_on(p_student_id, c.id, v_today)
       or (v_month_access and c.status = 'active' and exists (
             select 1 from public.class_videos v
             where v.classroom_id = c.id and public.student_can_watch_video(p_student_id, v.id)))
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.portal_class_videos(bigint) from public, anon;
grant execute on function public.portal_class_videos(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Ticking months: one student or many

-- Staff who may edit students, never a teacher login.
create or replace function public.can_grant_videos()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('students', 'edit')
    and exists (select 1 from public.teachers t where t.id = public.current_teacher_id() and t.role <> 'teacher');
$$;

revoke all on function public.can_grant_videos() from public, anon;
grant execute on function public.can_grant_videos() to authenticated;

-- Opens (p_granted) or closes months of one topic for several students. The topic is
-- an age group + subject, or a class (p_classroom_id) for a class with no subject.
-- p_months: [{"year": 2026, "month": 10}, ...]. Returns how many rows changed.
create or replace function public.set_student_video_grants(
  p_student_ids bigint[],
  p_age_group text,
  p_subject_id bigint,
  p_classroom_id bigint,
  p_months jsonb,
  p_granted boolean,
  p_starts_on date default null,
  p_ends_on date default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_rows integer;
  v_month jsonb;
  v_year integer;
  v_m integer;
begin
  if not public.can_grant_videos() then
    raise exception 'Only staff who may edit students can open recordings.';
  end if;
  if coalesce(array_length(p_student_ids, 1), 0) = 0 then
    raise exception 'Pick at least one student.';
  end if;
  if (p_classroom_id is null) = (p_age_group is null or p_subject_id is null) then
    raise exception 'Pick an age group and a subject, or one class.';
  end if;
  if p_classroom_id is not null and exists (select 1 from public.classrooms where id = p_classroom_id and subject_id is not null) then
    raise exception 'This class has a subject: open its age group and subject instead.';
  end if;
  if jsonb_typeof(p_months) <> 'array' or jsonb_array_length(p_months) = 0 then
    raise exception 'Pick at least one month.';
  end if;
  if p_starts_on is not null and p_ends_on is not null and p_starts_on > p_ends_on then
    raise exception 'The access must end after it starts.';
  end if;

  for v_month in select * from jsonb_array_elements(p_months) loop
    v_year := (v_month ->> 'year')::integer;
    v_m := (v_month ->> 'month')::integer;
    if v_year is null or v_m is null or v_year not between 2000 and 2100 or v_m not between 1 and 12 then
      raise exception 'Pick a month.';
    end if;
    if coalesce(p_granted, false) then
      insert into public.student_video_grants (student_id, age_group, subject_id, classroom_id, year, month, starts_on, ends_on, created_by)
      select s.id, case when p_classroom_id is null then p_age_group end, case when p_classroom_id is null then p_subject_id end,
             p_classroom_id, v_year, v_m, p_starts_on, p_ends_on, public.current_teacher_id()
      from public.students s
      where s.id = any (p_student_ids)
      on conflict (student_id, coalesce(classroom_id, 0), coalesce(age_group, ''), coalesce(subject_id, 0), year, month)
        do update set starts_on = excluded.starts_on, ends_on = excluded.ends_on, created_by = excluded.created_by;
    else
      delete from public.student_video_grants g
      where g.student_id = any (p_student_ids) and g.year = v_year and g.month = v_m
        and (case when p_classroom_id is null
                  then g.classroom_id is null and g.age_group = p_age_group and g.subject_id = p_subject_id
                  else g.classroom_id = p_classroom_id end);
    end if;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.set_student_video_grants(bigint[], text, bigint, bigint, jsonb, boolean, date, date) from public, anon;
grant execute on function public.set_student_video_grants(bigint[], text, bigint, bigint, jsonb, boolean, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Leaving a class closes its months (checked at the end of the change, so a
--    move to another teacher's class of the same topic keeps them).

create or replace function public.close_video_grants_on_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student bigint := old.student_id;
  v_classroom bigint := old.classroom_id;
  v_left date;
  v_class public.classrooms%rowtype;
begin
  if tg_op = 'UPDATE' then
    if old.end_date is not null or new.end_date is null then
      return null;
    end if;
    v_left := new.end_date;
  else
    if old.end_date is not null then
      return null;
    end if;
    v_left := (timezone('Asia/Kuala_Lumpur', now()))::date;
  end if;

  select * into v_class from public.classrooms where id = v_classroom;
  if not found then
    return null;
  end if;

  if v_class.subject_id is null then
    -- A class with no subject: its own grants, unless the child is in it again.
    if not exists (select 1 from public.student_classroom_periods p
                   where p.student_id = v_student and p.classroom_id = v_classroom
                     and (p.end_date is null or p.end_date > v_left)) then
      delete from public.student_video_grants
      where student_id = v_student and classroom_id = v_classroom and starts_on > v_left;
      update public.student_video_grants set ends_on = least(coalesce(ends_on, v_left), v_left)
      where student_id = v_student and classroom_id = v_classroom;
    end if;
  elsif not exists (
    select 1 from public.student_classroom_periods p
    join public.classrooms c on c.id = p.classroom_id
    where p.student_id = v_student and c.age_group = v_class.age_group and c.subject_id = v_class.subject_id
      and (p.end_date is null or p.end_date > v_left)
  ) then
    -- A grant that would only start after the leaving day goes; the others end that day.
    delete from public.student_video_grants
    where student_id = v_student and classroom_id is null
      and age_group = v_class.age_group and subject_id = v_class.subject_id and starts_on > v_left;
    update public.student_video_grants set ends_on = least(coalesce(ends_on, v_left), v_left)
    where student_id = v_student and classroom_id is null
      and age_group = v_class.age_group and subject_id = v_class.subject_id;
  end if;
  return null;
end;
$$;

revoke all on function public.close_video_grants_on_leave() from public, anon, authenticated;

create constraint trigger student_classroom_periods_close_videos
  after update of end_date or delete on public.student_classroom_periods
  deferrable initially deferred
  for each row execute function public.close_video_grants_on_leave();
