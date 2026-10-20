-- School settings: MIRAI look (the default). Run again any time to switch back from EduHero.
-- The CRM's own name/colours/fees come from the VITE_BRAND_* settings (node local-test/run.mjs crm mirai);
-- this file sets what lives in the database: the Brand tab, the student app and the student-code switches.
\set ON_ERROR_STOP on
insert into public.app_settings (key, value) values
  ('crm_branding',    '{}'::jsonb),
  ('student_portal',  (coalesce((select value from public.app_settings where key = 'student_portal'), '{}'::jsonb)
                       || '{"school_name":"Mirai AI School","accent_color":"#fc0c97","home_style":"classic","home_theme":"","support_whatsapp":"60100000001"}'::jsonb)),
  ('student_code',    '{"enabled": false}'),
  ('student_fields',  '{"name_zh": false, "consultant": false, "student_kind": false, "second_parent_phone": false}')
on conflict (key) do update set value = excluded.value;
-- switching back to the Mirai look: only one WhatsApp number
delete from public.whatsapp_numbers where chatwoot_inbox_id = 3;
delete from public.inbox_channels where chatwoot_inbox_id = 3;
