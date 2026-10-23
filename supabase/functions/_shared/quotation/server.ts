// Database and Razorpay helpers of the three quotation functions (quotation, quote-public, razorpay-webhook).
// Deno only. The rules themselves are in logic.ts (tested with the CRM's tests).

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import type { CycleTier, GlobalRates, InvoiceTemplate } from '../feeCalculator/types.ts'
import { DEFAULT_INVOICE_TEMPLATE } from '../feeCalculator/types.ts'
import type { FeeLevel, FeeTrack } from '../feeCalculator/quote.ts'
import {
  classTimeLabel,
  paymentLinkBody,
  readQuotationSettings,
  receiptPdf,
  receiptRows,
  type PriceBook,
  type PriceSnapshot,
  type QuotationSettings,
} from './logic.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
}

export function serviceClient(): SupabaseClient | null {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
}

// The school's name for the parent's page and the receipt (the CRM's brand setting, else the function's SCHOOL_NAME).
export async function schoolName(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.rpc('crm_branding')
  const name = (data as { name?: unknown } | null)?.name
  return typeof name === 'string' && name.trim() ? name.trim() : (Deno.env.get('SCHOOL_NAME') ?? 'School')
}

export async function loadSettings(admin: SupabaseClient): Promise<QuotationSettings> {
  const { data } = await admin.from('app_settings').select('value').eq('key', 'quotations').maybeSingle()
  return readQuotationSettings(data?.value ?? null)
}

// The price tables as they are now (the same reads as the Fee Calculator page).
export async function loadPriceBook(admin: SupabaseClient): Promise<PriceBook> {
  const [cohorts, rates, subjects, settings] = await Promise.all([
    admin.from('fee_cohorts').select('id, membership_name, is_active, materials_included_in_tuition'),
    admin.from('fee_rates').select('cohort_id, level, track, subject_count, cycle_tier, amount'),
    admin.from('fee_subjects').select('level, code, label, kind, is_active, sort_order').order('sort_order'),
    admin.from('fee_settings').select('key, value'),
  ])
  for (const result of [cohorts, rates, subjects, settings]) {
    if (result.error) throw new Error(`Prices could not be read: ${result.error.message}`)
  }
  const setting = (key: string) => settings.data?.find((row) => row.key === key)?.value ?? null
  const globalRates = setting('global_rates') as GlobalRates | null
  if (!globalRates) throw new Error('The school-wide numbers of the Fee Calculator are missing.')
  return {
    cohorts: (cohorts.data ?? []).map((c) => ({ id: c.id, name: c.membership_name, isActive: c.is_active, materialsIncluded: c.materials_included_in_tuition })),
    rates: (rates.data ?? []).map((r) => ({
      cohortId: r.cohort_id,
      level: r.level as FeeLevel,
      track: r.track as FeeTrack,
      subjectCount: r.subject_count,
      cycleTier: r.cycle_tier as CycleTier,
      amount: Number(r.amount),
    })),
    subjects: (subjects.data ?? []).map((s) => ({ level: s.level, code: s.code, label: s.label, kind: s.kind, isActive: s.is_active })),
    globalRates,
    invoiceTemplate: { ...DEFAULT_INVOICE_TEMPLATE, ...((setting('invoice_template') as Partial<InvoiceTemplate> | null) ?? {}) },
  }
}

export async function addEvent(admin: SupabaseClient, quotationId: string, kind: string, detail: Record<string, unknown> = {}, byTeacherId: number | null = null) {
  await admin.from('quotation_events').insert({ quotation_id: quotationId, kind, detail, by_teacher_id: byTeacherId })
}

