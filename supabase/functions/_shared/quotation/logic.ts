// Quotations (报价单 → Razorpay Curlec payment → enrolment). The rules shared by the CRM page (preview) and the edge
// functions (the price that counts): the price of a quotation is the Fee Calculator's sum, unchanged, with the
// discount as one more line; the payment link Razorpay gets; and how a Razorpay webhook is checked and read.
// Plan: side notes quotation-payment-plan-detail.md. Deno runs this file too, so imports keep their ".ts".

import { buildCohortRates, quoteFees, type FeeLevel, type FeeRateRow } from '../feeCalculator/quote.ts'
import { applyTemplate, type ChargeLine, type CohortEntry, type CycleTier, type GlobalRates, type InvoiceTemplate, type Region, type SubjectOption } from '../feeCalculator/types.ts'

export type QuotationStatus = 'draft' | 'needs_approval' | 'sent' | 'viewed' | 'confirmed' | 'paid' | 'expired' | 'cancelled'

export type DiscountKind = 'amount' | 'percent'
export type DiscountInput = { kind: DiscountKind; value: number; reason: string; note?: string | null }

// How a choice of the school's "how they enrol" list (Student fields) is priced: which price column, how many months.
export type EnrolMethodPlan = { name: string; rateTier: CycleTier; months: number }

export type QuotationSettings = {
  enabled: boolean
  expiryDays: number
  discountCapPercent: number
  discountCapAmount: number
  discountReasons: string[]
  discountLine: string
  terms: string
  paidMessage: string
  lcRule: 'ec_picks' | 'round_robin' | 'by_subject'
  publicBaseUrl: string
  enrolMethods: EnrolMethodPlan[]
  // The names of the school's Student fields choices written on the student when paid.
  paymentModeName: string
  regionNames: Record<Region, string>
  // The WhatsApp message the link is put in: {child} {total} {days} {url}.
  linkMessage: string
  // How parents may pay (Plan B, boss 2026-10-23): bank transfer confirmed by the EC, and / or Razorpay.
  paymentRoutes: PaymentRoute[]
  bank: BankDetails
  // Printed under the bank details on the page and the PDF.
  bankNote: string
  // On: a bank transfer the EC confirms waits for an admin's "Checked: enrol" before the child is enrolled.
  bankReview: boolean
}

export type PaymentRoute = 'razorpay' | 'bank_transfer'
export type BankDetails = { bankName: string; accountName: string; accountNumber: string }

// Mirai off; EduHero switches it on. Every value can be changed by an admin.
export const DEFAULT_QUOTATION_SETTINGS: QuotationSettings = {
  enabled: false,
  expiryDays: 3,
  discountCapPercent: 10,
  discountCapAmount: 100,
  discountReasons: ['兄弟姐妹', '老生续报', '朋友推荐', '促销活动', '其他'],
  discountLine: '折扣（{reason}）-RM{amount}',
  terms: '',
  paidMessage: '付款成功！我们会在 WhatsApp 发送学生 App 登入资料和第一堂课的时间。',
  lcRule: 'ec_picks',
  publicBaseUrl: '',
  enrolMethods: [
    { name: '每月报名', rateTier: 'monthly', months: 1 },
    { name: '3个月一次性报名', rateTier: '3mo', months: 3 },
    { name: '6个月一次性报名', rateTier: '6mo_plus', months: 6 },
    { name: '12个月一次性报名', rateTier: '6mo_plus', months: 12 },
  ],
  paymentModeName: '一次性付款',
  regionNames: { west_malaysia: '西马', east_malaysia: '东马' },
  linkMessage: '这是 {child} 的报价单，共 RM{total}。请点以下链接确认并付款（{days} 天内有效）：\n{url}',
  paymentRoutes: ['bank_transfer'],
  bank: { bankName: '', accountName: '', accountNumber: '' },
  bankNote: '转账时请在备注写孩子的名字和报价单号，转账后把收据发给我们。',
  bankReview: false,
}

