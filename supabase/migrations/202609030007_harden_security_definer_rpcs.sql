-- Real-auth hardening: every security-definer RPC below used to trust a
-- client-supplied actor/teacher id (p_actor_teacher_id / p_teacher_id) with
-- no check that it matched the caller. That made them spoofable by any
-- authenticated (or, for record_admin_activity, even anonymous) caller.
-- Now that real logins exist, each function derives its own caller identity
-- from auth.uid() via current_teacher_id()/is_admin() and drops the
-- client-supplied parameter entirely.
--
-- Function signatures are changing (a parameter is being removed), and
-- Postgres treats that as a distinct overload rather than a replacement, so
-- each old signature is explicitly dropped first to avoid leaving the
-- vulnerable version callable alongside the hardened one.

drop function if exists public.update_teacher_record(bigint, text, text, text, text, text, bigint);
drop function if exists public.create_student_record(text, bigint, integer, date, date, date, text, bigint, text);
drop function if exists public.renew_student_record(bigint, integer, date, date, date, text, bigint);
drop function if exists public.update_student_record(bigint, text, bigint, bigint, text, bigint, text);
drop function if exists public.archive_classroom(bigint, bigint);
drop function if exists public.restore_classroom(bigint, bigint);
drop function if exists public.record_admin_activity(bigint, text, text, bigint, text, jsonb);
drop function if exists public.submit_lesson_attendance(bigint, date, bigint, text, jsonb, jsonb);
-- A separate, even older (phase 4) 5-argument overload of this function was
-- never removed when a later phase added p_student_reviews as a 6th
-- argument -- create-or-replace only ever replaced the 6-arg signature, so
-- this one survived, unhardened, and still directly callable via PostgREST.
drop function if exists public.submit_lesson_attendance(bigint, date, bigint, text, jsonb);

