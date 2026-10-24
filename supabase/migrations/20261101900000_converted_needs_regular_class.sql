-- A lead is Converted only when its child is in a regular class.
--
-- Boss rule (2026-10-23): "Converted" means the child joined a regular class, not "a student record exists".
-- Before, a lead became Converted as soon as a student was made from it (create_student_record) or a student
-- carried its phone number (link_student_to_lead), even with no class at all or only an HOA trial. That left
-- Mirai with Converted leads that were still HOA-only (re-sorted by hand on 2026-10-23).
--
-- Now:
--   * create_student_record  ties the lead to the new student, and moves it to Converted only if the student is
--     in a regular class at that moment (the class given to the form); otherwise the lead keeps its stage.
--   * link_student_to_lead   with the "regular" option means "in a regular class" (was: student_type regular).
--     The option "all" still means every student with the lead's number counts, as before.
--   * a student who is not in a regular class yet, and later joins one (any way: enrol, move, add to a second
--     class), converts the lead that belongs to them: the lead tied to the student, or the lead of the parent
--     the student's family record points to. A closed stay (already ended) does not count.
--   * the school's rule "converted_on_student_phone" is set to "regular" (it was "all"); the school can switch it
--     back in Automations > Stage rules.
-- convert_hoa_student already puts the child in a regular class, so it is unchanged.
-- Both rules still have to be on (converted_on_enrol / converted_on_student_phone), and the Converted stage active.

create or replace function public.student_in_regular_class(p_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_classroom_periods p
    join public.classrooms c on c.id = p.classroom_id
    where p.student_id = p_student_id
      and c.category = 'regular'
      and (p.end_date is null or p.end_date > (timezone('Asia/Kuala_Lumpur', now()))::date)
  );
$$;

revoke all on function public.student_in_regular_class(bigint) from public, anon;
grant execute on function public.student_in_regular_class(bigint) to authenticated, service_role;

-- Same technique as 20261029400000: every version of the function takes its own text, and only the one condition changes.
create or replace function pg_temp.patch_function(p_name text, p_from text, p_to text)
returns void
language plpgsql
as $$
declare
  v_oid oid;
  v_def text;
  v_found boolean := false;
begin
  for v_oid in
    select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = p_name
  loop
    v_def := pg_get_functiondef(v_oid);
    if position(p_to in v_def) > 0 then
      v_found := true;
    elsif position(p_from in v_def) > 0 then
      execute replace(v_def, p_from, p_to);
      v_found := true;
    end if;
  end loop;
  if not v_found then
    raise exception 'The stage line was not found in %.', p_name;
  end if;
end;
$$;

select pg_temp.patch_function(
  'create_student_record',
  $s$set status = case when public.lead_stage_rule_on('converted_on_enrol') then 'converted' else status end, converted_student_id = v_student_id$s$,
  $s$set status = case when public.lead_stage_rule_on('converted_on_enrol') and public.student_in_regular_class(v_student_id) then 'converted' else status end, converted_student_id = v_student_id$s$);

select pg_temp.patch_function(
  'link_student_to_lead',
  $s$or s.student_type = 'regular') then$s$,
  $s$or public.student_in_regular_class(s.id)) then$s$);

-- The school's setting: only students in a regular class convert a lead by their phone number.
update public.lead_stage_rules
set options = jsonb_build_object('students', 'regular'), updated_at = now()
where key = 'converted_on_student_phone'
  and options ->> 'students' = 'all';

-- A student joins a regular class: the lead that belongs to them becomes Converted.
create or replace function public.lead_converted_by_class()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.end_date is not null and new.end_date <= (timezone('Asia/Kuala_Lumpur', now()))::date then
    return new;
  end if;
  if not exists (select 1 from public.classrooms c where c.id = new.classroom_id and c.category = 'regular') then
    return new;
  end if;
  if not public.lead_stage_active('converted') then
    return new;
  end if;

  -- The lead already tied to this student (made from it, or an earlier phone link).
  if public.lead_stage_rule_on('converted_on_enrol') then
    update public.leads
    set status = 'converted'
    where converted_student_id = new.student_id
      and status <> 'converted';
  end if;

  -- The lead of the parent the student's family record belongs to, when that lead has no student yet.
  if public.lead_stage_rule_on('converted_on_student_phone') then
    update public.leads l
    set status = 'converted', converted_student_id = new.student_id
    where l.converted_student_id is null
      and l.id in (
        select pa.lead_id
        from public.people ch
        join public.people pa on pa.id = ch.parent_id
        where ch.student_id = new.student_id and ch.kind = 'student' and pa.lead_id is not null
      );
  end if;

  return new;
end;
$$;

revoke all on function public.lead_converted_by_class() from public, anon, authenticated;

drop trigger if exists student_periods_convert_lead on public.student_classroom_periods;
create trigger student_periods_convert_lead
after insert on public.student_classroom_periods
for each row execute function public.lead_converted_by_class();
