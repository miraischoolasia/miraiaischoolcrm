-- Checks for 20261031100000_quotations.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/quotations.sql
-- Department 3's enrol_paid_quotation (20261031200000) is replaced here by a stand-in, so this tests only the
-- quotation side: paid once, enrolled once, a failure kept and tried again.

begin;

create function pg_temp.fails(p_sql text, p_pattern text, p_name text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then
      raise notice 'PASS % [%]', p_name, sqlerrm;
      return;
    end if;
    raise exception 'FAIL % (wrong error: %)', p_name, sqlerrm;
  end;
  raise exception 'FAIL % (no error)', p_name;
end;
$$;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

-- 1 admin, 2 EC (quotations edit), 3 LC (no tick), 4 staff with nothing.
insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000004' || lpad(n::text, 2, '0'))::uuid, 'quote' || n || '@mirai.internal',
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 4) n;

insert into public.teachers (id, full_name, username, role, is_active, auth_user_id, permissions)
overriding system value
values
  (9401, 'Quote Admin', 'quote_admin', 'admin', true, '00000000-0000-0000-0000-000000000401', '{}'),
  (9402, 'Quote EC', 'quote_ec', 'staff', true, '00000000-0000-0000-0000-000000000402', '{"quotations": {"level": "edit"}}'),
  (9403, 'Quote LC', 'quote_lc', 'staff', true, '00000000-0000-0000-0000-000000000403', '{}'),
  (9404, 'Quote None', 'quote_none', 'staff', true, '00000000-0000-0000-0000-000000000404', '{}');

insert into public.classrooms (id, name, age_group, program_level, teacher_id) overriding system value values
  (9481, 'Quote Math P4', '9-11 Years Old', 'Coder Foundation', 9401);
insert into public.leads (id, full_name, phone, status) overriding system value values (99481, 'Quote Parent', '60123459481', 'new');

