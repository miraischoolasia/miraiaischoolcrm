-- School settings: EDUHERO look. Run "node local-test/run.mjs school eduhero" to switch, and start the CRM with
-- "node local-test/run.mjs crm eduhero" (its own name, no fees, no packages page). Same fake data underneath.
-- The student app is set to the game lobby (theme "eduhero") so the lobby and the game-style sign-in can be tried;
-- flip it back to "Classic list" in Class Settings > Student app if you want today's live look.
\set ON_ERROR_STOP on
insert into public.app_settings (key, value) values
  ('crm_branding',    '{"name":"英雄教育CRM","primary":"#fc0c97","primary_dark":"#be185d","mascot_on":true,"student_app_follows":true}'::jsonb),
  ('student_portal',  (coalesce((select value from public.app_settings where key = 'student_portal'), '{}'::jsonb)
                       || '{"school_name":"","accent_color":"#fc0c97","home_style":"lobby","home_theme":"eduhero","support_whatsapp":"60100000001"}'::jsonb)),
  ('student_code',    '{"enabled": true}'),
  ('student_fields',  '{"name_zh": true, "consultant": true, "student_kind": true, "second_parent_phone": true}')
on conflict (key) do update set value = excluded.value;

-- EduHero's second WhatsApp number (the Inbox "Sending from" switcher needs two): a second Chatwoot inbox + number.
insert into public.inbox_channels (chatwoot_inbox_id, kind, label, access, is_active) values (3, 'whatsapp', 'Demo WhatsApp 2', 'open', true)
on conflict (chatwoot_inbox_id) do nothing;
insert into public.whatsapp_numbers (label, phone, chatwoot_inbox_id, evolution_instance, is_active)
select 'Demo WhatsApp 2', '60100000002', 3, 'demo-2', true where not exists (select 1 from public.whatsapp_numbers where chatwoot_inbox_id = 3);
insert into public.whatsapp_number_staff (number_id, teacher_id)
select n.id, t.id from public.whatsapp_numbers n cross join public.teachers t
where n.chatwoot_inbox_id = 3 and t.username in ('staff_test', 'staff2_test') on conflict do nothing;