// A stored settings value (app_settings 'quotations') read safely: anything missing or wrong keeps the default.
export function readQuotationSettings(raw: unknown): QuotationSettings {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const d = DEFAULT_QUOTATION_SETTINGS
  const num = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fallback
  const str = (v: unknown, fallback: string, max: number) => (typeof v === 'string' && v.length <= max ? v : fallback)
  const tiers: CycleTier[] = ['monthly', '3mo', '6mo_plus']
  const methods = Array.isArray(value.enrolMethods)
    ? value.enrolMethods.filter(
        (m): m is EnrolMethodPlan =>
          !!m &&
          typeof m === 'object' &&
          typeof (m as EnrolMethodPlan).name === 'string' &&
          tiers.includes((m as EnrolMethodPlan).rateTier) &&
          Number.isInteger((m as EnrolMethodPlan).months) &&
          (m as EnrolMethodPlan).months >= 1 &&
          (m as EnrolMethodPlan).months <= 24,
      )
    : null
  const reasons = Array.isArray(value.discountReasons) ? value.discountReasons.filter((r): r is string => typeof r === 'string' && r.trim() !== '') : null
  return {
    enabled: value.enabled === true,
    expiryDays: num(value.expiryDays, d.expiryDays, 1, 60),
    discountCapPercent: num(value.discountCapPercent, d.discountCapPercent, 0, 100),
    discountCapAmount: num(value.discountCapAmount, d.discountCapAmount, 0, 100000),
    discountReasons: reasons && reasons.length > 0 ? reasons : d.discountReasons,
    discountLine: str(value.discountLine, d.discountLine, 200),
    terms: str(value.terms, d.terms, 8000),
    paidMessage: str(value.paidMessage, d.paidMessage, 1000),
    lcRule: value.lcRule === 'round_robin' || value.lcRule === 'by_subject' ? value.lcRule : 'ec_picks',
    publicBaseUrl: str(value.publicBaseUrl, d.publicBaseUrl, 300),
    enrolMethods: methods && methods.length > 0 ? methods : d.enrolMethods,
    linkMessage: str(value.linkMessage, d.linkMessage, 1000) || d.linkMessage,
    paymentRoutes: readRoutes(value.paymentRoutes),
    bank: {
      bankName: str((value.bank as Record<string, unknown> | undefined)?.bankName, '', 80),
      accountName: str((value.bank as Record<string, unknown> | undefined)?.accountName, '', 120),
      accountNumber: str((value.bank as Record<string, unknown> | undefined)?.accountNumber, '', 40),
    },
    bankNote: str(value.bankNote, d.bankNote, 500),
    bankReview: value.bankReview === true,
    paymentModeName: str(value.paymentModeName, d.paymentModeName, 60) || d.paymentModeName,
    regionNames: {
      west_malaysia: str((value.regionNames as Record<string, unknown> | undefined)?.west_malaysia, d.regionNames.west_malaysia, 60) || d.regionNames.west_malaysia,
      east_malaysia: str((value.regionNames as Record<string, unknown> | undefined)?.east_malaysia, d.regionNames.east_malaysia, 60) || d.regionNames.east_malaysia,
    },
  }
}

function readRoutes(raw: unknown): PaymentRoute[] {
  const routes = Array.isArray(raw) ? (['bank_transfer', 'razorpay'] as const).filter((r) => raw.includes(r)) : []
  return routes.length > 0 ? [...routes] : DEFAULT_QUOTATION_SETTINGS.paymentRoutes
}

