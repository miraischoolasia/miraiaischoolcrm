-- A paid quotation puts the child in the class (EduHero fee payment -> enrolment, contract 13.1 of quotation-payment-plan-detail.md).
--
-- enrol_paid_quotation(quotation_id) is called by the server (the payment webhook) with the service role. It does, in one
-- transaction and only once per quotation:
--   1. finds the child's student the way book_trial_slot does (same name, and the same lead or the same phone; a regular
--      student first): an HOA student becomes regular on the same row, a regular student is used again, and only when
--      there is none a new regular student is made;
--   2. writes the roster fields (membership, how they enrol, pay once, region, fee month, sales person, consultant);
--   3. puts the student in every class of the quotation from the first day of the start month (the first class becomes the
--      main class when the student has none), with the months paid for each class;
--   4. marks the lead converted, and
--   5. tells the sales person and the learning consultant on the bell.
-- The quotation row only gets student_id; its status, events and the "Run again" button belong to the fee department's
-- wrapper. A failure raises a plain reason and everything is rolled back.
--
-- Which roster fields are overwritten: the ones that describe THIS enrolment (membership, how they enrol, pay once, region,
-- fee month) are written when the quotation has a value; the people (sales person, consultant) only fill a blank, so an old
-- student keeps who looks after them.
--
-- It does not check the logged-in staff permission (the existing create/convert/month functions need a staff login, which a
-- server call does not have); it is only granted to service_role.