// Each class's weekly times, for the parent's page.
export async function classTimes(admin: SupabaseClient, classroomIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  if (classroomIds.length === 0) return out
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await admin
    .from('schedules')
    .select('classroom_id, day_of_week, start_time, end_time, end_recur')
    .in('classroom_id', classroomIds)
    .eq('recurrence_type', 'weekly')
    .eq('status', 'active')
  for (const id of classroomIds) {
    const slots = (data ?? [])
      .filter((s) => s.classroom_id === id && (!s.end_recur || s.end_recur >= today))
      .map((s) => ({ dayOfWeek: s.day_of_week, startTime: s.start_time, endTime: s.end_time }))
    out.set(id, classTimeLabel(slots))
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// Razorpay (Curlec): https://api.razorpay.com/v1, Basic auth with the key id and secret (Supabase secrets).

function razorpayAuth(): string | null {
  const id = Deno.env.get('RAZORPAY_KEY_ID')
  const secret = Deno.env.get('RAZORPAY_KEY_SECRET')
  return id && secret ? `Basic ${btoa(`${id}:${secret}`)}` : null
}

export function paymentsReady(): boolean {
  return razorpayAuth() !== null
}

export async function createPaymentLink(
  q: { id: string; publicToken: string; childName: string; total: number; expiresAt: string },
  school: string,
  baseUrl: string,
): Promise<{ id: string; url: string; referenceId: string }> {
  const auth = razorpayAuth()
  if (!auth) throw new Error('Payments are not set up yet.')
  const body = paymentLinkBody(q, school, baseUrl)
  const res = await fetch('https://api.razorpay.com/v1/payment_links', {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || typeof data?.id !== 'string' || typeof data?.short_url !== 'string') {
    throw new Error(`Razorpay: ${data?.error?.description ?? res.status}`)
  }
  return { id: data.id, url: data.short_url, referenceId: body.reference_id }
}

export async function cancelPaymentLink(linkId: string): Promise<void> {
  const auth = razorpayAuth()
  if (!auth) return
  await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(linkId)}/cancel`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
  }).catch(() => undefined)
}

// ---------------------------------------------------------------------------------------------------------------
// After a quotation is paid (the webhook, and "Run again" in the Inbox).

type LoginMaker = {
  createStudentLoginAsServer: (admin: SupabaseClient, studentId: number) => Promise<{ status: 'created'; username: string; password: string } | { status: 'exists'; username: string }>
  buildLoginMessage: (admin: SupabaseClient, args: { studentName: string; username: string; password: string }) => Promise<string>
}

// Department 4's shared login maker (the _shared portalAccount module, contract 13.2).
// TODO(when it is there): import it by its fixed relative name at the top of this file and return it here — the
// bundler only includes a module imported by a fixed name, and refuses to build while the file is missing, so until
// then the name is kept out of its sight and the login step records "not installed yet".
async function loginMaker(): Promise<LoginMaker | null> {
  const name = ['..', 'portalAccount.ts'].join('/')
  try {
    return (await import(name)) as unknown as LoginMaker
  } catch {
    return null
  }
}

export async function afterPayment(admin: SupabaseClient, quotationId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: result, error } = await admin.rpc('quotation_after_payment', { p_quotation_id: quotationId })
  if (error) return { ok: false, error: error.message }
  if (!(result as { ok?: boolean })?.ok) return { ok: false, error: (result as { error?: string })?.error ?? 'Not enrolled.' }

  const { data: q } = await admin.from('quotations').select('*').eq('id', quotationId).single()
  if (!q) return { ok: false, error: 'Quotation not found.' }

  // The student app login, sent to the parent's chat (the message is hidden once sent: it has the password).
  if (q.student_id && q.login_status !== 'done' && q.login_status !== 'exists') {
    const maker = await loginMaker()
    let loginStatus: 'done' | 'exists' | 'failed' = 'failed'
    let detail: Record<string, unknown> = {}
    if (!maker) {
      detail = { error: 'The login maker is not installed yet.' }
    } else {
      try {
        const login = await maker.createStudentLoginAsServer(admin, q.student_id)
        if (login.status === 'created') {
          const message = await maker.buildLoginMessage(admin, { studentName: q.child_name, username: login.username, password: login.password })
          await admin.rpc('queue_quotation_message', { p_quotation_id: q.id, p_what: 'login', p_kind: 'message', p_message: message, p_secret: true })
          loginStatus = 'done'
        } else {
          loginStatus = 'exists'
        }
        detail = { username: login.username, status: login.status }
      } catch (e) {
        detail = { error: e instanceof Error ? e.message : String(e) }
      }
    }
    await admin.from('quotations').update({ login_status: loginStatus }).eq('id', q.id)
    await addEvent(admin, q.id, 'login', detail)
  }

  // The receipt, kept with the lead's receipts (the Inbox's receipt step then counts as done).
  if (!q.receipt_path && q.lead_id) {
    try {
      const snapshot = q.price_snapshot as PriceSnapshot
      const start = new Date(`${q.start_date}T00:00:00Z`)
      const school = await schoolName(admin)
      const pdf = receiptPdf(
        school,
        receiptRows({
          schoolName: school,
          receiptNo: q.reference_no,
          paidAt: q.paid_at ?? new Date().toISOString(),
          childName: q.child_name,
          startYear: start.getUTCFullYear(),
          startMonth: start.getUTCMonth() + 1,
          endYear: snapshot.endYear,
          endMonth: snapshot.endMonth,
          lines: snapshot.lines,
          discount: Number(q.discount_amount),
          total: Number(q.paid_amount ?? q.total),
          paymentMethod: q.payment_method,
          paymentId: q.rzp_payment_id,
        }),
      )
      const path = `${q.lead_id}/${crypto.randomUUID()}.pdf`
      const upload = await admin.storage.from('lead-receipts').upload(path, pdf, { contentType: 'application/pdf' })
      if (upload.error) throw new Error(upload.error.message)
      await admin.from('lead_receipts').insert({
        lead_id: q.lead_id,
        file_path: path,
        file_name: `Receipt ${q.reference_no} ${q.child_name}.pdf`.slice(0, 200),
        size_bytes: pdf.byteLength,
        added_by: 'Razorpay payment',
      })
      await admin.from('quotations').update({ receipt_path: path }).eq('id', q.id)
      await addEvent(admin, q.id, 'receipt', { path })
    } catch (e) {
      await addEvent(admin, q.id, 'check', { receipt: e instanceof Error ? e.message : String(e) })
    }
  }
  return { ok: true }
}
