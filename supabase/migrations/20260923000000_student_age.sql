-- Teachers taking attendance for a trial-booked child need to recognise who
-- they are without a meaningless "Student ID #032" — age and phone (already
-- collected at booking time) are far more useful. remaining_hours/expiry
-- dates never applied to trial students in the first place; age was simply
-- never captured on the students table before now.

alter table public.students add column if not exists age integer;

create or replace function public.book_trial_slot(
  p_schedule_id bigint,
  p_booking_date date,
  p_child_name text,
  p_child_age integer default null,
  p_phone text default null,
  p_lead_id bigint default null,
  p_notes text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.schedules%rowtype;
  v_classroom public.classrooms%rowtype;
  v_lead public.leads%rowtype;
  v_child_name text := trim(coalesce(p_child_name, ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_lead_id bigint;
  v_children jsonb;
  v_student_id bigint;
  v_booking_id bigint;
begin
  if not public.is_admin() then
    raise exception 'Only admins can book a trial class.';
  end if;

  if v_child_name = '' then
    raise exception 'Child name is required.';
  end if;

  if p_child_age is not null and (p_child_age < 1 or p_child_age > 25) then
    raise exception 'Child age must be between 1 and 25.';
  end if;

  -- FOR SHARE serialises with cancel_schedule_occurrence (FOR UPDATE), so a
  -- day cannot be cancelled and booked at the same moment.
  select * into v_schedule
  from public.schedules
  where id = p_schedule_id
  for share;

  if not found then
    raise exception 'Schedule not found.';
  end if;

  if v_schedule.status <> 'active' or v_schedule.event_type <> 'regular' then
    raise exception 'This is not an active weekly trial slot.';
  end if;

  select * into v_classroom
  from public.classrooms
  where id = v_schedule.classroom_id;

  if not found or v_classroom.category <> 'trial' or v_classroom.status <> 'active' then
    raise exception 'This schedule is not an active trial classroom slot.';
  end if;

  if p_booking_date is null
    or extract(dow from p_booking_date)::int <> v_schedule.day_of_week
    or p_booking_date < v_schedule.start_recur
    or (v_schedule.end_recur is not null and p_booking_date > v_schedule.end_recur) then
    raise exception 'This trial slot does not run on that date.';
  end if;

  if exists (
    select 1 from public.schedule_exceptions
    where schedule_id = p_schedule_id
      and exception_date = p_booking_date
  ) then
    raise exception 'This trial slot is cancelled on that date.';
  end if;

  if exists (
    select 1 from public.trial_bookings
    where schedule_id = p_schedule_id
      and booking_date = p_booking_date
      and lower(child_name) = lower(v_child_name)
      and coalesce(phone, '') = coalesce(v_phone, '')
  ) then
    raise exception 'This child is already booked for that trial slot.';
  end if;

  if p_lead_id is not null then
    select * into v_lead
    from public.leads
    where id = p_lead_id
    for update;

    if not found then
      raise exception 'Lead not found.';
    end if;

    v_lead_id := v_lead.id;
    v_children := v_lead.children;

    -- Attach the child to the lead when it is not on it yet (a lead holds at
    -- most 3 children, and a child needs an age to be stored on a lead).
    if p_child_age is not null
      and jsonb_array_length(v_children) < 3
      and not exists (
        select 1 from jsonb_array_elements(v_children) child
        where lower(trim(coalesce(child ->> 'name', ''))) = lower(v_child_name)
      ) then
      v_children := v_children || jsonb_build_array(
        jsonb_build_object('name', v_child_name, 'age', p_child_age, 'phone', v_phone)
      );
    end if;

    update public.leads
    set
      children = v_children,
      phone = coalesce(phone, v_phone),
      status = case when status in ('new', 'contacted') then 'trial_scheduled' else status end
    where id = v_lead.id;
  else
    -- Not in Leads yet: booking creates the lead so the pipeline stays in sync.
    if p_child_age is null then
      raise exception 'Child age is required to add a new lead.';
    end if;

    insert into public.leads (full_name, phone, source, status, children, notes, added_date)
    values (
      null,
      v_phone,
      'other',
      'trial_scheduled',
      jsonb_build_array(
        jsonb_build_object('name', v_child_name, 'age', p_child_age, 'phone', v_phone)
      ),
      v_notes,
      (timezone('Asia/Kuala_Lumpur', now()))::date
    )
    returning id into v_lead_id;

    perform public.record_admin_activity(
      'lead_created',
      'lead',
      v_lead_id,
      v_child_name,
      jsonb_build_object('source', 'trial_booking')
    );
  end if;

  insert into public.students (
    teacher_id, classroom_id, full_name, phone, age, remaining_hours,
    lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date,
    notes, is_active, student_type
  )
  values (
    v_schedule.teacher_id, null, v_child_name, v_phone, p_child_age, 0,
    current_date, current_date, current_date,
    v_notes, true, 'trial'
  )
  returning id into v_student_id;

  insert into public.trial_bookings (
    schedule_id, booking_date, lead_id, child_name, child_age, phone, notes, created_by, student_id
  )
  values (
    p_schedule_id,
    p_booking_date,
    v_lead_id,
    v_child_name,
    p_child_age,
    v_phone,
    v_notes,
    public.current_teacher_id(),
    v_student_id
  )
  returning id into v_booking_id;

  perform public.record_admin_activity(
    'trial_booked',
    'schedule',
    p_schedule_id,
    v_classroom.name,
    jsonb_build_object(
      'booking_date', p_booking_date,
      'child_name', v_child_name,
      'lead_id', v_lead_id,
      'student_id', v_student_id
    )
  );

  return v_booking_id;
end;
$$;

-- Backfill: a trial student created before this migration has no age yet,
-- even though the booking that spawned it already recorded one.
update public.students s
set age = tb.child_age
from public.trial_bookings tb
where tb.student_id = s.id
  and s.age is null
  and tb.child_age is not null;
