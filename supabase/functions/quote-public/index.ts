// The parent's quotation page (?quote=<token>, no login). Its only key is the random token in the link.
//   view    the quotation as the parent may see it (marks it "viewed" the first time)
//   confirm the parent agreed: make the Razorpay payment link once (or give the one made before) and send them there
//   status  for the page after paying: paid yet? (the webhook decides, not this page)
//   pdf     the same as view, for the quotation PDF (staff and parent; does not mark it viewed)
// A bank-transfer quotation (Plan B) shows the school's account instead of a pay button.
//   parent_paid   "我已转账": tells the EC once (it is still the EC who marks it paid, with the receipt)
//   parent_wrong  "资料不对": tells the EC once (the page then opens the contact link)
// No login (verify_jwt = false). Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (Basic auth to Razorpay).

import {
  isPublicToken,
  maskPhone,
  monthsLabel,
  publicStatus,
  type PriceSnapshot,
  type PublicQuotation,
  type QuotationStatus,
} from '../_shared/quotation/logic.ts'
import { addEvent, classTimes, createPaymentLink, json, corsHeaders, loadSettings, paymentsReady, schoolName, serviceClient } from '../_shared/quotation/server.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false }, 405)
  const admin = serviceClient()
  if (!admin) return json({ ok: false, error: 'Not set up.' }, 503)

  let body: { action?: string; token?: unknown; agree?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid request.' }, 400)
  }
  if (!isPublicToken(body.token)) return json({ ok: false, error: 'This link is not valid.' }, 404)

  const { data: q } = await admin.from('quotations').select('*').eq('public_token', body.token).maybeSingle()
  if (!q || q.status === 'draft' || q.status === 'needs_approval') return json({ ok: false, error: 'This link is not valid.' }, 404)
  const status = publicStatus(q.status as QuotationStatus, q.expires_at)
  const settings = await loadSettings(admin)

  if (body.action === 'status') {
    return json({ ok: true, status, paidAt: q.paid_at, total: Number(q.total) })
  }

  if (body.action === 'view' || body.action === 'pdf') {
    if (body.action === 'view' && q.status === 'sent') {
      await admin.from('quotations').update({ status: 'viewed' }).eq('id', q.id).eq('status', 'sent')
      await addEvent(admin, q.id, 'viewed')
    }
    const snapshot = q.price_snapshot as PriceSnapshot
    const { data: classes } = await admin
      .from('quotation_classes')
      .select('subject_code, classroom_id, classrooms(name)')
      .eq('quotation_id', q.id)
    const { data: subjects } = await admin.from('fee_subjects').select('code, label, level')
    const times = await classTimes(admin, (classes ?? []).map((c) => c.classroom_id))
    const start = new Date(`${q.start_date}T00:00:00Z`)
    const view: PublicQuotation = {
      status: status === 'sent' && body.action === 'view' ? 'viewed' : status,
      schoolName: await schoolName(admin),
      childName: q.child_name,
      phone: maskPhone(q.phone),
      classes: (classes ?? []).map((c) => ({
        subject:
          subjects?.find((s) => s.code === c.subject_code && (s.level === q.level || s.level === 'bio_che_phy'))?.label ?? c.subject_code,
        classroom: (c.classrooms as { name?: string } | null)?.name ?? '',
        when: times.get(c.classroom_id) ?? '',
      })),
      months: monthsLabel(start.getUTCFullYear(), start.getUTCMonth() + 1, snapshot.endYear, snapshot.endMonth),
      lines: snapshot.lines.map((line) => ({ label: line.description, amount: line.amount })),
      subtotal: Number(q.subtotal),
      discount: snapshot.discount ? { label: `折扣（${snapshot.discount.reason}）`, amount: snapshot.discount.amount } : null,
      total: Number(q.total),
      expiresAt: q.expires_at,
      terms: settings.terms,
      paidAt: q.paid_at,
      paidMessage: settings.paidMessage,
      receiptNo: q.reference_no,
      paymentRoute: q.payment_route,
      bank: q.payment_route === 'bank_transfer' ? settings.bank : null,
      bankNote: q.payment_route === 'bank_transfer' ? settings.bankNote : '',
      qrUrl:
        q.payment_route === 'bank_transfer' && settings.paymentQr.bank_transfer
          ? admin.storage.from('quotation-public').getPublicUrl(settings.paymentQr.bank_transfer).data.publicUrl
          : null,
      qrPath: q.payment_route === 'bank_transfer' ? settings.paymentQr.bank_transfer : null,
      afterPayUrl: q.after_pay_url ?? null,
      contactUrl: q.contact_url ?? null,
      parentSaidPaid: Boolean(q.parent_said_paid_at),
    }
    return json({ ok: true, quotation: view, paymentsReady: paymentsReady() })
  }

  if (body.action === 'confirm') {
    if (q.payment_route !== 'razorpay') return json({ ok: false, error: '这张报价单请用银行转账付款。' }, 409)
    if (body.agree !== true) return json({ ok: false, error: '请先勾选同意条款。' }, 400)
    if (status === 'paid') return json({ ok: false, error: '这张报价单已经付款了。', status }, 409)
    if (status !== 'sent' && status !== 'viewed' && status !== 'confirmed') {
      return json({ ok: false, error: status === 'expired' ? '这张报价单已经过期，请联系顾问更新。' : '这张报价单已经取消。', status }, 409)
    }
    if (q.rzp_link_url) return json({ ok: true, url: q.rzp_link_url })
    if (!settings.publicBaseUrl) return json({ ok: false, error: 'Payments are not set up yet.' }, 503)
    try {
      const link = await createPaymentLink(
        { id: q.id, publicToken: q.public_token, childName: q.child_name, total: Number(q.total), expiresAt: q.expires_at },
        await schoolName(admin),
        settings.publicBaseUrl,
      )
      // Only one link per quotation, even if the parent pressed twice at once.
      const { data: saved } = await admin
        .from('quotations')
        .update({ status: 'confirmed', rzp_link_id: link.id, rzp_link_url: link.url })
        .eq('id', q.id)
        .is('rzp_link_id', null)
        .select('rzp_link_url')
        .maybeSingle()
      if (!saved) {
        const { data: again } = await admin.from('quotations').select('rzp_link_url').eq('id', q.id).single()
        return json({ ok: true, url: again?.rzp_link_url })
      }
      await addEvent(admin, q.id, 'confirmed')
      await addEvent(admin, q.id, 'link_created', { link_id: link.id, reference: link.referenceId })
      return json({ ok: true, url: link.url })
    } catch (e) {
      // Pressed twice at once: Razorpay refuses the second link (same reference); give the first.
      const { data: again } = await admin.from('quotations').select('rzp_link_url').eq('id', q.id).single()
      if (again?.rzp_link_url) return json({ ok: true, url: again.rzp_link_url })
      return json({ ok: false, error: e instanceof Error && e.message.startsWith('Payments') ? '付款还没开通，请联系顾问。' : '暂时无法建立付款，请稍后再试。' }, 502)
    }
  }

  if (body.action === 'parent_paid' || body.action === 'parent_wrong') {
    const paid = body.action === 'parent_paid'
    if (paid && q.payment_route !== 'bank_transfer') return json({ ok: false, error: '这张报价单请在网上付款。' }, 409)
    if (status === 'paid' || status === 'cancelled') return json({ ok: true, already: true })
    const column = paid ? 'parent_said_paid_at' : 'parent_said_wrong_at'
    // Once per quotation: a second press says thank you and tells nobody again.
    const { data: first } = await admin
      .from('quotations')
      .update({ [column]: new Date().toISOString() })
      .eq('id', q.id)
      .is(column, null)
      .select('id')
      .maybeSingle()
    if (first) {
      await addEvent(admin, q.id, paid ? 'parent_paid' : 'parent_wrong')
      const who = [q.sales_person_id, q.created_by].find((id) => typeof id === 'number')
      if (who) {
        await admin.from('staff_notifications').insert({
          teacher_id: who,
          title: (paid ? `Parent says transferred: ${q.child_name}` : `Parent says the quotation is wrong: ${q.child_name}`).slice(0, 200),
          body: paid
            ? `${q.reference_no} RM${Number(q.total).toFixed(2)}. Check the bank, then Mark as paid with the receipt in the chat's Quotation tab.`
            : `${q.reference_no}: the parent pressed '资料不对'. Reply in the chat and send a new quotation if needed.`,
          lead_id: q.lead_id,
        })
      }
    }
    return json({ ok: true, afterPayUrl: q.after_pay_url ?? null, contactUrl: q.contact_url ?? null })
  }

  return json({ ok: false, error: 'Unknown action.' }, 400)
})