// Ready to take bank transfers: the route is on and the account is written.
export function bankReady(settings: Pick<QuotationSettings, 'paymentRoutes' | 'bank'>): boolean {
  return settings.paymentRoutes.includes('bank_transfer') && Boolean(settings.bank.bankName.trim() && settings.bank.accountNumber.trim())
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ---------------------------------------------------------------------------------------------------------------
// Plan B: the EC confirms a bank transfer with the parent's receipt

export type BankPaymentInput = {
  paidOn: string
  amount: number
  reference: string | null
  note: string | null
  proofPath: string | null
}

export type BankPaymentCheck = { ok: boolean; errors: string[]; amountDiffers: boolean }

// What must be right before "Submit": a date (not in the future), an amount, the receipt, and a reason when the
// amount is not the quotation's total.
export function checkBankPayment(input: BankPaymentInput, total: number, today: string): BankPaymentCheck {
  const errors: string[] = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn)) errors.push('Write the date of the transfer.')
  else if (input.paidOn > today) errors.push('The transfer date cannot be in the future.')
  if (!(input.amount > 0) || !Number.isFinite(input.amount)) errors.push('Write the amount received.')
  if (!input.proofPath) errors.push('Add the parent’s receipt.')
  if ((input.reference ?? '').length > 100) errors.push('The bank reference is too long.')
  const amountDiffers = Number.isFinite(input.amount) && toSen(input.amount) !== toSen(total)
  if (amountDiffers && !(input.note ?? '').trim()) errors.push(`The amount is not RM${total.toFixed(2)}: write why.`)
  if ((input.note ?? '').length > 300) errors.push('The note is too long.')
  return { ok: errors.length === 0, errors, amountDiffers }
}

// ---------------------------------------------------------------------------------------------------------------
// Months

