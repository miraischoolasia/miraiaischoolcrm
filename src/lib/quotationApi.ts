import { supabase } from './supabase'
import { isMissingDatabaseThing } from './studentExtras'
import { prepareReceipt } from './receiptPdf'
import type { Json } from '../types/database'
import {
  classTimeLabel,
  readQuotationSettings,
  DEFAULT_QUOTATION_SETTINGS,
  type BankPaymentInput,
  type PaymentRoute,
  type PublicQuotation,
  type QuotationChoices,
  type QuotationSettings,
  type QuotationStatus,
} from '../../supabase/functions/_shared/quotation/logic.ts'

// The CRM side of quotations (20261031100000_quotations.sql): the school's settings, a chat's quotations, and the
// quotation / quote-public edge functions (which make the price that counts and talk to Razorpay).

export type QuotationRow = {
  id: string
  status: QuotationStatus
  childName: string
  total: number
  subtotal: number
  discountAmount: number
  expiresAt: string | null
  paidAt: string | null
  publicToken: string
  reference: string
  paymentRoute: 'razorpay' | 'bank_transfer'
  fulfilStatus: 'pending' | 'done' | 'failed' | 'check' | null
  fulfilError: string | null
  loginStatus: 'pending' | 'done' | 'exists' | 'failed' | null
  createdAt: string
  createdBy: number | null
  invoiceText: string
}

export async function fetchQuotationSettings(): Promise<QuotationSettings> {
  if (!supabase) return DEFAULT_QUOTATION_SETTINGS
  try {
    const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'quotations').maybeSingle()
    if (error || !data) return DEFAULT_QUOTATION_SETTINGS
    return readQuotationSettings(data.value)
  } catch {
    return DEFAULT_QUOTATION_SETTINGS
  }
}

// Null when saved, else the reason.
export async function saveQuotationSettings(settings: QuotationSettings) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_quotation_settings', { p_value: settings as unknown as Json })
  if (!error) return null
  return isMissingDatabaseThing(error) ? 'Quotations need their database update first.' : error.message || 'Could not save.'
}

// The quotations of one chat (or one lead), newest first.
export async function fetchChatQuotations(conversationId: number | null, leadId: number | null): Promise<QuotationRow[]> {
  if (!supabase || (conversationId === null && leadId === null)) return []
  let query = supabase
    .from('quotations')
    .select('id, status, child_name, total, subtotal, discount_amount, expires_at, paid_at, public_token, reference_no, payment_route, fulfil_status, fulfil_error, login_status, created_at, created_by, price_snapshot')
    .order('created_at', { ascending: false })
    .limit(20)
  query = conversationId !== null && leadId !== null ? query.or(`conversation_id.eq.${conversationId},lead_id.eq.${leadId}`) : conversationId !== null ? query.eq('conversation_id', conversationId) : query.eq('lead_id', leadId!)
  const { data, error } = await query
  if (error) return []
  return (data ?? []).map((row) => ({
    id: row.id,
    status: row.status as QuotationStatus,
    childName: row.child_name,
    total: Number(row.total),
    subtotal: Number(row.subtotal),
    discountAmount: Number(row.discount_amount),
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    publicToken: row.public_token,
    reference: row.reference_no,
    paymentRoute: row.payment_route as 'razorpay' | 'bank_transfer',
    fulfilStatus: row.fulfil_status as QuotationRow['fulfilStatus'],
    fulfilError: row.fulfil_error,
    loginStatus: row.login_status as QuotationRow['loginStatus'],
    createdAt: row.created_at,
    createdBy: row.created_by,
    invoiceText: ((row.price_snapshot as { invoiceText?: string } | null)?.invoiceText ?? '') as string,
  }))
}

// Each class's weekly times ("星期六 10:00–11:30"), to choose a class in the quotation.
export async function fetchClassTimes(classroomIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  if (!supabase || classroomIds.length === 0) return out
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('schedules')
    .select('classroom_id, day_of_week, start_time, end_time, end_recur')
    .in('classroom_id', classroomIds)
    .eq('recurrence_type', 'weekly')
    .eq('status', 'active')
  for (const id of classroomIds) {
    out.set(
      id,
      classTimeLabel(
        (data ?? [])
          .filter((s) => s.classroom_id === id && (!s.end_recur || s.end_recur >= today))
          .map((s) => ({ dayOfWeek: s.day_of_week, startTime: s.start_time, endTime: s.end_time })),
      ),
    )
  }
  return out
}