create or replace function public.record_admin_activity(
  p_action_type text,
  p_entity_type text,
  p_entity_id bigint,
  p_entity_label text,
  p_details jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id bigint;
begin
  if p_entity_type not in ('student', 'teacher', 'classroom', 'schedule', 'lead') then
    raise exception 'Unsupported activity entity type.';
  end if;

  insert into public.admin_activity_logs (
    actor_teacher_id,
    action_type,
    entity_type,
    entity_id,
    entity_label,
    details
  ) values (
    public.current_teacher_id(),
    trim(p_action_type),
    p_entity_type,
    p_entity_id,
    trim(p_entity_label),
    coalesce(p_details, '{}'::jsonb)
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

create or replace function public.create_teacher_record(
  p_username text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_role text default 'teacher'
)
returns table (
  teacher_id bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_id bigint;
  v_role text := coalesce(nullif(trim(p_role), ''), 'teacher');
begin
  if not public.is_admin() then
    raise exception 'Only admins can create teacher records.';
  end if;

  if coalesce(trim(p_username), '') = '' then
    raise exception 'Username is required.';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Teacher full name is required.';
  end if;

  if v_role not in ('admin', 'teacher') then
    raise exception 'Teacher role must be admin or teacher.';
  end if;

  insert into public.teachers (
    username,
    full_name,
    email,
    phone,
    role,
    is_active
  )
  values (
    trim(p_username),
    trim(p_full_name),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    v_role,
    true
  )
  returning id into v_teacher_id;

  return query
  select v_teacher_id;
end;
$$;

create or replace function public.update_teacher_record(
  p_teacher_id bigint,
  p_username text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous public.teachers%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can update teacher records.';
  end if;

  select * into v_previous
  from public.teachers
  where id = p_teacher_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Teacher record not found.';
  end if;

  if coalesce(trim(p_username), '') = '' then
    raise exception 'Username is required.';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Teacher full name is required.';
  end if;

  if p_role not in ('admin', 'teacher') then
    raise exception 'Teacher role must be admin or teacher.';
  end if;

  if v_previous.username = 'admin_demo' and (
    trim(p_username) <> 'admin_demo' or p_role <> 'admin'
  ) then
    raise exception 'The bootstrap Admin username and role are protected.';
  end if;

  update public.teachers
  set
    username = trim(p_username),
    full_name = trim(p_full_name),
    email = nullif(trim(coalesce(p_email, '')), ''),
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    role = p_role
  where id = p_teacher_id;

  perform public.record_admin_activity(
    'teacher_updated',
    'teacher',
    p_teacher_id,
    trim(p_full_name),
    jsonb_build_object(
      'previous_username', v_previous.username,
      'new_username', trim(p_username),
      'previous_role', v_previous.role,
      'new_role', p_role
    )
  );
end;
$$;

create or replace function public.create_student_record(
  p_full_name text,
  p_teacher_id bigint,
  p_initial_hours integer,
  p_lesson_expiry_date date,
  p_account_fee_expiry_date date,
  p_mirai_club_expiry_date date,
  p_notes text,
  p_student_type text default 'regular'
)
returns table (
  student_id bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id bigint;
  v_initial_hours integer := greatest(coalesce(p_initial_hours, 0), 0);
  v_student_type text := coalesce(nullif(trim(p_student_type), ''), 'regular');
  v_actor_teacher_id bigint := public.current_teacher_id();
begin
  if not public.is_admin() then
    raise exception 'Only admins can create student records.';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Student full name is required.';
  end if;

  if v_student_type not in ('trial', 'regular') then
    raise exception 'Invalid student type.';
  end if;

  if p_teacher_id is not null and not exists (
    select 1
    from public.teachers
    where id = p_teacher_id
  ) then
    raise exception 'Assigned teacher not found.';
  end if;

  insert into public.students (
    teacher_id,
    full_name,
    remaining_hours,
    lesson_expiry_date,
    account_fee_expiry_date,
    mirai_club_expiry_date,
    notes,
    is_active,
    student_type
  )
  values (
    p_teacher_id,
    trim(p_full_name),
    v_initial_hours,
    p_lesson_expiry_date,
    p_account_fee_expiry_date,
    p_mirai_club_expiry_date,
    nullif(trim(coalesce(p_notes, '')), ''),
    true,
    v_student_type
  )
  returning id into v_student_id;

  insert into public.student_admin_ledger (
    student_id,
    action_type,
    delta_hours,
    remark,
    actor_teacher_id
  )
  values (
    v_student_id,
    'student_created',
    v_initial_hours,
    coalesce(nullif(trim(coalesce(p_notes, '')), ''), 'Initial student record created.'),
    v_actor_teacher_id
  );

  insert into public.student_admin_ledger (
    student_id,
    action_type,
    old_date,
    new_date,
    remark,
    actor_teacher_id
  )
  values
    (
      v_student_id,
      'lesson_expiry_updated',
      null,
      p_lesson_expiry_date,
      'Initial lesson expiry set.',
      v_actor_teacher_id
    ),
    (
      v_student_id,
      'account_fee_expiry_updated',
      null,
      p_account_fee_expiry_date,
      'Initial account fee expiry set.',
      v_actor_teacher_id
    ),
    (
      v_student_id,
      'mirai_club_expiry_updated',
      null,
      p_mirai_club_expiry_date,
      'Initial Mirai Club expiry set.',
      v_actor_teacher_id
    );

  return query
  select v_student_id;
end;
$$;

create or replace function public.update_student_record(
  p_student_id bigint,
  p_full_name text,
  p_teacher_id bigint,
  p_classroom_id bigint,
  p_notes text,
  p_student_type text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous public.students%rowtype;
  v_classroom_teacher_id bigint;
  v_student_type text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can update student records.';
  end if;

  select * into v_previous
  from public.students
  where id = p_student_id
  for update;

  if not found then
    raise exception 'Student record not found.';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Student full name is required.';
  end if;

  v_student_type := coalesce(nullif(trim(p_student_type), ''), v_previous.student_type);

  if v_student_type not in ('trial', 'regular') then
    raise exception 'Invalid student type.';
  end if;

  if p_classroom_id is not null then
    select teacher_id into v_classroom_teacher_id
    from public.classrooms
    where id = p_classroom_id
      and status = 'active';

    if not found then
      raise exception 'Selected classroom is not active.';
    end if;
  end if;

  update public.students
  set
    full_name = trim(p_full_name),
    classroom_id = p_classroom_id,
    teacher_id = coalesce(v_classroom_teacher_id, p_teacher_id),
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    student_type = v_student_type
  where id = p_student_id;

  perform public.record_admin_activity(
    'student_updated',
    'student',
    p_student_id,
    trim(p_full_name),
    jsonb_build_object(
      'previous_classroom_id', v_previous.classroom_id,
      'new_classroom_id', p_classroom_id,
      'previous_teacher_id', v_previous.teacher_id,
      'new_teacher_id', coalesce(v_classroom_teacher_id, p_teacher_id),
      'previous_student_type', v_previous.student_type,
      'new_student_type', v_student_type
    )
  );
end;
$$;

create or replace function public.renew_student_record(
  p_student_id bigint,
  p_add_hours integer,
  p_new_lesson_expiry_date date,
  p_new_account_fee_expiry_date date,
  p_new_mirai_club_expiry_date date,
  p_remark text
)
returns table (
  student_id bigint,
  remaining_hours integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_add_hours integer := greatest(coalesce(p_add_hours, 0), 0);
  v_next_lesson_expiry date;
  v_next_account_fee_expiry date;
  v_next_mirai_club_expiry date;
  v_next_remaining_hours integer;
  v_remark text := nullif(trim(coalesce(p_remark, '')), '');
  v_actor_teacher_id bigint := public.current_teacher_id();
begin
  if not public.is_admin() then
    raise exception 'Only admins can renew student records.';
  end if;

  select *
  into v_student
  from public.students
  where id = p_student_id;

  if not found then
    raise exception 'Student not found.';
  end if;

  v_next_lesson_expiry := coalesce(p_new_lesson_expiry_date, v_student.lesson_expiry_date);
  v_next_account_fee_expiry := coalesce(p_new_account_fee_expiry_date, v_student.account_fee_expiry_date);
  v_next_mirai_club_expiry := coalesce(p_new_mirai_club_expiry_date, v_student.mirai_club_expiry_date);
  v_next_remaining_hours := v_student.remaining_hours + v_add_hours;

  if v_add_hours = 0
    and v_next_lesson_expiry = v_student.lesson_expiry_date
    and v_next_account_fee_expiry = v_student.account_fee_expiry_date
    and v_next_mirai_club_expiry = v_student.mirai_club_expiry_date then
    raise exception 'No renewal changes were submitted.';
  end if;

  update public.students
  set
    remaining_hours = v_next_remaining_hours,
    lesson_expiry_date = v_next_lesson_expiry,
    account_fee_expiry_date = v_next_account_fee_expiry,
    mirai_club_expiry_date = v_next_mirai_club_expiry
  where id = p_student_id;

  if v_add_hours > 0 then
    insert into public.student_admin_ledger (
      student_id,
      action_type,
      delta_hours,
      remark,
      actor_teacher_id
    )
    values (
      p_student_id,
      'hours_added',
      v_add_hours,
      coalesce(v_remark, 'Hours renewed by admin.'),
      v_actor_teacher_id
    );
  end if;

  if v_next_lesson_expiry <> v_student.lesson_expiry_date then
    insert into public.student_admin_ledger (
      student_id,
      action_type,
      old_date,
      new_date,
      remark,
      actor_teacher_id
    )
    values (
      p_student_id,
      'lesson_expiry_updated',
      v_student.lesson_expiry_date,
      v_next_lesson_expiry,
      coalesce(v_remark, 'Lesson expiry renewed by admin.'),
      v_actor_teacher_id
    );
  end if;

  if v_next_account_fee_expiry <> v_student.account_fee_expiry_date then
    insert into public.student_admin_ledger (
      student_id,
      action_type,
      old_date,
      new_date,
      remark,
      actor_teacher_id
    )
    values (
      p_student_id,
      'account_fee_expiry_updated',
      v_student.account_fee_expiry_date,
      v_next_account_fee_expiry,
      coalesce(v_remark, 'Account fee expiry renewed by admin.'),
      v_actor_teacher_id
    );
  end if;

  if v_next_mirai_club_expiry <> v_student.mirai_club_expiry_date then
    insert into public.student_admin_ledger (
      student_id,
      action_type,
      old_date,
      new_date,
      remark,
      actor_teacher_id
    )
    values (
      p_student_id,
      'mirai_club_expiry_updated',
      v_student.mirai_club_expiry_date,
      v_next_mirai_club_expiry,
      coalesce(v_remark, 'Mirai Club expiry renewed by admin.'),
      v_actor_teacher_id
    );
  end if;

  return query
  select p_student_id, v_next_remaining_hours;
end;
$$;

create or replace function public.archive_classroom(
  p_classroom_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_classroom public.classrooms%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can archive classrooms.';
  end if;

  select * into v_classroom
  from public.classrooms
  where id = p_classroom_id
  for update;

  if not found then
    raise exception 'Classroom not found.';
  end if;

  update public.schedules
  set status = 'cancelled'
  where classroom_id = p_classroom_id
    and status = 'active';

  update public.classrooms
  set status = 'archived', archived_at = timezone('utc', now())
  where id = p_classroom_id;

  perform public.record_admin_activity(
    'classroom_archived',
    'classroom',
    p_classroom_id,
    v_classroom.name,
    jsonb_build_object(
      'age_group', v_classroom.age_group,
      'program_level', v_classroom.program_level,
      'teacher_id', v_classroom.teacher_id
    )
  );
end;
$$;

create or replace function public.restore_classroom(
  p_classroom_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_classroom public.classrooms%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can restore classrooms.';
  end if;

  select * into v_classroom
  from public.classrooms
  where id = p_classroom_id
    and status = 'archived'
  for update;

  if not found then
    raise exception 'Archived classroom not found.';
  end if;

  update public.classrooms
  set status = 'active', archived_at = null
  where id = p_classroom_id;

  perform public.record_admin_activity(
    'classroom_restored',
    'classroom',
    p_classroom_id,
    v_classroom.name,
    '{}'::jsonb
  );
end;
$$;

create or replace function public.submit_lesson_attendance(
  p_schedule_id bigint,
  p_occurrence_date date,
  p_lesson_remark text,
  p_attendance jsonb,
  p_student_reviews jsonb default '[]'::jsonb
)
returns table (
  lesson_log_id bigint,
  revision_number integer,
  updated_student_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.schedules%rowtype;
  v_teacher_id bigint := public.current_teacher_id();
  v_is_admin boolean := public.is_admin();
  v_previous_log public.lesson_logs%rowtype;
  v_expected_student_ids bigint[] := '{}'::bigint[];
  v_submitted_student_ids bigint[] := '{}'::bigint[];
  v_next_revision integer := 1;
  v_new_log_id bigint;
  v_updated_count integer := 0;
  v_item jsonb;
  v_review jsonb;
  v_student_id bigint;
  v_new_status text;
  v_prev_status text;
  v_prev_delta integer;
  v_new_delta integer;
  v_net_delta integer;
  v_logical_thinking_score smallint;
  v_logical_thinking_remark text;
  v_coding_creativity_score smallint;
  v_coding_creativity_remark text;
  v_problem_solving_score smallint;
  v_problem_solving_remark text;
  v_expressiveness_score smallint;
  v_expressiveness_remark text;
  v_sustained_focus_score smallint;
  v_sustained_focus_remark text;
begin
  if v_teacher_id is null and not v_is_admin then
    raise exception 'No active teacher profile for this account.';
  end if;

  select *
  into v_schedule
  from public.schedules
  where id = p_schedule_id;

  if not found then
    raise exception 'Schedule not found.';
  end if;

  if not v_is_admin and v_schedule.teacher_id <> v_teacher_id then
    raise exception 'Teacher can only submit attendance for assigned schedules.';
  end if;

  if jsonb_typeof(p_attendance) <> 'array' then
    raise exception 'Attendance payload must be an array.';
  end if;

  if jsonb_typeof(p_student_reviews) <> 'array' then
    raise exception 'Student reviews payload must be an array.';
  end if;

  select *
  into v_previous_log
  from public.lesson_logs
  where schedule_id = p_schedule_id
    and lesson_date = p_occurrence_date
  order by revision_number desc
  limit 1;

  if found then
    if timezone('utc', now()) > v_previous_log.submitted_at + interval '24 hours' then
      raise exception 'Attendance can only be modified within 24 hours.';
    end if;

    v_next_revision := v_previous_log.revision_number + 1;

    select coalesce(array_agg(student_id order by student_id), '{}'::bigint[])
    into v_expected_student_ids
    from public.lesson_log_students
    where lesson_log_id = v_previous_log.id;
  elsif v_schedule.event_type = 'regular' then
    select coalesce(array_agg(id order by id), '{}'::bigint[])
    into v_expected_student_ids
    from public.students
    where classroom_id = v_schedule.classroom_id;
  else
    select coalesce(array_agg(student_id order by student_id), '{}'::bigint[])
    into v_expected_student_ids
    from public.schedule_students
    where schedule_id = p_schedule_id
      and is_active = true;
  end if;

  if cardinality(v_expected_student_ids) = 0 then
    raise exception 'This class has no students assigned.';
  end if;

  select coalesce(array_agg(student_id order by student_id), '{}'::bigint[])
  into v_submitted_student_ids
  from (
    select distinct (value ->> 'student_id')::bigint as student_id
    from jsonb_array_elements(p_attendance)
  ) submitted;

  if jsonb_array_length(p_attendance) <> cardinality(v_expected_student_ids)
    or v_submitted_student_ids <> v_expected_student_ids then
    raise exception 'Attendance must include every student in the lesson roster exactly once.';
  end if;

  insert into public.lesson_logs (
    schedule_id,
    teacher_id,
    lesson_date,
    lesson_remark,
    revision_number,
    parent_log_id
  )
  values (
    p_schedule_id,
    v_schedule.teacher_id,
    p_occurrence_date,
    p_lesson_remark,
    v_next_revision,
    case when v_next_revision > 1 then v_previous_log.id else null end
  )
  returning id into v_new_log_id;

  for v_item in
    select value from jsonb_array_elements(p_attendance)
  loop
    v_student_id := (v_item ->> 'student_id')::bigint;
    v_new_status := v_item ->> 'status';

    if v_new_status not in ('present', 'absent', 'leave') then
      raise exception 'Invalid attendance status for student %', v_student_id;
    end if;

    if v_schedule.event_type = 'regular' then
      if not exists (
        select 1
        from public.students st
        where st.id = v_student_id
          and st.classroom_id = v_schedule.classroom_id
      ) then
        raise exception 'Student % is not assigned to this regular classroom.', v_student_id;
      end if;
    elsif not exists (
      select 1
      from public.schedule_students ss
      where ss.schedule_id = p_schedule_id
        and ss.student_id = v_student_id
        and ss.is_active = true
    ) then
      raise exception 'Student % is not assigned to this replacement schedule.', v_student_id;
    end if;

    insert into public.lesson_log_students (
      lesson_log_id,
      student_id,
      attendance_status
    )
    values (
      v_new_log_id,
      v_student_id,
      v_new_status
    );

    if v_next_revision > 1 then
      select attendance_status
      into v_prev_status
      from public.lesson_log_students
      where lesson_log_id = v_previous_log.id
        and student_id = v_student_id;
    else
      v_prev_status := null;
    end if;

    v_prev_delta := case when v_prev_status = 'present' then -1 else 0 end;
    v_new_delta := case when v_new_status = 'present' then -1 else 0 end;
    v_net_delta := v_new_delta - v_prev_delta;

    if v_new_status = 'present' then
      select value
      into v_review
      from jsonb_array_elements(p_student_reviews)
      where (value ->> 'student_id')::bigint = v_student_id
      limit 1;

      if v_review is null then
        raise exception 'Missing student review for student %.', v_student_id;
      end if;

      v_logical_thinking_score := (v_review ->> 'logicalThinkingScore')::smallint;
      v_logical_thinking_remark := nullif(trim(coalesce(v_review ->> 'logicalThinkingRemark', '')), '');
      v_coding_creativity_score := (v_review ->> 'codingCreativityScore')::smallint;
      v_coding_creativity_remark := nullif(trim(coalesce(v_review ->> 'codingCreativityRemark', '')), '');
      v_problem_solving_score := (v_review ->> 'problemSolvingScore')::smallint;
      v_problem_solving_remark := nullif(trim(coalesce(v_review ->> 'problemSolvingRemark', '')), '');
      v_expressiveness_score := (v_review ->> 'expressivenessScore')::smallint;
      v_expressiveness_remark := nullif(trim(coalesce(v_review ->> 'expressivenessRemark', '')), '');
      v_sustained_focus_score := (v_review ->> 'sustainedFocusScore')::smallint;
      v_sustained_focus_remark := nullif(trim(coalesce(v_review ->> 'sustainedFocusRemark', '')), '');

      if v_logical_thinking_score is null or v_logical_thinking_score not between 1 and 5 then
        raise exception 'Logical thinking score must be between 1 and 5 for student %.', v_student_id;
      end if;
      if v_coding_creativity_score is null or v_coding_creativity_score not between 1 and 5 then
        raise exception 'Coding creativity score must be between 1 and 5 for student %.', v_student_id;
      end if;
      if v_problem_solving_score is null or v_problem_solving_score not between 1 and 5 then
        raise exception 'Problem solving score must be between 1 and 5 for student %.', v_student_id;
      end if;
      if v_expressiveness_score is null or v_expressiveness_score not between 1 and 5 then
        raise exception 'Expressiveness score must be between 1 and 5 for student %.', v_student_id;
      end if;
      if v_sustained_focus_score is null or v_sustained_focus_score not between 1 and 5 then
        raise exception 'Sustained focus score must be between 1 and 5 for student %.', v_student_id;
      end if;

      if v_logical_thinking_score <= 2 and v_logical_thinking_remark is null then
        raise exception 'Logical thinking remark is required for low score on student %.', v_student_id;
      end if;
      if v_coding_creativity_score <= 2 and v_coding_creativity_remark is null then
        raise exception 'Coding creativity remark is required for low score on student %.', v_student_id;
      end if;
      if v_problem_solving_score <= 2 and v_problem_solving_remark is null then
        raise exception 'Problem solving remark is required for low score on student %.', v_student_id;
      end if;
      if v_expressiveness_score <= 2 and v_expressiveness_remark is null then
        raise exception 'Expressiveness remark is required for low score on student %.', v_student_id;
      end if;
      if v_sustained_focus_score <= 2 and v_sustained_focus_remark is null then
        raise exception 'Sustained focus remark is required for low score on student %.', v_student_id;
      end if;

      insert into public.lesson_log_student_reviews (
        lesson_log_id,
        student_id,
        logical_thinking_score,
        logical_thinking_remark,
        coding_creativity_score,
        coding_creativity_remark,
        problem_solving_score,
        problem_solving_remark,
        expressiveness_score,
        expressiveness_remark,
        sustained_focus_score,
        sustained_focus_remark
      )
      values (
        v_new_log_id,
        v_student_id,
        v_logical_thinking_score,
        v_logical_thinking_remark,
        v_coding_creativity_score,
        v_coding_creativity_remark,
        v_problem_solving_score,
        v_problem_solving_remark,
        v_expressiveness_score,
        v_expressiveness_remark,
        v_sustained_focus_score,
        v_sustained_focus_remark
      );
    end if;

    if v_net_delta <> 0 then
      update public.students
      set remaining_hours = remaining_hours + v_net_delta
      where id = v_student_id;

      insert into public.student_lesson_ledger (
        student_id,
        lesson_log_id,
        delta_lessons,
        reason
      )
      values (
        v_student_id,
        v_new_log_id,
        v_net_delta,
        case
          when v_net_delta = -1 then 'attendance_present_deduction'
          when v_net_delta = 1 then 'attendance_revision_reversal'
          else 'attendance_adjustment'
        end
      );

      v_updated_count := v_updated_count + 1;
    end if;
  end loop;

  return query
  select v_new_log_id, v_next_revision, v_updated_count;
end;
$$;

-- Every function above must be executable only by authenticated users.
-- Supabase grants EXECUTE on new public-schema functions to `anon` and
-- `authenticated` directly via its own default-privilege setup, separate
-- from the PUBLIC pseudo-role -- `revoke ... from public` alone does not
-- remove anon's access, so anon must be revoked explicitly too.
revoke all on function public.record_admin_activity(text, text, bigint, text, jsonb) from public, anon;
revoke all on function public.create_teacher_record(text, text, text, text, text) from public, anon;
revoke all on function public.update_teacher_record(bigint, text, text, text, text, text) from public, anon;
revoke all on function public.create_student_record(text, bigint, integer, date, date, date, text, text) from public, anon;
revoke all on function public.update_student_record(bigint, text, bigint, bigint, text, text) from public, anon;
revoke all on function public.renew_student_record(bigint, integer, date, date, date, text) from public, anon;
revoke all on function public.archive_classroom(bigint) from public, anon;
revoke all on function public.restore_classroom(bigint) from public, anon;
revoke all on function public.submit_lesson_attendance(bigint, date, text, jsonb, jsonb) from public, anon;

grant execute on function public.record_admin_activity(text, text, bigint, text, jsonb) to authenticated;
grant execute on function public.create_teacher_record(text, text, text, text, text) to authenticated;
grant execute on function public.update_teacher_record(bigint, text, text, text, text, text) to authenticated;
grant execute on function public.create_student_record(text, bigint, integer, date, date, date, text, text) to authenticated;
grant execute on function public.update_student_record(bigint, text, bigint, bigint, text, text) to authenticated;
grant execute on function public.renew_student_record(bigint, integer, date, date, date, text) to authenticated;
grant execute on function public.archive_classroom(bigint) to authenticated;
grant execute on function public.restore_classroom(bigint) to authenticated;
grant execute on function public.submit_lesson_attendance(bigint, date, text, jsonb, jsonb) to authenticated;
