-- {child_grade_or_age} in an automation message: the child's grade (Year 3, Form 1) on a school that shows grades,
-- otherwise the child's age. Filled as the message enters the queue, like {link} (zoom_fill_words), so the long
-- flow function stays as it is. When the child is not known, or has neither a grade nor an age, it becomes empty.

create or replace function automation.child_grade_or_age(p_student_id bigint, p_lead_id bigint, p_child_name text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_level smallint;
  v_year smallint;
  v_age integer;
  v_dob date;
  v_children jsonb;
  v_child jsonb;
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_now smallint;
begin
  select coalesce(value ->> 'mode', 'age') into v_mode from public.app_settings where key = 'age_display';
  v_mode := coalesce(v_mode, 'age');

  if p_student_id is not null then
    select s.grade_level, s.grade_year, s.age, s.date_of_birth
    into v_level, v_year, v_age, v_dob
    from public.students s where s.id = p_student_id;
  elsif p_lead_id is not null then
    select l.children into v_children from public.leads l where l.id = p_lead_id;
    if v_children is not null and jsonb_typeof(v_children) = 'array' then
      select c into v_child
      from jsonb_array_elements(v_children) as t(c)
      where lower(btrim(coalesce(c ->> 'name', ''))) = lower(btrim(coalesce(p_child_name, '')))
      limit 1;
      if v_child is null and jsonb_array_length(v_children) = 1 then
        v_child := v_children -> 0;
      end if;
    end if;
    if v_child is not null then
      v_level := nullif(v_child ->> 'gradeLevel', '')::smallint;
      v_year := nullif(v_child ->> 'gradeYear', '')::smallint;
      v_age := nullif(v_child ->> 'age', '')::integer;
    end if;
  end if;

  if v_mode = 'grade' then
    v_now := public.grade_now(v_level, v_year, v_today);
    if v_now is not null then
      return case
        when v_now >= 12 then 'Left school'
        when v_now >= 7 then 'Form ' || (v_now - 6)
        else 'Year ' || v_now
      end;
    end if;
  end if;

  if v_dob is not null then
    return extract(year from age(v_today, v_dob))::integer::text;
  end if;
  return coalesce(v_age::text, '');
exception when others then
  return '';
end;
$$;

create or replace function automation.grade_fill_words()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.message is null or position('{child_grade_or_age}' in new.message) = 0 then
    return new;
  end if;
  new.message := replace(new.message, '{child_grade_or_age}',
    automation.child_grade_or_age(new.student_id, new.lead_id, new.child_name));
  return new;
end;
$$;

drop trigger if exists automation_queue_grade_words on public.automation_queue;
create trigger automation_queue_grade_words
  before insert or update of message on public.automation_queue
  for each row execute function automation.grade_fill_words();

revoke all on function automation.child_grade_or_age(bigint, bigint, text) from public, anon, authenticated;
revoke all on function automation.grade_fill_words() from public, anon, authenticated;