create or replace function public.enrol_paid_quotation(p_quotation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q record;
  v_name text;
  v_digits text;
  v_phone9 text;
  v_student public.students%rowtype;
  v_student_id bigint;
  v_created boolean := false;
  v_from_trial boolean := false;
  v_room public.classrooms%rowtype;
  v_class record;
  v_main bigint;
  v_classrooms bigint[] := '{}';
  v_class_names text[] := '{}';
  v_membership text;
  v_far_off constant date := '2099-12-31';
  v_amount numeric;
  v_person bigint;
  v_notified integer := 0;
begin
  select * into q from public.quotations where id = p_quotation_id for update;
  if not found then
    raise exception 'Quotation not found.';
  end if;
  -- Called twice: the second call does nothing.
  if q.student_id is not null then
    return jsonb_build_object('student_id', q.student_id, 'already', true);
  end if;
  if q.status <> 'paid' then
    raise exception 'The quotation is not paid yet.';
  end if;

  v_name := btrim(coalesce(q.child_name, ''));
  if v_name = '' then
    raise exception 'The quotation has no child name.';
  end if;
  if q.start_date is null then
    raise exception 'The quotation has no start month.';
  end if;
  if q.months is null or q.months < 1 or q.months > 60 then
    raise exception 'The quotation months must be from 1 to 60.';
  end if;
  if not exists (select 1 from public.quotation_classes where quotation_id = q.id) then
    raise exception 'The quotation has no class.';
  end if;

  -- Every class must still be running, and a regular class.
  for v_class in
    select qc.classroom_id
    from public.quotation_classes qc
    where qc.quotation_id = q.id
    group by qc.classroom_id
    -- In the order the subjects were ticked (the first becomes the main class), else by subject code.
    order by min(coalesce((select t.pos from jsonb_array_elements_text(q.subjects) with ordinality as t(code, pos) where t.code = qc.subject_code), 1000)),
             min(qc.subject_code)
  loop
    select * into v_room from public.classrooms where id = v_class.classroom_id;
    if not found or v_room.status <> 'active' then
      raise exception 'Class % is not running any more.', v_class.classroom_id;
    end if;
    if v_room.category = 'trial' then
      raise exception 'Class % is an HOA class, not a regular class.', v_room.name;
    end if;
    v_classrooms := v_classrooms || v_room.id;
    v_class_names := v_class_names || v_room.name;
  end loop;

  v_digits := regexp_replace(coalesce(q.phone, ''), '\D', '', 'g');
  v_phone9 := right(v_digits, 9);

  -- The same child: same name, and the same lead (its HOA bookings or its student) or the same phone; regular first.
  select s.* into v_student
  from public.students s
  where s.is_active
    and s.student_type in ('trial', 'regular')
    and regexp_replace(lower(btrim(s.full_name)), '\s+', ' ', 'g') = regexp_replace(lower(v_name), '\s+', ' ', 'g')
    and (
      (q.lead_id is not null and (
        exists (select 1 from public.trial_bookings b where b.lead_id = q.lead_id and b.student_id = s.id)
        or exists (select 1 from public.leads l where l.id = q.lead_id and l.converted_student_id = s.id)
      ))
      or (length(v_phone9) >= 7 and right(regexp_replace(coalesce(s.phone, ''), '\D', '', 'g'), 9) = v_phone9)
    )
  order by (s.student_type = 'regular') desc, s.id
  limit 1
  for update;

  select * into v_room from public.classrooms where id = v_classrooms[1];

  if v_student.id is not null then
    v_student_id := v_student.id;
    if v_student.student_type = 'trial' then
      -- The same HOA student becomes regular (as convert_hoa_student does without a package).
      update public.students
      set student_type = 'regular',
          teacher_id = coalesce(v_room.teacher_id, teacher_id),
          lesson_expiry_date = v_far_off,
          account_fee_expiry_date = v_far_off,
          mirai_club_expiry_date = v_far_off
      where id = v_student_id;
      v_from_trial := true;
    end if;
  else
    insert into public.students (
      teacher_id, classroom_id, full_name, phone, age, remaining_hours,
      lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, is_active, student_type
    )
    values (
      v_room.teacher_id, null, v_name, nullif(v_digits, ''), q.child_age, 0,
      v_far_off, v_far_off, v_far_off, true, 'regular'
    )
    returning id into v_student_id;
    v_created := true;
  end if;

  -- The roster fields.
  select membership_name into v_membership from public.fee_cohorts where id = q.cohort_id;
  update public.students
  set membership = coalesce(v_membership, membership),
      enrol_method = coalesce(nullif(q.enrol_method, ''), enrol_method),
      payment_mode = coalesce(nullif(q.payment_mode, ''), payment_mode, '一次性付款'),
      region = coalesce(nullif(q.region_option, ''), region),
      fee_month = coalesce(q.fee_month, extract(month from q.start_date)::smallint, fee_month),
      sales_person_id = coalesce(sales_person_id, q.sales_person_id),
      consultant_id = coalesce(consultant_id, q.consultant_id),
      age = coalesce(age, q.child_age)
  where id = v_student_id;

  -- The classes, from the first day of the start month, and the months paid for each.
  foreach v_main in array v_classrooms loop
    select * into v_room from public.classrooms where id = v_main;
    if (select classroom_id from public.students where id = v_student_id) is null then
      -- No main class yet: the first one becomes it (the class history opens the stay today; it starts on the first day).
      update public.students
      set classroom_id = v_room.id, teacher_id = coalesce(v_room.teacher_id, teacher_id)
      where id = v_student_id;
      update public.student_classroom_periods
      set start_date = q.start_date
      where student_id = v_student_id and classroom_id = v_room.id and end_date is null;
    elsif not exists (
      select 1 from public.student_classroom_periods
      where student_id = v_student_id and classroom_id = v_room.id and end_date is null
    ) then
      insert into public.student_classroom_periods (student_id, classroom_id, start_date)
      values (v_student_id, v_room.id, q.start_date);
    end if;

    insert into public.student_month_plans (student_id, classroom_id, start_date, months, end_date, remark)
    values (v_student_id, v_room.id, q.start_date, q.months, public.month_plan_end_date(q.start_date, q.months), 'Paid quotation.');
  end loop;

  -- The lead is converted (a lead that already belongs to another student is left alone).
  if q.lead_id is not null then
    update public.leads
    set converted_student_id = v_student_id,
        status = case when public.lead_stage_rule_on('converted_on_enrol') then 'converted' else status end
    where id = q.lead_id and (converted_student_id is null or converted_student_id = v_student_id);
  end if;

  update public.quotations set student_id = v_student_id where id = q.id;

  insert into public.admin_activity_logs (actor_teacher_id, action_type, entity_type, entity_id, entity_label, details)
  values (null, 'student_enrolled_from_quotation', 'student', v_student_id, v_name,
    jsonb_build_object('quotation_id', q.id, 'classroom_ids', v_classrooms, 'start_date', q.start_date, 'months', q.months,
      'created', v_created, 'from_trial', v_from_trial));

  -- The bell: the sales person and the learning consultant.
  v_amount := coalesce(q.paid_amount, q.total);
  for v_person in
    select distinct t.id from public.teachers t
    where t.id in (q.sales_person_id, q.consultant_id) and t.is_active
  loop
    insert into public.staff_notifications (teacher_id, title, body, lead_id, student_id)
    values (v_person, left(v_name || ' has paid', 200),
      'RM' || to_char(coalesce(v_amount, 0), 'FM999999990.00') || ' paid, enrolled in ' || array_to_string(v_class_names, ', ') || '.',
      q.lead_id, v_student_id);
    v_notified := v_notified + 1;
  end loop;

  return jsonb_build_object(
    'student_id', v_student_id,
    'already', false,
    'created', v_created,
    'from_trial', v_from_trial,
    'classroom_ids', to_jsonb(v_classrooms),
    'notified', v_notified
  );
end;
$$;

revoke all on function public.enrol_paid_quotation(uuid) from public, anon, authenticated;
grant execute on function public.enrol_paid_quotation(uuid) to service_role;