create function pg_temp.as_user(p_n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004' || lpad(p_n::text, 2, '0'), true);
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000004' || lpad(p_n::text, 2, '0'), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function pg_temp.as_user(int) to authenticated;
grant execute on function pg_temp.ok(boolean, text) to authenticated;
grant execute on function pg_temp.fails(text, text, text) to authenticated;

-- The tick and the settings.
select pg_temp.ok(public.valid_account_permissions('{"quotations": {"level": "edit", "delete": true}}'), 'quotations edit + approve is a valid tick');
select pg_temp.ok(not public.valid_account_permissions('{"quotations": {"level": "view", "scope": "own"}}'), 'quotations has no "whose" scope');
select pg_temp.ok(public.valid_account_permissions('{"quality": {"level": "view"}, "fee_calculator": {"level": "edit"}}'), 'the older ticks are still valid');
select pg_temp.ok((select value ->> 'enabled' = 'false' and (value ->> 'expiryDays')::int = 3 from public.app_settings where key = 'quotations'), 'off, 3 days, until the school switches it on');
select pg_temp.ok((select value -> 'paymentRoutes' = '["bank_transfer"]'::jsonb and value ->> 'bankReview' = 'false' from public.app_settings where key = 'quotations'), 'bank transfer only, no admin re-check, by default');

-- A sent quotation (written by the quotation edge function with the service role).
insert into public.quotations (id, public_token, status, lead_id, phone, child_name, child_age, cohort_id, level, region,
  enrol_method, rate_tier, months, start_date, registration_month, subjects, payment_mode, region_option, fee_month,
  price_snapshot, subtotal, total, expires_at, sales_person_id, consultant_id, reference_no, payment_route, rzp_link_id, created_by)
values ('11111111-2222-3333-4444-555555555555', repeat('A', 43), 'confirmed', 99481, '60123459481', 'Quote Child', 10,
  (select id from public.fee_cohorts where membership_name = '26002'), 'primary', 'west_malaysia', '每月报名', 'monthly', 1,
  '2026-11-01', 11, '["BMP","BMK","MM"]', '一次性付款', '西马', 11, '{"total": 255}', 255, 255, now() + interval '3 days',
  9402, 9403, 'Q-111111112222', 'razorpay', 'plink_test_1', 9402);
insert into public.quotation_classes (quotation_id, subject_code, classroom_id) values ('11111111-2222-3333-4444-555555555555', 'MM', 9481);

select pg_temp.fails($$insert into public.quotations (reference_no, public_token, child_name, cohort_id, level, region, enrol_method, rate_tier, months, start_date, subtotal, total)
  values ('Q-AAAAAAAAAAA1', 'short', 'X', 1, 'primary', 'west_malaysia', 'x', 'monthly', 1, '2026-11-01', 1, 1)$$, 'public_token', 'a token is long and random');
select pg_temp.fails($$insert into public.quotations (reference_no, public_token, child_name, cohort_id, level, region, enrol_method, rate_tier, months, start_date, subtotal, total)
  values ('Q-AAAAAAAAAAA2', repeat('B', 43), 'X', (select id from public.fee_cohorts limit 1), 'primary', 'west_malaysia', 'x', 'monthly', 1, '2026-11-03', 1, 1)$$, 'start_date', 'a quotation starts on the 1st');
select pg_temp.fails($$insert into public.quotations (reference_no, public_token, child_name, cohort_id, level, region, enrol_method, rate_tier, months, start_date, subtotal, total)
  values ('Q-AAAAAAAAAAA3', repeat('C', 43), 'X', (select id from public.fee_cohorts limit 1), 'primary', 'west_malaysia', 'x', 'monthly', 1, '2026-11-01', 0.5, 0.5)$$, 'total', 'Razorpay needs at least RM1');

-- Who reads.
set local role authenticated;
select pg_temp.as_user(4);
select pg_temp.ok((select count(*) = 0 from public.quotations), 'no tick: no quotations');
select pg_temp.fails($$select count(*) from public.payment_webhook_events$$, 'permission denied', 'staff never read Razorpay payloads');
select pg_temp.fails($$select public.mark_quotation_paid('11111111-2222-3333-4444-555555555555', 'pay_x', 'fpx', 25500, null)$$, 'permission denied', 'staff cannot mark a quotation paid');
select pg_temp.fails($$select public.quotation_after_payment('11111111-2222-3333-4444-555555555555')$$, 'permission denied', 'staff cannot run the enrolment');
select pg_temp.fails($$update public.quotations set total = 1$$, 'permission denied', 'nobody changes a price directly');
select pg_temp.fails($$select public.set_quotation_settings('{"enabled": true}')$$, 'only admin', 'only admin changes the settings');
select pg_temp.as_user(2);
select pg_temp.ok((select count(*) = 1 from public.quotations), 'the EC reads quotations');
select pg_temp.ok((select count(*) = 1 from public.quotation_classes), '... and their classes');
select pg_temp.as_user(1);
select public.set_quotation_settings('{"enabled": true, "expiryDays": 5}');
select pg_temp.ok((select value ->> 'enabled' = 'true' from public.app_settings where key = 'quotations'), 'admin switches it on');
reset role;

set local role anon;
select pg_temp.fails($$select count(*) from public.quotations$$, 'permission denied', 'parents (anon) read no table');
reset role;

-- Paid: without department 3's function yet, the quotation is paid, enrolling fails, and that is kept and told.
set local role service_role;
select pg_temp.ok(public.mark_quotation_paid('11111111-2222-3333-4444-555555555555', 'pay_test_1', 'fpx', 25500, null), 'marked paid');
select pg_temp.ok(not public.mark_quotation_paid('11111111-2222-3333-4444-555555555555', 'pay_test_1', 'fpx', 25500, null), 'the same payment again does nothing');
select pg_temp.ok((select status = 'paid' and paid_amount = 255 and fulfil_status = 'pending' from public.quotations where id = '11111111-2222-3333-4444-555555555555'), 'paid RM255, waiting to enrol');
reset role;

-- A stand-in for department 3's function that fails once.
create or replace function public.enrol_paid_quotation(p_quotation_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Class 9481 is full (stand-in failure).';
end;
$$;
grant execute on function public.enrol_paid_quotation(uuid) to service_role;

set local role service_role;
select pg_temp.ok((select (public.quotation_after_payment('11111111-2222-3333-4444-555555555555') ->> 'ok')::boolean = false), 'a failed enrolment says so');
reset role;
select pg_temp.ok((select fulfil_status = 'failed' and fulfil_error like '%stand-in failure%' from public.quotations where id = '11111111-2222-3333-4444-555555555555'), 'the reason is kept on the quotation');
select pg_temp.ok((select count(*) = 3 from public.staff_notifications where title like 'Paid but not enrolled%' and teacher_id in (9401, 9402, 9403)), 'the EC, the LC and the admin are told');

-- The stand-in now works (a student made once): Run again enrols, a third run does nothing.
insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values (99482, 'Quote Child', 0, '2099-12-31', '2099-12-31', '2099-12-31');
create or replace function public.enrol_paid_quotation(p_quotation_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_student bigint;
begin
  select student_id into v_student from public.quotations where id = p_quotation_id for update;
  if v_student is not null then
    return jsonb_build_object('student_id', v_student, 'already', true);
  end if;
  update public.quotations set student_id = 99482 where id = p_quotation_id;
  return jsonb_build_object('student_id', 99482, 'already', false, 'created', true);
end;
$$;

set local role service_role;
select pg_temp.ok((select (public.quotation_after_payment('11111111-2222-3333-4444-555555555555') ->> 'ok')::boolean), 'Run again enrols');
select pg_temp.ok((select (public.quotation_after_payment('11111111-2222-3333-4444-555555555555') ->> 'already')::boolean), 'a third run does nothing');
reset role;
select pg_temp.ok((select fulfil_status = 'done' and student_id = 99482 and fulfil_error is null from public.quotations where id = '11111111-2222-3333-4444-555555555555'), 'done, with the student');
select pg_temp.ok((select count(*) = 1 from public.quotation_events where kind = 'fulfilled'), 'one fulfilled event');
-- Being paid is told by department 3's enrol_paid_quotation (once): this wrapper adds nothing.
select pg_temp.ok((select count(*) = 0 from public.staff_notifications where title like 'Paid: %'), 'the wrapper does not tell it is paid a second time');

-- A wrong amount: paid, kept for a person, never enrolled automatically.
insert into public.quotations (id, reference_no, public_token, status, child_name, cohort_id, level, region, enrol_method, rate_tier,
  months, start_date, subtotal, total, sales_person_id)
values ('22222222-2222-3333-4444-555555555555', 'Q-222222222222', repeat('D', 43), 'confirmed', 'Odd Child',
  (select id from public.fee_cohorts limit 1), 'primary', 'west_malaysia', '每月报名', 'monthly', 1, '2026-11-01', 100, 100, 9402);
set local role service_role;
select public.mark_quotation_paid('22222222-2222-3333-4444-555555555555', 'pay_test_2', 'card', 9000, 'Paid RM90.00, the quotation is RM100.00.');
select pg_temp.ok((select (public.quotation_after_payment('22222222-2222-3333-4444-555555555555') ->> 'ok')::boolean = false), 'a payment to check is not enrolled');
reset role;
select pg_temp.ok((select fulfil_status = 'check' and student_id is null from public.quotations where id = '22222222-2222-3333-4444-555555555555'), 'kept as "check"');
select pg_temp.ok((select count(*) >= 2 from public.staff_notifications where title = 'Payment to check: Odd Child'), 'the EC and the admin are told to check');

-- Webhook events are kept once.
insert into public.payment_webhook_events (event_id, event, payload) values ('evt_1', 'payment_link.paid', '{}');
with again as (
  insert into public.payment_webhook_events (event_id, event, payload) values ('evt_1', 'payment_link.paid', '{}')
  on conflict (event_id) do nothing returning 1
)
select pg_temp.ok((select count(*) = 0 from again), 'the same Razorpay event twice is kept once');

-- Plan B: bank transfer.
select pg_temp.ok((select payment_route = 'bank_transfer' from public.quotations where id = '22222222-2222-3333-4444-555555555555'), 'a quotation is a bank transfer unless said otherwise');
select pg_temp.fails($$insert into public.quotations (reference_no, public_token, child_name, cohort_id, level, region, enrol_method, rate_tier, months, start_date, subtotal, total, payment_route)
  values ('Q-AAAAAAAAAAA4', repeat('E', 43), 'X', (select id from public.fee_cohorts limit 1), 'primary', 'west_malaysia', 'x', 'monthly', 1, '2026-11-01', 1, 1, 'cash')$$, 'payment_route', 'only razorpay or bank_transfer');
select pg_temp.fails($$insert into public.quotations (reference_no, public_token, child_name, cohort_id, level, region, enrol_method, rate_tier, months, start_date, subtotal, total)
  values ('Q-111111112222', repeat('F', 43), 'X', (select id from public.fee_cohorts limit 1), 'primary', 'west_malaysia', 'x', 'monthly', 1, '2026-11-01', 1, 1)$$, 'reference_no', 'a quotation number is used once');
select pg_temp.ok((select not public and file_size_limit = 10485760 from storage.buckets where id = 'quotation-payments'), 'receipts bucket is private, 10 MB');
set local role authenticated;
select pg_temp.as_user(4);
select pg_temp.fails($$insert into storage.objects (bucket_id, name, owner) values ('quotation-payments', 'x/receipt.pdf', auth.uid())$$, 'row-level security', 'no tick: cannot upload a receipt');
select pg_temp.as_user(2);
insert into storage.objects (bucket_id, name, owner) values ('quotation-payments', '11111111-2222-3333-4444-555555555555/receipt.pdf', auth.uid());
select pg_temp.ok((select count(*) = 1 from storage.objects where bucket_id = 'quotation-payments'), 'the EC uploads and sees the receipt');
select pg_temp.as_user(4);
select pg_temp.ok((select count(*) = 0 from storage.objects where bucket_id = 'quotation-payments'), 'no tick: cannot see receipts');
reset role;

rollback;