// The month that is `months` months long from the start month (the start month counts as the first).
export function endMonthFrom(startYear: number, startMonth: number, months: number): { year: number; month: number } {
  const index = startYear * 12 + (startMonth - 1) + (months - 1)
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

export function startDateOf(startYear: number, startMonth: number): string {
  return `${startYear}-${String(startMonth).padStart(2, '0')}-01`
}

// ---------------------------------------------------------------------------------------------------------------
// Discount: one more line after the Fee Calculator's sum, never inside it.

export type DiscountResult = { amount: number; total: number; error: string | null }

export function applyDiscount(subtotal: number, discount: DiscountInput | null): DiscountResult {
  if (!discount || !(discount.value > 0)) return { amount: 0, total: round2(subtotal), error: null }
  if (!Number.isFinite(discount.value)) return { amount: 0, total: round2(subtotal), error: 'The discount must be a number.' }
  if (!discount.reason.trim()) return { amount: 0, total: round2(subtotal), error: 'Pick a reason for the discount.' }
  if (discount.kind === 'percent' && discount.value > 100) return { amount: 0, total: round2(subtotal), error: 'A discount cannot be more than 100%.' }
  const amount = round2(discount.kind === 'percent' ? (subtotal * discount.value) / 100 : discount.value)
  const total = round2(subtotal - amount)
  // Razorpay takes no payment under RM1.
  if (total < 1) return { amount, total, error: 'After the discount the total must still be at least RM1.00.' }
  return { amount, total, error: null }
}

// Over the school's cap (percent of the sum, or ringgit), a discount waits for someone allowed to approve it.
export function discountNeedsApproval(subtotal: number, discountAmount: number, settings: Pick<QuotationSettings, 'discountCapPercent' | 'discountCapAmount'>) {
  if (discountAmount <= 0) return false
  const percent = subtotal > 0 ? (discountAmount / subtotal) * 100 : 100
  return percent > settings.discountCapPercent + 1e-9 || discountAmount > settings.discountCapAmount + 1e-9
}

// The Fee Calculator's text with the discount line put in before TOTAL, and TOTAL showing the discounted sum.
// "下个月只需付" stays as the Fee Calculator works it out (no discount on next month).
export function textWithDiscount(
  invoiceText: string,
  template: InvoiceTemplate,
  discountLine: string,
  subtotal: number,
  discount: { amount: number; reason: string } | null,
  total: number,
): string {
  if (!discount || discount.amount <= 0) return invoiceText
  const totalBefore = applyTemplate(template.totalLine, { total: subtotal.toFixed(2) })
  const rows = invoiceText.split('\n')
  const at = rows.indexOf(totalBefore)
  if (at === -1) return invoiceText
  rows.splice(
    at,
    1,
    applyTemplate(discountLine, { reason: discount.reason, amount: discount.amount.toFixed(2) }),
    applyTemplate(template.totalLine, { total: total.toFixed(2) }),
  )
  return rows.join('\n')
}

// ---------------------------------------------------------------------------------------------------------------
// The price of a quotation

export type QuotationChoices = {
  cohortId: number
  level: FeeLevel
  region: Region
  enrolMethod: string
  startYear: number
  startMonth: number
  registrationMonth: number | null
  // Fee Calculator subject codes, in the order they were ticked.
  subjects: string[]
  bioChePhy: string[]
  discount: DiscountInput | null
}

// What the price is worked out from: the school's price tables as they are now.
export type PriceBook = {
  cohorts: { id: number; name: string; isActive: boolean; materialsIncluded: boolean }[]
  rates: FeeRateRow[]
  subjects: { level: 'primary' | 'secondary' | 'bio_che_phy'; code: string; label: string; kind: SubjectOption['kind']; isActive: boolean }[]
  globalRates: GlobalRates
  invoiceTemplate: InvoiceTemplate
}

export type PriceSnapshot = {
  cohortName: string
  rateTier: CycleTier
  months: number
  endYear: number
  endMonth: number
  lines: ChargeLine[]
  subtotal: number
  discount: (DiscountInput & { amount: number }) | null
  total: number
  invoiceText: string
}

export type PriceResult = { snapshot: PriceSnapshot; error: null } | { snapshot: null; error: string }

export function cohortEntryFor(book: PriceBook, cohortId: number): CohortEntry | null {
  const cohort = book.cohorts.find((c) => c.id === cohortId && c.isActive)
  if (!cohort) return null
  return {
    key: String(cohort.id),
    label: cohort.name,
    primary: buildCohortRates(book.rates, cohort.id, 'primary'),
    secondary: buildCohortRates(book.rates, cohort.id, 'secondary'),
    materialsIncludedInTuition: cohort.materialsIncluded,
  }
}

// The one place a quotation's price is made: the CRM shows it as a preview, the quotation function makes it again
// from the database when the quotation is sent and keeps it. Same maths both times.
export function priceQuotation(choices: QuotationChoices, book: PriceBook, settings: QuotationSettings): PriceResult {
  const cohort = cohortEntryFor(book, choices.cohortId)
  if (!cohort) return { snapshot: null, error: 'Pick a membership level that has prices.' }
  const plan = settings.enrolMethods.find((m) => m.name === choices.enrolMethod)
  if (!plan) return { snapshot: null, error: 'Pick how they enrol.' }
  if (choices.subjects.length + choices.bioChePhy.length === 0) return { snapshot: null, error: 'Tick at least one subject.' }
  const subjectList = book.subjects
    .filter((s) => s.level === choices.level && s.isActive)
    .map((s) => ({ id: s.code, label: s.label, kind: s.kind }))
  const unknown = choices.subjects.find((code) => !subjectList.some((s) => s.id === code))
  if (unknown) return { snapshot: null, error: `${unknown} is not one of the subjects.` }
  const end = endMonthFrom(choices.startYear, choices.startMonth, plan.months)
  const quote = quoteFees({
    cohort,
    level: choices.level,
    region: choices.region,
    rateTier: plan.rateTier,
    startYear: choices.startYear,
    startMonth: choices.startMonth,
    endYear: end.year,
    endMonth: end.month,
    subjectList,
    selectedSubjects: choices.subjects,
    selectedBioChePhy: choices.bioChePhy,
    anniversaryMonth: choices.registrationMonth,
    globalRates: book.globalRates,
    invoiceTemplate: book.invoiceTemplate,
  })
  if (!quote.result) return { snapshot: null, error: quote.error ?? 'The price could not be worked out.' }
  const subtotal = quote.result.total
  const discount = applyDiscount(subtotal, choices.discount)
  if (discount.error) return { snapshot: null, error: discount.error }
  const discountKept = choices.discount && discount.amount > 0 ? { ...choices.discount, amount: discount.amount } : null
  return {
    snapshot: {
      cohortName: cohort.label,
      rateTier: plan.rateTier,
      months: plan.months,
      endYear: end.year,
      endMonth: end.month,
      lines: quote.result.lines,
      subtotal,
      discount: discountKept,
      total: discount.total,
      invoiceText: textWithDiscount(
        quote.invoiceText,
        book.invoiceTemplate,
        settings.discountLine,
        subtotal,
        discountKept ? { amount: discountKept.amount, reason: discountKept.reason } : null,
        discount.total,
      ),
    },
    error: null,
  }
}

// Ringgit → sen, as Razorpay counts (whole numbers only).
export function toSen(ringgit: number): number {
  return Math.round(ringgit * 100)
}

// ---------------------------------------------------------------------------------------------------------------
// The link for the parent, and the Razorpay payment link

// 32 random bytes, URL-safe: the only key to a quotation's public page.
export function newPublicToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let text = ''
  for (const b of bytes) text += String.fromCharCode(b)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function isPublicToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(value)
}