// How many students are in each class today (no seats are kept: the EC decides).
export async function fetchClassSizes(classroomIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  if (!supabase || classroomIds.length === 0) return out
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('student_classroom_periods')
    .select('classroom_id, start_date, end_date')
    .in('classroom_id', classroomIds)
    .lte('start_date', today)
  for (const row of data ?? []) {
    if (row.end_date && row.end_date < today) continue
    out.set(row.classroom_id, (out.get(row.classroom_id) ?? 0) + 1)
  }
  return out
}

// The grade for an age: a name with that age in it, or a range "9-11" that holds it.
export function guessAgeGroup(groups: string[], age: number | null): string {
  if (age === null) return ''
  for (const name of groups) {
    const range = name.match(/(\d+)\s*[-–]\s*(\d+)/)
    if (range && age >= Number(range[1]) && age <= Number(range[2])) return name
    if (new RegExp(`(^|\\D)${age}(\\D|$)`).test(name)) return name
  }
  return ''
}

export type StaffOption = { id: number; name: string }

export async function fetchStaffOptions(): Promise<StaffOption[]> {
  if (!supabase) return []
  const { data } = await supabase.from('teachers').select('id, full_name, role, is_active').eq('is_active', true).order('full_name')
  return (data ?? []).filter((t) => t.role !== 'teacher').map((t) => ({ id: t.id, name: t.full_name }))
}

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
  paymentRoute?: PaymentRoute
  expectTotal: number | null
}

export type SendResult = { ok: true; id: string; status: QuotationStatus; total: number; url: string | null; invoiceText: string } | { ok: false; error: string; total?: number }

async function callStaff<T>(body: Record<string, unknown>): Promise<T | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.functions.invoke('quotation', { body })
  if (data && typeof data === 'object') return data as T
  if (error) {
    // The function's own reason is in the response body.
    const context = (error as { context?: Response }).context
    try {
      const reply = context ? await context.json() : null
      if (reply?.error) return { ok: false, error: String(reply.error) }
    } catch {
      // fall through
    }
    return { ok: false, error: error.message || 'The quotation service did not answer.' }
  }
  return { ok: false, error: 'The quotation service did not answer.' }
}

export const sendQuotation = (draft: QuotationDraft) => callStaff<SendResult>({ action: 'send', draft })
export const approveQuotation = (id: string) => callStaff<{ ok: true; url: string | null }>({ action: 'approve', id })
export const cancelQuotation = (id: string) => callStaff<{ ok: true }>({ action: 'cancel', id })
export const renewQuotation = (id: string) => callStaff<SendResult>({ action: 'renew', id })
export const retryQuotation = (id: string) => callStaff<{ ok: true }>({ action: 'retry', id })
// Plan B: the EC confirms the parent's bank transfer (the receipt uploaded first with uploadPaymentProof).
export const markQuotationPaid = (id: string, payment: BankPaymentInput) => callStaff<{ ok: true; waiting?: boolean }>({ action: 'mark_paid', id, payment })

// The parent's receipt into the private bucket, under the quotation. A photo becomes a PDF first. The stored path.
export async function uploadPaymentProof(quotationId: string, file: File): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' }
  let prepared: File
  try {
    prepared = (await prepareReceipt(file)).file
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Choose a PDF or a photo of the receipt.' }
  }
  const path = `${quotationId}/${crypto.randomUUID()}.pdf`
  const { error } = await supabase.storage.from('quotation-payments').upload(path, prepared, { contentType: 'application/pdf' })
  return error ? { ok: false, error: error.message || 'Could not upload the receipt.' } : { ok: true, path }
}

// ---------------------------------------------------------------------------------------------------------------
// The parent's page (no login: the quote-public function, with the token from the link)

export type PublicReply =
  | { ok: true; quotation: PublicQuotation; paymentsReady: boolean }
  | { ok: false; error: string; status?: QuotationStatus }

