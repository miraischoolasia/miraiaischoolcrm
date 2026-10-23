// Quotations, for staff (the Inbox's Quotation tab). The price is worked out here, from the price tables as they are
// now, with the Fee Calculator's maths (unchanged) and kept on the quotation: what the parent sees and pays.
//   send     make a quotation and give the parent's link (or wait for approval when the discount is over the cap)
//   approve  allow a big discount (Quotations tick with delete)
//   cancel   cancel it, and its Razorpay link
//   renew    a new quotation with the same choices at today's prices (after it expired or was cancelled)
//   retry    run the after-payment steps again (enrol, login, receipt) when one failed
//   mark_paid  Plan B: the EC confirms the parent's bank transfer with the receipt; then the same after-payment steps
// Login: the staff member's (verify_jwt default). Secrets: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET (cancel only).

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import {
  afterPayUrlFor,
  bankReady,
  contactUrlFor,
  checkBankPayment,
  discountNeedsApproval,
  newPublicToken,
  referenceFor,
  toSen,
  priceQuotation,
  quoteUrl,
  startDateOf,
  type DiscountInput,
  type BankPaymentInput,
  type PaymentRoute,
  type QuotationChoices,
  type QuotationSettings,
} from '../_shared/quotation/logic.ts'
import { addEvent, afterPayment, cancelPaymentLink, corsHeaders, json, loadPriceBook, loadSettings, serviceClient } from '../_shared/quotation/server.ts'

export type QuotationDraft = {
  leadId: number | null
  conversationId: number | null
  contactId: number | null
  inboxId: number | null
  phone: string | null
  childName: string
  childAge: number | null
  ageGroup: string | null
  choices: QuotationChoices
  classes: { subjectCode: string; classroomId: number }[]
  consultantId: number | null
  // Bank transfer (Plan B) or Razorpay; the school's first allowed one when not given.
  paymentRoute?: PaymentRoute
  // The total the page showed: a different total here means the prices changed meanwhile.
  expectTotal: number | null
}

async function approvers(admin: SupabaseClient): Promise<number[]> {
  const { data } = await admin.from('teachers').select('id, role, effective_permissions').eq('is_active', true)
  return (data ?? [])
    .filter((t) => {
      const tick = (t.effective_permissions as Record<string, { level?: string; delete?: boolean }> | null)?.quotations
      return t.role === 'admin' || (tick?.level === 'edit' && tick.delete === true)
    })
    .map((t) => t.id)
}

async function notify(admin: SupabaseClient, teacherIds: number[], title: string, body: string, leadId: number | null) {
  const rows = [...new Set(teacherIds)].map((teacherId) => ({ teacher_id: teacherId, title: title.slice(0, 200), body: body.slice(0, 1000), lead_id: leadId }))
  if (rows.length > 0) await admin.from('staff_notifications').insert(rows)
}

function expiry(settings: QuotationSettings): string {
  return new Date(Date.now() + settings.expiryDays * 86_400_000).toISOString()
}

