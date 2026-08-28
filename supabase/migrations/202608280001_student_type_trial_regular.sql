-- Add a trial vs regular student category

alter table public.students
  add column if not exists student_type text not null default 'regular';

alter table public.students
  drop constraint if exists students_student_type_check;

alter table public.students
  add constraint students_student_type_check
  check (student_type = any (array['trial'::text, 'regular'::text]));

create or replace function public.create_student_record(
  p_full_name text,
  p_teacher_id bigint,
  p_initial_hours integer,
  p_lesson_expiry_date date,
  p_account_fee_expiry_date date,
  p_mirai_club_expiry_date date,
  p_notes text,
  p_actor_teacher_id bigint default null,
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
begin
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

  if p_actor_teacher_id is not null and not exists (
    select 1
    from public.teachers
    where id = p_actor_teacher_id
  ) then
    raise exception 'Actor teacher not found.';
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
    p_actor_teacher_id
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
      p_actor_teacher_id
    ),
    (
      v_student_id,
      'account_fee_expiry_updated',
      null,
      p_account_fee_expiry_date,
      'Initial account fee expiry set.',
      p_actor_teacher_id
    ),
    (
      v_student_id,
      'mirai_club_expiry_updated',
      null,
      p_mirai_club_expiry_date,
      'Initial Mirai Club expiry set.',
      p_actor_teacher_id
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
  p_actor_teacher_id bigint default null,
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
    p_actor_teacher_id,
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

grant execute on function public.create_student_record(text, bigint, integer, date, date, date, text, bigint, text)
to anon, authenticated;
grant execute on function public.update_student_record(bigint, text, bigint, bigint, text, bigint, text)
to anon, authenticated;
