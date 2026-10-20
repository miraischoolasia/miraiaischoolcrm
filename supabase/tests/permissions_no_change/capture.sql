-- What every test account sees and may do, one line per check, printed as "n|check|result".
-- Every write is undone at once (inside its own sub-transaction). Scratch database only.
\set ON_ERROR_STOP 1
create table if not exists t.results (n int, check_name text, result text);
truncate t.results;

create or replace function t.as_account(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

-- Runs a statement as the account; returns the row count, or the error text. Always undone.
create or replace function t.try(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare
  v_rows bigint;
  v_out text;
begin
  begin
    perform t.as_account(p_uid);
    execute p_sql;
    get diagnostics v_rows = row_count;
    v_out := 'ok:' || v_rows;
    raise exception 'undo-me';
  exception when others then
    if sqlerrm <> 'undo-me' then
      v_out := 'error:' || sqlerrm;
    end if;
  end;
  execute 'reset role';
  return v_out;
end;
$$;

-- A value as the account (a count or a yes/no). Always undone.
create or replace function t.ask(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare
  v_out text;
begin
  begin
    perform t.as_account(p_uid);
    execute p_sql into v_out;
    raise exception 'undo-me';
  exception when others then
    if sqlerrm <> 'undo-me' then
      v_out := 'error:' || sqlerrm;
    end if;
  end;
  execute 'reset role';
  return v_out;
end;
$$;

grant usage on schema t to authenticated;

do $$
declare
  a record;
  v_module text;
  v_action text;
  v_table text;
  f record;
  v_call text;
begin
  for a in select * from t.accounts order by n loop
    foreach v_module in array array['calendar','classrooms','students','leads','forms','activity','team_replies',
      'inbox','automations','ai_knowledge','videos','questions','app_logins','packages','class_settings','staff_hours'] loop
      foreach v_action in array array['view','edit','delete'] loop
        insert into t.results values (a.n, 'perm ' || v_module || ' ' || v_action,
          t.ask(a.uid, format('select public.has_permission(%L, %L)::text', v_module, v_action)));
      end loop;
    end loop;

    foreach v_table in array array['leads','lead_channels','inbox_chats','inbox_messages','inbox_stickers','whatsapp_numbers',
      'quick_replies','automation_flows','automation_contacts','automation_settings','automation_flow_log','automation_optouts',
      'automation_chat_optouts','automation_queue','ai_knowledge_notes','ai_knowledge_note_versions','ai_drafts','channel_avatars',
      'packages','questions','class_videos','portal_accounts','teachers','classrooms','students','calendar_items',
      'team_reply_days','chat_schedules','forms','form_submissions','people','lead_options','programmes','lead_stages',
      'student_classroom_periods','student_consents','portal_terms_acceptances'] loop
      insert into t.results values (a.n, 'sees ' || v_table, t.ask(a.uid, format('select count(*)::text from public.%I', v_table)));
    end loop;

    insert into t.results values
      (a.n, 'write quick shared', t.try(a.uid, $q$insert into public.quick_replies (title, owner_id) values ('x', null)$q$)),
      (a.n, 'write quick own', t.try(a.uid, format($q$insert into public.quick_replies (title, owner_id) values ('x', %L)$q$, a.uid))),
      (a.n, 'write quick update', t.try(a.uid, $q$update public.quick_replies set title = title || '!'$q$)),
      (a.n, 'write quick delete', t.try(a.uid, $q$delete from public.quick_replies$q$)),
      (a.n, 'write flow insert', t.try(a.uid, $q$insert into public.automation_flows (name, trigger_type) values ('x', 'lead_created')$q$)),
      (a.n, 'write flow update', t.try(a.uid, $q$update public.automation_flows set name = 'y'$q$)),
      (a.n, 'write flow delete', t.try(a.uid, $q$delete from public.automation_flows$q$)),
      (a.n, 'write contact insert', t.try(a.uid, $q$insert into public.automation_contacts (name, phone) values ('x', '60133333333')$q$)),
      (a.n, 'write settings update', t.try(a.uid, $q$update public.automation_settings set paused = paused$q$)),
      (a.n, 'write queue update', t.try(a.uid, $q$update public.automation_queue set message = message$q$)),
      (a.n, 'write queue delete', t.try(a.uid, $q$delete from public.automation_queue$q$)),
      (a.n, 'write optout delete', t.try(a.uid, $q$delete from public.automation_optouts$q$)),
      (a.n, 'write note insert', t.try(a.uid, $q$insert into public.ai_knowledge_notes (title) values ('x')$q$)),
      (a.n, 'write note update', t.try(a.uid, $q$update public.ai_knowledge_notes set title = 'y'$q$)),
      (a.n, 'write note delete', t.try(a.uid, $q$delete from public.ai_knowledge_notes$q$)),
      (a.n, 'write package insert', t.try(a.uid, $q$insert into public.packages (name, kind, class_count, duration_months) values ('x', 'regular', 4, 1)$q$)),
      (a.n, 'write package update', t.try(a.uid, $q$update public.packages set name = 'y'$q$)),
      (a.n, 'write lead insert', t.try(a.uid, $q$insert into public.leads (full_name, phone, source) values ('x', '60144444444', 'other')$q$)),
      (a.n, 'write lead update', t.try(a.uid, $q$update public.leads set full_name = 'y'$q$)),
      (a.n, 'write lead delete', t.try(a.uid, $q$delete from public.leads$q$)),
      (a.n, 'write sticker insert', t.try(a.uid, $q$insert into public.inbox_stickers (path) values ('x/y.webp')$q$)),
      (a.n, 'write calendar item update', t.try(a.uid, $q$update public.calendar_items set title = title$q$)),
      (a.n, 'write classroom update', t.try(a.uid, $q$update public.classrooms set name = name$q$)),
      (a.n, 'write student update', t.try(a.uid, $q$update public.students set full_name = full_name$q$)),
      (a.n, 'can_edit_question', t.ask(a.uid, $q$select public.can_edit_question((select owner_id from public.questions limit 1))::text$q$)),
      (a.n, 'can_manage_class_videos', t.ask(a.uid, $q$select public.can_manage_class_videos(9001)::text$q$)),
      (a.n, 'can_read_inbox', t.ask(a.uid, $q$select public.can_read_inbox(5)::text$q$)),
      (a.n, 'can_view_classes', t.ask(a.uid, $q$select public.can_view_classes()::text$q$)),
      (a.n, 'can_edit_classes', t.ask(a.uid, $q$select public.can_edit_classes()::text$q$));

    -- Every function whose gate this work changes, called with empty arguments: the same error (or "ok") before and after.
    for f in
      select p.oid, p.proname, p.pronargs, p.proretset,
        (select string_agg('null::' || format_type(x, null), ', ' order by o) from unnest(p.proargtypes) with ordinality u(x, o)) as args
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public' and p.proname = any(array[
        'save_age_group', 'save_attendance_status', 'save_program_level', 'save_review_criterion',
        'save_reward_preset', 'save_subject', 'set_attendance_status_points', 'set_attendance_takers',
        'set_calendar_layout', 'set_class_video_settings', 'set_class_videos_per_month', 'set_late_feedback_edit',
        'set_late_reminder_settings', 'set_live_question_settings', 'set_portal_consents', 'set_portal_settings',
        'set_portal_terms', 'set_program_level_flow', 'set_recording_settings', 'set_reward_levels',
        'set_zoom_attendance', 'set_zoom_hosts', 'set_zoom_meeting_options', 'set_zoom_room_rules',
        'set_classroom_recording_library', 'set_classroom_teacher_library', 'save_recording_library',
        'delete_recording_library', 'recording_libraries_list', 'mark_ai_draft_accepted', 'record_ai_draft_sent',
        'automation_flow_stats', 'queue_automation_test', 'run_automation_rules', 'reorder_ai_knowledge_notes',
        'resolve_ai_gap', 'review_ai_example', 'set_ai_report_settings', 'set_account_permissions',
        'inbox_copy_summary', 'chat_schedule_check', 'inbox_copy_fill', 'team_reply_today'])
      order by p.proname, p.oid
    loop
      v_call := case when f.proretset then 'select count(*) from ' else 'select ' end
        || 'public.' || quote_ident(f.proname) || '(' || coalesce(f.args, '') || ')';
      insert into t.results values (a.n, 'call ' || f.proname || '/' || f.pronargs,
        regexp_replace(t.try(a.uid, v_call), 'ok:\d+', 'ok'));
    end loop;
  end loop;
end;
$$;

\copy (select n || '|' || check_name || '|' || coalesce(result, '<null>') from t.results order by n, check_name) to stdout
