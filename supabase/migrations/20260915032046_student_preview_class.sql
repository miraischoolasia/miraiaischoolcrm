alter table public.students
  add column if not exists phone text;

alter table public.students
  drop constraint if exists students_student_type_check;

alter table public.students
  add constraint students_student_type_check
  check (student_type = any (array['trial'::text, 'preview'::text, 'regular'::text]));

drop function if exists public.create_student_record(text, bigint, integer, date, date, date, text, text);

create or replace function public.create_student_record(
  p_full_name text,
  p_teacher_id bigint,
  p_initial_hours integer,
  p_lesson_expiry_date date,
  p_account_fee_expiry_date date,
  p_mirai_club_expiry_date date,
  p_notes text,
  p_student_type text default 'regular',
  p_phone text default null
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
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_actor_teacher_id bigint := public.current_teacher_id();
begin
  if not public.is_admin() then
    raise exception 'Only admins can create student records.';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Student full name is required.';
  end if;

  if v_student_type not in ('trial', 'preview', 'regular') then
    raise exception 'Invalid student type.';
  end if;

  if v_student_type = 'preview' and v_phone is null then
    raise exception 'Phone number is required for preview students.';
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
    phone,
    remaining_hours,
    lesson_expiry_date,
    account_fee_expiry_date,
    mirai_club_expiry_date,
    notes,
    is_active,
    student_type
  )
  values (
    case when v_student_type = 'preview' then null else p_teacher_id end,
    trim(p_full_name),
    v_phone,
    case when v_student_type = 'preview' then 0 else v_initial_hours end,
    coalesce(p_lesson_expiry_date, current_date),
    coalesce(p_account_fee_expiry_date, current_date),
    coalesce(p_mirai_club_expiry_date, current_date),
    case
      when v_student_type = 'preview' then null
      else nullif(trim(coalesce(p_notes, '')), '')
    end,
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
    case when v_student_type = 'preview' then 0 else v_initial_hours end,
    case
      when v_student_type = 'preview' then 'Preview student record created.'
      else coalesce(nullif(trim(coalesce(p_notes, '')), ''), 'Initial student record created.')
    end,
    v_actor_teacher_id
  );

  if v_student_type <> 'preview' then
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
  end if;

  return query
  select v_student_id;
end;
$$;

drop function if exists public.update_student_record(bigint, text, bigint, bigint, text, text);

create or replace function public.update_student_record(
  p_student_id bigint,
  p_full_name text,
  p_teacher_id bigint,
  p_classroom_id bigint,
  p_notes text,
  p_student_type text default null,
  p_phone text default null
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
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
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

  if v_student_type not in ('trial', 'preview', 'regular') then
    raise exception 'Invalid student type.';
  end if;

  if v_student_type = 'preview' and v_phone is null then
    raise exception 'Phone number is required for preview students.';
  end if;

  if v_student_type <> 'preview' and p_classroom_id is not null then
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
    phone = v_phone,
    classroom_id = case when v_student_type = 'preview' then null else p_classroom_id end,
    teacher_id = case
      when v_student_type = 'preview' then null
      else coalesce(v_classroom_teacher_id, p_teacher_id)
    end,
    notes = case
      when v_student_type = 'preview' then null
      else nullif(trim(coalesce(p_notes, '')), '')
    end,
    student_type = v_student_type
  where id = p_student_id;

  perform public.record_admin_activity(
    'student_updated',
    'student',
    p_student_id,
    trim(p_full_name),
    jsonb_build_object(
      'previous_classroom_id', v_previous.classroom_id,
      'new_classroom_id', case when v_student_type = 'preview' then null else p_classroom_id end,
      'previous_teacher_id', v_previous.teacher_id,
      'new_teacher_id', case
        when v_student_type = 'preview' then null
        else coalesce(v_classroom_teacher_id, p_teacher_id)
      end,
      'previous_student_type', v_previous.student_type,
      'new_student_type', v_student_type
    )
  );
end;
$$;

create or replace function public.create_preview_student_records(
  p_students jsonb
)
returns table (
  student_id bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_full_name text;
  v_phone text;
  v_student_id bigint;
  v_actor_teacher_id bigint := public.current_teacher_id();
begin
  if not public.is_admin() then
    raise exception 'Only admins can create preview student records.';
  end if;

  if jsonb_typeof(p_students) <> 'array' then
    raise exception 'Preview students payload must be an array.';
  end if;

  if jsonb_array_length(p_students) = 0 then
    raise exception 'Preview students payload cannot be empty.';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_students)
  loop
    v_full_name := trim(coalesce(v_item ->> 'full_name', ''));
    v_phone := trim(coalesce(v_item ->> 'phone', ''));

    if v_full_name = '' then
      raise exception 'Student full name is required.';
    end if;

    if v_phone = '' then
      raise exception 'Phone number is required for preview students.';
    end if;

    insert into public.students (
      teacher_id,
      classroom_id,
      full_name,
      phone,
      remaining_hours,
      lesson_expiry_date,
      account_fee_expiry_date,
      mirai_club_expiry_date,
      notes,
      is_active,
      student_type
    )
    values (
      null,
      null,
      v_full_name,
      v_phone,
      0,
      current_date,
      current_date,
      current_date,
      null,
      true,
      'preview'
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
      0,
      'Preview student record created.',
      v_actor_teacher_id
    );

    student_id := v_student_id;
    return next;
  end loop;
end;
$$;

revoke all on function public.create_student_record(text, bigint, integer, date, date, date, text, text, text)
  from public, anon;
revoke all on function public.update_student_record(bigint, text, bigint, bigint, text, text, text)
  from public, anon;
revoke all on function public.create_preview_student_records(jsonb)
  from public, anon;

grant execute on function public.create_student_record(text, bigint, integer, date, date, date, text, text, text)
  to authenticated;
grant execute on function public.update_student_record(bigint, text, bigint, bigint, text, text, text)
  to authenticated;
grant execute on function public.create_preview_student_records(jsonb)
  to authenticated;