async function callPublic<T>(body: Record<string, unknown>): Promise<T | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: '系统还没设定好。' }
  const { data, error } = await supabase.functions.invoke('quote-public', { body })
  if (data && typeof data === 'object') return data as T
  const context = (error as { context?: Response } | null)?.context
  try {
    const reply = context ? await context.json() : null
    if (reply?.error) return { ok: false, error: String(reply.error), status: reply.status } as T
  } catch {
    // fall through
  }
  return { ok: false, error: '网络有问题，请稍后再试。' }
}

// The QR's address made here from its path, with the address this page talks to (the function's own idea of it can
// be an inside address).
function withQr(reply: PublicReply): PublicReply {
  if (!reply.ok || !reply.quotation.qrPath) return reply
  return { ...reply, quotation: { ...reply.quotation, qrUrl: schoolQrUrl(reply.quotation.qrPath) || reply.quotation.qrUrl } }
}

export const viewPublicQuotation = (token: string) => callPublic<PublicReply>({ action: 'view', token }).then(withQr)
export const confirmPublicQuotation = (token: string) => callPublic<{ ok: true; url: string } | { ok: false; error: string }>({ action: 'confirm', token, agree: true })
// The same answer as view, without marking it viewed: for the quotation PDF (the Inbox uses it too).
export const pdfPublicQuotation = (token: string) => callPublic<PublicReply>({ action: 'pdf', token }).then(withQr)
// §15: the parent says they transferred, or that something is wrong. Each tells the EC once.
export type ParentReply = { ok: true; afterPayUrl?: string | null; contactUrl?: string | null; already?: boolean } | { ok: false; error: string }
export const parentSaysPaid = (token: string) => callPublic<ParentReply>({ action: 'parent_paid', token })
export const parentSaysWrong = (token: string) => callPublic<ParentReply>({ action: 'parent_wrong', token })
export const publicQuotationStatus = (token: string) =>
  callPublic<{ ok: true; status: QuotationStatus; paidAt: string | null; total: number } | { ok: false; error: string }>({ action: 'status', token })

// §15: each staff member's links (their own with the Quotations tick; anyone's as admin).
export type StaffLink = { teacherId: number; afterPayUrl: string | null; contactUrl: string | null }

export async function fetchStaffLinks(): Promise<StaffLink[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('quotation_staff_links').select('teacher_id, after_pay_url, contact_url')
  if (error) return []
  return (data ?? []).map((row) => ({ teacherId: row.teacher_id, afterPayUrl: row.after_pay_url, contactUrl: row.contact_url }))
}

// Null when saved, else the reason.
export async function saveStaffLink(teacherId: number, afterPayUrl: string | null, contactUrl: string | null) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_quotation_staff_link', { p_teacher_id: teacherId, p_after_pay_url: afterPayUrl, p_contact_url: contactUrl })
  if (!error) return null
  return isMissingDatabaseThing(error) ? 'This needs its database update first.' : error.message || 'Could not save.'
}

// The school's QR picture (admin): put in the public bucket; the path goes into the quotation settings.
export async function uploadSchoolQr(file: File): Promise<{ ok: true; path: string; url: string } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' }
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : file.type === 'image/jpeg' ? 'jpg' : null
  if (!ext) return { ok: false, error: 'Choose a PNG, JPG or WebP picture.' }
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: 'The picture must be 2 MB or smaller.' }
  const path = `qr/bank-${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('quotation-public').upload(path, file, { contentType: file.type })
  if (error) return { ok: false, error: error.message || 'Could not upload the picture.' }
  return { ok: true, path, url: schoolQrUrl(path) }
}

export function schoolQrUrl(path: string): string {
  return supabase ? supabase.storage.from('quotation-public').getPublicUrl(path).data.publicUrl : ''
}

// The signed-in staff member's id (for "my links" in the Inbox's Quotation tab).
export async function fetchMyTeacherId(): Promise<number | null> {
  if (!supabase) return null
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null
  const { data } = await supabase.from('teachers').select('id').eq('auth_user_id', auth.user.id).maybeSingle()
  return data?.id ?? null
}
