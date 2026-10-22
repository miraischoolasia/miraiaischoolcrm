-- One student per child, however many HOA trials are booked (boss 2026-10-22: "why duplicate HOA students again").
--
-- Cause: book_trial_slot made a brand-new students row on every booking. A child booked for a second
-- trial (another day, another slot) got a second student with the same name and phone, usually with
-- Classes: 0, next to the first one.
--
-- Fix: when the child (same name, and the same lead or the same phone) already has an active trial or
-- regular student, the booking uses that student (a regular one first). Only a new child makes a new student.
-- The conversion to a regular student (convert_hoa_student) already works on the same student, so it needs no change.
--
-- Because a student can now hold more than one booking, cancelling a booking must not delete a student
-- that another booking still uses, or a student that is already regular. Attendance is checked for the
-- booking being cancelled (its slot and day) when the student has other bookings.
--
-- Both functions are the live text with only the marked parts changed (permission checks kept).

CREATE OR REPLACE FUNCTION public.book_trial_slot(p_schedule_id bigint, p_booking_date date, p_child_name text, p_child_age integer DEFAULT NULL::integer, p_phone text DEFAULT NULL::text, p_lead_id bigint DEFAULT NULL::bigint, p_notes text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if not public.has_permission('calendar', 'edit') then
    raise exception 'Your account is not allowed to book a trial class.';
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
      status = case when status in ('new', 'contacted') and public.lead_stage_active('trial_scheduled') and public.lead_stage_rule_on('trial_scheduled_on_booking') then 'trial_scheduled' else status end
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
      case when public.lead_stage_active('trial_scheduled') and public.lead_stage_rule_on('trial_scheduled_on_booking') then 'trial_scheduled' else 'new' end,
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

  -- The same child (same name, and the same lead or the same phone) never
  -- gets a second student: a trial or regular student that is already there
  -- is used again, a regular one first. Only a new child makes a new student.
  select s.id into v_student_id
  from public.students s
  where s.is_active
    and s.student_type in ('trial', 'regular')
    and regexp_replace(lower(trim(s.full_name)), '\s+', ' ', 'g') = regexp_replace(lower(v_child_name), '\s+', ' ', 'g')
    and (
      exists (select 1 from public.trial_bookings b where b.lead_id = v_lead_id and b.student_id = s.id)
      or exists (select 1 from public.leads l where l.id = v_lead_id and l.converted_student_id = s.id)
      or (
        length(right(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), 9)) >= 7
        and right(regexp_replace(coalesce(s.phone, ''), '\D', '', 'g'), 9) = right(regexp_replace(v_phone, '\D', '', 'g'), 9)
      )
    )
  order by (s.student_type = 'regular') desc, s.id
  limit 1;

  if v_student_id is not null then
    update public.students
    set age = coalesce(age, p_child_age)
    where id = v_student_id;
  else
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
  end if;

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
$function$;

CREATE OR REPLACE FUNCTION public.cancel_trial_booking(p_booking_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_booking public.trial_bookings%rowtype;
  v_label text;
  v_has_attendance boolean;
  v_other_bookings boolean := false;
  v_student_type text;
begin
  if not public.has_permission('calendar', 'delete') then
    raise exception 'Your account is not allowed to cancel a trial booking.';
  end if;

  select * into v_booking
  from public.trial_bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Trial booking not found.';
  end if;

  if v_booking.student_id is not null then
    select exists (
      select 1 from public.trial_bookings
      where student_id = v_booking.student_id and id <> p_booking_id
    ) into v_other_bookings;

    if v_other_bookings then
      -- The student is shared by more than one booking: only this slot and day count.
      select exists (
        select 1
        from public.lesson_log_students ls
        join public.lesson_logs ll on ll.id = ls.lesson_log_id
        where ls.student_id = v_booking.student_id
          and ll.schedule_id = v_booking.schedule_id
          and ll.lesson_date = v_booking.booking_date
      ) into v_has_attendance;
    else
      select exists (
        select 1 from public.lesson_log_students where student_id = v_booking.student_id
      ) into v_has_attendance;
    end if;

    if v_has_attendance then
      raise exception 'Attendance was already recorded for this trial booking, so it cannot be removed.';
    end if;
  end if;

  select c.name into v_label
  from public.schedules s
  left join public.classrooms c on c.id = s.classroom_id
  where s.id = v_booking.schedule_id;

  delete from public.trial_bookings where id = p_booking_id;

  if v_booking.student_id is not null and not v_other_bookings then
    select student_type into v_student_type from public.students where id = v_booking.student_id;
    -- Only a student that is still an HOA student is removed with its last booking; a student who
    -- has become regular stays.
    if v_student_type = 'trial' then
      delete from public.students where id = v_booking.student_id;
    end if;
  end if;

  perform public.record_admin_activity(
    'trial_booking_cancelled',
    'schedule',
    v_booking.schedule_id,
    coalesce(v_label, 'Trial slot'),
    jsonb_build_object(
      'booking_date', v_booking.booking_date,
      'child_name', v_booking.child_name,
      'lead_id', v_booking.lead_id
    )
  );
end;
$function$;
