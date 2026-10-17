-- The student app's terms and conditions, agreed when a parent first signs in.
--
-- The school makes the parent's login (there is no sign-up form), so the
-- first sign-in is the sign-up: before the app opens, the parent reads the
-- school's terms and answers the consent questions (portal_consents), then
-- agrees. Required consents must be ticked to go on. When the school changes
-- the terms, the version goes up and every parent is asked again.
--
-- A child's login is not asked: the parent agrees for the family.

insert into public.app_settings (key, value)
values (
  'portal_terms',
  jsonb_build_object(
    'title', 'Terms and conditions',
    'text', 'This app shows your child''s classes, class links, points, the teacher''s ratings and the package. Keep your login to yourself. The school keeps your child''s records to run the classes and may contact you about them. You can ask the school to see or correct your child''s records at any time.',
    'version', 1
  )
)
on conflict (key) do nothing;

-- Changing the wording asks every parent again (the version goes up);
-- a change to the title alone does not.
create or replace function public.set_portal_terms(p_title text, p_text text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current jsonb;
  v_version integer;
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the terms.';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 80
    or char_length(btrim(coalesce(p_text, ''))) not between 1 and 8000 then
    raise exception 'The terms need a title (up to 80 letters) and their text (up to 8000).';
  end if;
  select value into v_current from public.app_settings where key = 'portal_terms';
  v_version := coalesce((v_current ->> 'version')::integer, 0)
    + case when btrim(p_text) is distinct from (v_current ->> 'text') then 1 else 0 end;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('portal_terms', jsonb_build_object('title', btrim(p_title), 'text', btrim(p_text), 'version', greatest(v_version, 1)),
          timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  return greatest(v_version, 1);
end;
$$;

revoke all on function public.set_portal_terms(text, text) from public, anon;
grant execute on function public.set_portal_terms(text, text) to authenticated;

create table public.portal_terms_acceptances (
  id bigint generated always as identity primary key,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null check (version > 0),
  -- The wording the parent agreed to.
  text_shown text not null,
  accepted_at timestamptz not null default timezone('utc', now()),
  unique (auth_user_id, version)
);

alter table public.portal_terms_acceptances enable row level security;
revoke all on public.portal_terms_acceptances from public, anon, authenticated;
grant select on public.portal_terms_acceptances to authenticated;
grant all on public.portal_terms_acceptances to service_role;

-- Staff who look after students can see who agreed and when.
create policy portal_terms_acceptances_select_staff
  on public.portal_terms_acceptances for select to authenticated
  using (
    (select public.can_view_classes())
    or (select public.has_permission('students'))
    or (select public.current_teacher_id()) is not null
  );

-- What a login must do before the app opens: for a parent who has not agreed
-- to the current terms, the terms and the consent questions.
create or replace function public.portal_onboarding()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_terms jsonb;
  v_consents jsonb;
begin
  if public.current_parent_person_id() is null then
    return jsonb_build_object('needs_terms', false);
  end if;
  select value into v_terms from public.app_settings where key = 'portal_terms';
  if v_terms is null or exists (
    select 1 from public.portal_terms_acceptances a
    where a.auth_user_id = auth.uid() and a.version = (v_terms ->> 'version')::integer
  ) then
    return jsonb_build_object('needs_terms', false);
  end if;
  select value into v_consents from public.app_settings where key = 'portal_consents';
  return jsonb_build_object(
    'needs_terms', true,
    'terms', jsonb_build_object('title', v_terms ->> 'title', 'text', v_terms ->> 'text', 'version', (v_terms ->> 'version')::integer),
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', k.kind,
        'title', coalesce(v_consents -> k.kind ->> 'title', k.kind),
        'text', coalesce(v_consents -> k.kind ->> 'text', ''),
        'required', coalesce((v_consents -> k.kind ->> 'required')::boolean, false)
      ) order by k.ordinality)
      from unnest(array['ai_analysis', 'class_recording']) with ordinality k(kind, ordinality)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.portal_onboarding() from public, anon;
grant execute on function public.portal_onboarding() to authenticated;

-- The parent agrees to the terms shown (that version) and answers each
-- consent, for every one of their children. Required consents must be yes.
create or replace function public.portal_accept_terms(p_version integer, p_consents jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent bigint := public.current_parent_person_id();
  v_terms jsonb;
  v_consents jsonb;
  v_kind text;
  v_granted boolean;
begin
  if v_parent is null then
    raise exception 'Only a parent can agree to the terms.';
  end if;
  select value into v_terms from public.app_settings where key = 'portal_terms';
  if v_terms is null or p_version is distinct from (v_terms ->> 'version')::integer then
    raise exception 'The terms have changed. Please read them again.';
  end if;
  if jsonb_typeof(p_consents) is distinct from 'object' then
    raise exception 'Answer each consent question.';
  end if;
  select value into v_consents from public.app_settings where key = 'portal_consents';

  foreach v_kind in array array['ai_analysis', 'class_recording']
  loop
    if jsonb_typeof(p_consents -> v_kind) is distinct from 'boolean' then
      raise exception 'Answer each consent question.';
    end if;
    v_granted := (p_consents ->> v_kind)::boolean;
    if coalesce((v_consents -> v_kind ->> 'required')::boolean, false) and not v_granted then
      raise exception 'The school needs "%" to use the app.', coalesce(v_consents -> v_kind ->> 'title', v_kind);
    end if;
    insert into public.student_consents (student_id, kind, granted, text_shown, given_by_person_id, given_by_auth_user)
    select c.student_id, v_kind, v_granted, coalesce(v_consents -> v_kind ->> 'text', ''), v_parent, auth.uid()
    from public.portal_children() c;
  end loop;

  insert into public.portal_terms_acceptances (auth_user_id, version, text_shown)
  values (auth.uid(), p_version, coalesce(v_terms ->> 'text', ''))
  on conflict (auth_user_id, version) do nothing;
end;
$$;

revoke all on function public.portal_accept_terms(integer, jsonb) from public, anon;
grant execute on function public.portal_accept_terms(integer, jsonb) to authenticated;