// Checks the draft against the school's classes and staff, prices it and writes it. Returns the reply.
async function makeQuotation(admin: SupabaseClient, draft: QuotationDraft, settings: QuotationSettings, teacherId: number, renewOf: string | null) {
  const childName = (draft.childName ?? '').trim()
  if (!childName || childName.length > 120) return json({ ok: false, error: 'Write the child’s name.' }, 400)
  const choices = draft.choices
  const codes = [...(choices.subjects ?? []), ...(choices.bioChePhy ?? [])]
  const classes = draft.classes ?? []
  const missing = codes.find((code) => !classes.some((c) => c.subjectCode === code))
  if (missing) return json({ ok: false, error: `Pick a class for ${missing}.` }, 400)
  const classIds = [...new Set(classes.filter((c) => codes.includes(c.subjectCode)).map((c) => c.classroomId))]
  const { data: rooms } = await admin.from('classrooms').select('id, status, category').in('id', classIds)
  const badRoom = classIds.find((id) => !(rooms ?? []).some((r) => r.id === id && r.status === 'active' && r.category === 'regular'))
  if (badRoom) return json({ ok: false, error: 'One of the classes is not an open regular class.' }, 400)
  if (settings.lcRule === 'ec_picks' && !draft.consultantId) return json({ ok: false, error: 'Pick the Learning Consultant.' }, 400)
  if (draft.consultantId) {
    const { data: lc } = await admin.from('teachers').select('id').eq('id', draft.consultantId).eq('is_active', true).maybeSingle()
    if (!lc) return json({ ok: false, error: 'That Learning Consultant is not an active staff member.' }, 400)
  }

  const route: PaymentRoute = draft.paymentRoute ?? settings.paymentRoutes[0]
  if (!settings.paymentRoutes.includes(route)) return json({ ok: false, error: 'This school does not take that way of paying.' }, 400)
  if (route === 'bank_transfer' && !bankReady(settings)) return json({ ok: false, error: 'Write the school’s bank account in Quotation settings first.' }, 400)

  const book = await loadPriceBook(admin)
  const priced = priceQuotation(choices, book, settings)
  if (!priced.snapshot) return json({ ok: false, error: priced.error }, 400)
  const snapshot = priced.snapshot
  if (draft.expectTotal !== null && draft.expectTotal !== undefined && Math.abs(draft.expectTotal - snapshot.total) > 0.004) {
    return json({ ok: false, error: `The prices changed: the total is now RM${snapshot.total.toFixed(2)}. Check it and send again.`, total: snapshot.total }, 409)
  }
  const discount: DiscountInput | null = snapshot.discount
  const needsApproval = discountNeedsApproval(snapshot.subtotal, discount?.amount ?? 0, settings)
  const status = needsApproval ? 'needs_approval' : 'sent'

  const id = crypto.randomUUID()
  // §15: where the parent goes after paying and where '资料不对' goes, as they are now (kept on the quotation).
  const [{ data: ecLink }, { data: chatNumber }] = await Promise.all([
    admin.from('quotation_staff_links').select('after_pay_url, contact_url').eq('teacher_id', teacherId).maybeSingle(),
    draft.inboxId
      ? admin.from('whatsapp_numbers').select('phone').eq('chatwoot_inbox_id', draft.inboxId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const { data: row, error } = await admin
    .from('quotations')
    .insert({
      id,
      reference_no: referenceFor(id),
      payment_route: route,
      public_token: newPublicToken(),
      status,
      lead_id: draft.leadId,
      conversation_id: draft.conversationId,
      contact_id: draft.contactId,
      inbox_id: draft.inboxId,
      phone: draft.phone && /^[0-9]{8,15}$/.test(draft.phone) ? draft.phone : null,
      child_name: childName,
      child_age: draft.childAge,
      age_group: draft.ageGroup,
      cohort_id: choices.cohortId,
      level: choices.level,
      region: choices.region,
      enrol_method: choices.enrolMethod,
      rate_tier: snapshot.rateTier,
      months: snapshot.months,
      start_date: startDateOf(choices.startYear, choices.startMonth),
      registration_month: choices.registrationMonth,
      subjects: choices.subjects,
      bio_che_phy: choices.bioChePhy,
      payment_mode: settings.paymentModeName,
      region_option: settings.regionNames[choices.region],
      fee_month: choices.registrationMonth ?? choices.startMonth,
      discount_kind: discount?.kind ?? null,
      discount_value: discount?.value ?? null,
      discount_reason: discount?.reason ?? null,
      discount_note: discount?.note ?? null,
      price_snapshot: snapshot,
      subtotal: snapshot.subtotal,
      discount_amount: discount?.amount ?? 0,
      total: snapshot.total,
      expires_at: needsApproval ? null : expiry(settings),
      sales_person_id: teacherId,
      consultant_id: draft.consultantId,
      created_by: teacherId,
      after_pay_url: afterPayUrlFor(ecLink?.after_pay_url, settings),
      contact_url: contactUrlFor({ ecContact: ecLink?.contact_url, chatNumber: chatNumber?.phone, reference: referenceFor(id) }, settings),
    })
    .select('id, public_token, status, total')
    .single()
  if (error || !row) return json({ ok: false, error: error?.message ?? 'Could not save the quotation.' }, 500)
  const classRows = classes.filter((c) => codes.includes(c.subjectCode)).map((c) => ({ quotation_id: row.id, subject_code: c.subjectCode, classroom_id: c.classroomId }))
  const { error: classError } = await admin.from('quotation_classes').insert(classRows)
  if (classError) {
    await admin.from('quotations').delete().eq('id', row.id)
    return json({ ok: false, error: classError.message }, 500)
  }
  await addEvent(admin, row.id, renewOf ? 'renewed' : 'created', renewOf ? { from: renewOf } : {}, teacherId)
  if (needsApproval) {
    await notify(admin, await approvers(admin), `Discount to approve: ${childName}`, `RM${discount!.amount.toFixed(2)} off RM${snapshot.subtotal.toFixed(2)} (${discount!.reason}). Open the chat's Quotation tab to approve.`, draft.leadId)
  } else {
    await addEvent(admin, row.id, 'sent', {}, teacherId)
  }
  return json({
    ok: true,
    id: row.id,
    status: row.status,
    total: Number(row.total),
    invoiceText: snapshot.invoiceText,
    url: needsApproval || !settings.publicBaseUrl ? null : quoteUrl(settings.publicBaseUrl, row.public_token),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const admin = serviceClient()
  const authHeader = req.headers.get('Authorization')
  if (!supabaseUrl || !anonKey || !admin) return json({ ok: false, error: 'Not set up.' }, 503)
  if (!authHeader) return json({ ok: false, error: 'Missing authorization.' }, 401)

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const [{ data: mayEdit }, { data: mayApprove }, { data: teacherId }] = await Promise.all([
    caller.rpc('has_permission', { p_module: 'quotations', p_action: 'edit' }),
    caller.rpc('has_permission', { p_module: 'quotations', p_action: 'delete' }),
    caller.rpc('current_teacher_id'),
  ])
  if (mayEdit !== true || typeof teacherId !== 'number') return json({ ok: false, error: 'Only staff who may make quotations can do this.' }, 403)

  let body: { action?: string; draft?: QuotationDraft; id?: string; payment?: BankPaymentInput }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400)
  }
  const settings = await loadSettings(admin)
  if (!settings.enabled) return json({ ok: false, error: 'Quotations are switched off at this school.' }, 403)

  if (body.action === 'send') {
    if (!body.draft) return json({ ok: false, error: 'Nothing to send.' }, 400)
    try {
      return await makeQuotation(admin, body.draft, settings, teacherId, null)
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500)
    }
  }

  const { data: q } = await admin.from('quotations').select('*').eq('id', body.id ?? '').maybeSingle()
  if (!q) return json({ ok: false, error: 'Quotation not found.' }, 404)

  if (body.action === 'approve') {
    if (mayApprove !== true) return json({ ok: false, error: 'Only an admin or a supervisor may approve a big discount.' }, 403)
    if (q.status !== 'needs_approval') return json({ ok: false, error: 'This quotation is not waiting for approval.' }, 409)
    await admin
      .from('quotations')
      .update({ status: 'sent', discount_approved_by: teacherId, discount_approved_at: new Date().toISOString(), expires_at: expiry(settings) })
      .eq('id', q.id)
    await addEvent(admin, q.id, 'approved', {}, teacherId)
    await addEvent(admin, q.id, 'sent', {}, teacherId)
    if (q.created_by) await notify(admin, [q.created_by], `Discount approved: ${q.child_name}`, 'Open the chat’s Quotation tab to send the link.', q.lead_id)
    return json({ ok: true, url: settings.publicBaseUrl ? quoteUrl(settings.publicBaseUrl, q.public_token) : null })
  }

  if (body.action === 'cancel') {
    if (q.created_by !== teacherId && mayApprove !== true) return json({ ok: false, error: 'Only the person who made it (or a supervisor) can cancel it.' }, 403)
    if (q.status === 'paid') return json({ ok: false, error: 'It is paid: refund it in Razorpay instead.' }, 409)
    if (q.rzp_link_id) await cancelPaymentLink(q.rzp_link_id)
    await admin.from('quotations').update({ status: 'cancelled' }).eq('id', q.id).neq('status', 'paid')
    await addEvent(admin, q.id, 'cancelled', {}, teacherId)
    return json({ ok: true })
  }

  if (body.action === 'renew') {
    if (q.status !== 'expired' && q.status !== 'cancelled' && !(q.expires_at && new Date(q.expires_at) <= new Date() && q.status !== 'paid')) {
      return json({ ok: false, error: 'Only an expired or cancelled quotation can be renewed.' }, 409)
    }
    const { data: classes } = await admin.from('quotation_classes').select('subject_code, classroom_id').eq('quotation_id', q.id).order('id')
    const start = new Date(`${q.start_date}T00:00:00Z`)
    const draft: QuotationDraft = {
      leadId: q.lead_id,
      conversationId: q.conversation_id,
      contactId: q.contact_id,
      inboxId: q.inbox_id,
      phone: q.phone,
      childName: q.child_name,
      childAge: q.child_age,
      ageGroup: q.age_group,
      choices: {
        cohortId: q.cohort_id,
        level: q.level,
        region: q.region,
        enrolMethod: q.enrol_method,
        startYear: start.getUTCFullYear(),
        startMonth: start.getUTCMonth() + 1,
        registrationMonth: q.registration_month,
        subjects: q.subjects,
        bioChePhy: q.bio_che_phy,
        discount: q.discount_kind ? { kind: q.discount_kind, value: Number(q.discount_value), reason: q.discount_reason ?? '', note: q.discount_note } : null,
      },
      classes: (classes ?? []).map((c) => ({ subjectCode: c.subject_code, classroomId: c.classroom_id })),
      consultantId: q.consultant_id,
      paymentRoute: settings.paymentRoutes.includes(q.payment_route) ? q.payment_route : undefined,
      expectTotal: null,
    }
    if (q.status !== 'cancelled' && q.status !== 'expired') await admin.from('quotations').update({ status: 'expired' }).eq('id', q.id)
    return await makeQuotation(admin, draft, settings, teacherId, q.id)
  }

  if (body.action === 'mark_paid') {
    // Plan B: the parent paid by bank transfer; the EC confirms it with the receipt they uploaded.
    if (q.payment_route !== 'bank_transfer') return json({ ok: false, error: 'This quotation is paid on Razorpay, not by bank transfer.' }, 409)
    if (q.status === 'paid') return json({ ok: false, error: 'It is already marked paid.' }, 409)
    if (!['sent', 'viewed', 'confirmed', 'expired'].includes(q.status)) return json({ ok: false, error: 'Only a sent quotation can be marked paid.' }, 409)
    const payment = body.payment ?? { paidOn: '', amount: 0, reference: null, note: null, proofPath: null }
    // Today in Malaysia (UTC+8), for "not in the future".
    const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
    const checked = checkBankPayment(payment, Number(q.total), today)
    if (!checked.ok) return json({ ok: false, error: checked.errors.join(' ') }, 400)
    // The receipt must be the one uploaded for this quotation.
    const proofName = (payment.proofPath ?? '').startsWith(`${q.id}/`) ? payment.proofPath!.slice(q.id.length + 1) : ''
    const { data: files } = await admin.storage.from('quotation-payments').list(q.id, { search: proofName })
    if (!proofName || !(files ?? []).some((f) => f.name === proofName)) return json({ ok: false, error: 'The receipt was not uploaded. Add it again.' }, 400)

    const review = settings.bankReview ? 'Bank transfer waiting for an admin to check the receipt.' : null
    const { data: marked, error } = await admin.rpc('mark_quotation_paid', {
      p_quotation_id: q.id,
      p_payment_id: null,
      p_method: 'bank_transfer',
      p_amount_sen: toSen(payment.amount),
      p_check_reason: review,
    })
    if (error) return json({ ok: false, error: error.message }, 500)
    if (marked !== true) return json({ ok: false, error: 'It is already marked paid.' }, 409)
    await admin
      .from('quotations')
      .update({
        bank_paid_on: payment.paidOn,
        bank_reference: payment.reference?.trim() || null,
        payment_proof_path: payment.proofPath,
        payment_note: payment.note?.trim() || null,
        confirmed_by: teacherId,
      })
      .eq('id', q.id)
    if (checked.amountDiffers) {
      await addEvent(admin, q.id, 'check', { amount_differs: payment.amount, total: Number(q.total), note: payment.note }, teacherId)
      await notify(admin, await approvers(admin), `Amount differs: ${q.child_name}`, `RM${payment.amount.toFixed(2)} received for a RM${Number(q.total).toFixed(2)} quotation (${q.reference_no}). Reason: ${payment.note}`, q.lead_id)
    }
    if (review) return json({ ok: true, waiting: true })
    const result = await afterPayment(admin, q.id)
    return json(result, result.ok ? 200 : 500)
  }

  if (body.action === 'retry') {
    if (q.status !== 'paid') return json({ ok: false, error: 'It is not paid.' }, 409)
    if (q.fulfil_status === 'check') {
      // A person looked at a payment to check and says go ahead.
      if (mayApprove !== true) return json({ ok: false, error: 'Only an admin or a supervisor may enrol a payment that needed checking.' }, 403)
      await admin.from('quotations').update({ fulfil_status: 'pending', fulfil_error: null }).eq('id', q.id)
      await addEvent(admin, q.id, 'approved', { check: q.fulfil_error }, teacherId)
    }
    const result = await afterPayment(admin, q.id)
    return json(result, result.ok ? 200 : 500)
  }

  return json({ ok: false, error: 'Unknown action.' }, 400)
})