export function linkMessage(settings: Pick<QuotationSettings, 'linkMessage' | 'expiryDays'>, child: string, total: number, url: string): string {
  return applyTemplate(settings.linkMessage, { child, total: total.toFixed(2), days: settings.expiryDays, url })
}

export function quoteUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/?quote=${encodeURIComponent(token)}`
}

// "Q-" and the first 12 hex digits of the quotation's id: our reference on Razorpay (at most 40 characters, unique;
// a quotation has one payment link — Renew makes a new quotation).
export function referenceFor(quotationId: string): string {
  return `Q-${quotationId.replace(/-/g, '').slice(0, 12).toUpperCase()}`
}

export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : ''
}

export type PaymentLinkQuotation = {
  id: string
  publicToken: string
  childName: string
  total: number
  expiresAt: string
}

// The body of POST https://api.razorpay.com/v1/payment_links (Curlec): sen, MYR, our reference, the quotation's
// expiry (Razorpay needs it at least 15 minutes ahead), back to our page after paying. Razorpay sends no SMS or email:
// the parent already has the link on WhatsApp.
export function paymentLinkBody(q: PaymentLinkQuotation, schoolName: string, baseUrl: string, now: Date = new Date()) {
  const expiresAt = Math.floor(new Date(q.expiresAt).getTime() / 1000)
  const earliest = Math.floor(now.getTime() / 1000) + 16 * 60
  return {
    amount: toSen(q.total),
    currency: 'MYR',
    accept_partial: false,
    reference_id: referenceFor(q.id),
    description: `${schoolName} – ${q.childName}`.slice(0, 2000),
    expire_by: Math.max(expiresAt, earliest),
    notify: { sms: false, email: false },
    reminder_enable: false,
    notes: { quotation_id: q.id },
    callback_url: `${quoteUrl(baseUrl, q.publicToken)}&return=1`,
    callback_method: 'get',
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Razorpay webhooks

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// X-Razorpay-Signature: HMAC-SHA256 of the raw request body (never the parsed JSON) with the webhook secret, in hex.
export async function verifyRazorpayWebhook(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !secret) return false
  const expected = await hmacSha256Hex(secret, rawBody)
  return sameText(expected, signature.trim().toLowerCase())
}

export type WebhookEvent = {
  event: string
  linkId: string | null
  referenceId: string | null
  linkStatus: string | null
  amountPaid: number | null
  currency: string | null
  paymentId: string | null
  method: string | null
  quotationId: string | null
}

// The parts of a payment link event we use (payment_link.paid / .expired / .cancelled).
export function readWebhookEvent(body: unknown): WebhookEvent | null {
  if (!body || typeof body !== 'object') return null
  const root = body as { event?: unknown; payload?: Record<string, { entity?: Record<string, unknown> }> }
  if (typeof root.event !== 'string') return null
  const link = root.payload?.payment_link?.entity ?? null
  const payment = root.payload?.payment?.entity ?? null
  const text = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null)
  const notes = link?.notes && typeof link.notes === 'object' ? (link.notes as Record<string, unknown>) : null
  return {
    event: root.event,
    linkId: text(link?.id),
    referenceId: text(link?.reference_id),
    linkStatus: text(link?.status),
    amountPaid: typeof link?.amount_paid === 'number' ? link.amount_paid : null,
    currency: text(link?.currency),
    paymentId: text(payment?.id),
    method: text(payment?.method),
    quotationId: text(notes?.quotation_id),
  }
}

export type QuotationForWebhook = {
  id: string
  status: QuotationStatus
  total: number
  rzpLinkId: string | null
}

export type WebhookDecision =
  | { action: 'ignore'; reason: string }
  | { action: 'not_found' }
  | { action: 'already_paid' }
  | { action: 'mark_paid' }
  | { action: 'paid_but_check'; reason: string }
  | { action: 'mark_expired' }
  | { action: 'mark_cancelled' }

// What a payment link event means for its quotation. Only a paid event with the right amount, in ringgit, for a
// quotation that was waiting for it enrols the child; anything odd is kept as paid for a person to look at.
export function decideWebhook(event: WebhookEvent, quotation: QuotationForWebhook | null): WebhookDecision {
  const handled = ['payment_link.paid', 'payment_link.expired', 'payment_link.cancelled']
  if (!handled.includes(event.event)) return { action: 'ignore', reason: `Not used: ${event.event}` }
  if (!quotation) return { action: 'not_found' }
  if (quotation.rzpLinkId && event.linkId && quotation.rzpLinkId !== event.linkId) {
    return event.event === 'payment_link.paid'
      ? { action: 'paid_but_check', reason: 'Paid on a payment link that is not this quotation’s current one.' }
      : { action: 'ignore', reason: 'An old payment link of this quotation.' }
  }
  if (event.event === 'payment_link.expired') {
    return quotation.status === 'paid' ? { action: 'ignore', reason: 'Already paid.' } : { action: 'mark_expired' }
  }
  if (event.event === 'payment_link.cancelled') {
    return quotation.status === 'paid' ? { action: 'ignore', reason: 'Already paid.' } : { action: 'mark_cancelled' }
  }
  if (quotation.status === 'paid') return { action: 'already_paid' }
  if (event.currency !== 'MYR') return { action: 'paid_but_check', reason: `Paid in ${event.currency ?? 'an unknown currency'}, not MYR.` }
  if (event.amountPaid !== toSen(quotation.total)) {
    return {
      action: 'paid_but_check',
      reason: `Paid RM${((event.amountPaid ?? 0) / 100).toFixed(2)}, the quotation is RM${quotation.total.toFixed(2)}.`,
    }
  }
  if (quotation.status === 'cancelled') return { action: 'paid_but_check', reason: 'Paid after the quotation was cancelled.' }
  return { action: 'mark_paid' }
}

// ---------------------------------------------------------------------------------------------------------------
// The parent's page

export type PublicQuotation = {
  status: QuotationStatus
  schoolName: string
  childName: string
  phone: string
  classes: { subject: string; classroom: string; when: string }[]
  months: string
  lines: { label: string; amount: number }[]
  subtotal: number
  discount: { label: string; amount: number } | null
  total: number
  expiresAt: string
  terms: string
  paidAt: string | null
  paidMessage: string
  receiptNo: string
  // How this quotation is paid; for a bank transfer, the school's account and the note (no pay button).
  paymentRoute: PaymentRoute
  bank: BankDetails | null
  bankNote: string
}

// What the page may show: what the parent needs to decide and nothing else (no ids, no staff, the phone masked).
export function publicStatus(status: QuotationStatus, expiresAt: string, now: Date = new Date()): QuotationStatus {
  if ((status === 'sent' || status === 'viewed' || status === 'confirmed') && new Date(expiresAt).getTime() <= now.getTime()) return 'expired'
  return status
}

export function monthsLabel(startYear: number, startMonth: number, endYear: number, endMonth: number): string {
  const start = `${startYear}年${startMonth}月`
  if (startYear === endYear && startMonth === endMonth) return start
  return `${start} – ${endYear}年${endMonth}月`
}

// ---------------------------------------------------------------------------------------------------------------
// Class times and the receipt

export type ClassSlot = { dayOfWeek: number | null; startTime: string; endTime: string }

const DAYS_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

// "星期六 10:00–11:30, 星期三 20:00–21:00" from a class's weekly schedules (day 0 = Sunday, as in the calendar).
export function classTimeLabel(slots: ClassSlot[]): string {
  return [...slots]
    .filter((s) => s.dayOfWeek !== null && s.dayOfWeek >= 0 && s.dayOfWeek <= 6)
    .sort((a, b) => (a.dayOfWeek! - b.dayOfWeek!) || a.startTime.localeCompare(b.startTime))
    .map((s) => `${DAYS_ZH[s.dayOfWeek!]} ${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)}`)
    .join(', ')
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const LINE_LABELS: Record<ChargeLine['type'], string> = {
  tuition_standard: 'Tuition',
  tuition_bio_che_phy: 'Tuition - BIO / CHE / PHY',
  tuition_sejarah_standalone: 'Tuition - Sejarah',
  tuition_cambridge: 'Tuition - Cambridge English',
  sej_surcharge: 'SEJ extra',
  materials: 'Materials fee',
  postage: 'Postage',
  registration: 'Yearly registration fee',
}

export type ReceiptInput = {
  schoolName: string
  receiptNo: string
  paidAt: string
  childName: string
  startYear: number
  startMonth: number
  endYear: number
  endMonth: number
  lines: { type: ChargeLine['type']; amount: number }[]
  discount: number
  total: number
  paymentMethod: string | null
  paymentId: string | null
}

// The receipt's rows in English (the standard PDF fonts have no Chinese; a Chinese name is shown as "?" there, so
// the child's name is also in the file name the staff see).
export function receiptRows(r: ReceiptInput): [string, string][] {
  const months =
    r.startYear === r.endYear && r.startMonth === r.endMonth
      ? `${MONTHS_EN[r.startMonth - 1]} ${r.startYear}`
      : `${MONTHS_EN[r.startMonth - 1]} ${r.startYear} - ${MONTHS_EN[r.endMonth - 1]} ${r.endYear}`
  const rows: [string, string][] = [
    ['Receipt no.', r.receiptNo],
    ['Date paid', r.paidAt.slice(0, 10)],
    ['Student', r.childName],
    ['Months', months],
    ['', ''],
  ]
  for (const line of r.lines) rows.push([LINE_LABELS[line.type] ?? line.type, `RM ${line.amount.toFixed(2)}`])
  if (r.discount > 0) rows.push(['Discount', `- RM ${r.discount.toFixed(2)}`])
  rows.push(['', ''], ['Total paid', `RM ${r.total.toFixed(2)}`])
  if (r.paymentMethod) rows.push(['Paid by', r.paymentMethod.toUpperCase()])
  if (r.paymentId) rows.push(['Payment reference', r.paymentId])
  return rows
}

function pdfText(value: string): string {
  // Only printable ASCII in the standard fonts; anything else becomes "?".
  return value.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1')
}

// A one-page A4 PDF with the school name, "Receipt" and two columns of rows (no library: Helvetica, built in).
export function receiptPdf(schoolName: string, rows: [string, string][]): Uint8Array {
  const ops: string[] = ['BT', '/F2 18 Tf', `56 780 Td (${pdfText(schoolName)}) Tj`, 'ET', 'BT', '/F1 12 Tf', `56 756 Td (Receipt) Tj`, 'ET']
  let y = 720
  for (const [label, value] of rows) {
    if (label || value) {
      ops.push('BT', '/F1 11 Tf', `56 ${y} Td (${pdfText(label)}) Tj`, 'ET')
      ops.push('BT', label === 'Total paid' ? '/F2 11 Tf' : '/F1 11 Tf', `300 ${y} Td (${pdfText(value)}) Tj`, 'ET')
    }
    y -= 18
  }
  const content = ops.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}
