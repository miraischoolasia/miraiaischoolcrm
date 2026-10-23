import { describe, expect, it } from 'vitest'
import {
  applyDiscount,
  decideWebhook,
  discountNeedsApproval,
  endMonthFrom,
  hmacSha256Hex,
  isPublicToken,
  maskPhone,
  newPublicToken,
  paymentLinkBody,
  priceQuotation,
  publicStatus,
  readQuotationSettings,
  readWebhookEvent,
  referenceFor,
  toSen,
  verifyRazorpayWebhook,
  DEFAULT_QUOTATION_SETTINGS,
  type PriceBook,
  type QuotationChoices,
} from '../../supabase/functions/_shared/quotation/logic.ts'
import { DEFAULT_INVOICE_TEMPLATE } from './feeCalculator/types'
import { DEFAULT_GLOBAL_RATES, SEED_COHORTS, SEED_SUBJECTS } from './feeCalculator/seed'

const book: PriceBook = {
  cohorts: SEED_COHORTS.map((c, i) => ({ id: i + 1, name: c.membershipName, isActive: true, materialsIncluded: c.materialsIncludedInTuition })),
  rates: SEED_COHORTS.flatMap((c, i) => c.rates.map((r) => ({ ...r, cohortId: i + 1 }))),
  subjects: SEED_SUBJECTS.map((s) => ({ ...s, isActive: true })),
  globalRates: DEFAULT_GLOBAL_RATES,
  invoiceTemplate: DEFAULT_INVOICE_TEMPLATE,
}
const settings = DEFAULT_QUOTATION_SETTINGS

const example1: QuotationChoices = {
  cohortId: 1, // 26002
  level: 'primary',
  region: 'west_malaysia',
  enrolMethod: '每月报名',
  startYear: 2026,
  startMonth: 10,
  registrationMonth: 10,
  subjects: ['BMP', 'BMK', 'MM'],
  bioChePhy: [],
  discount: null,
}

describe('the price of a quotation = the Fee Calculator’s sum, unchanged', () => {
  it('worked example 1 through "how they enrol" (monthly, 1 month) → RM255 and EC’s text', () => {
    const { snapshot } = priceQuotation(example1, book, settings)
    expect(snapshot?.subtotal).toBe(255)
    expect(snapshot?.total).toBe(255)
    expect(snapshot?.months).toBe(1)
    expect(snapshot?.invoiceText).toBe(
      ['10月 BMP+BMK+MM', '学费：RM195.00', '11月12月资料费 = RM30.00', '西马邮费 RM10.00', '每年报名手续费 RM20.00', '', 'TOTAL RM255.00', '', '下个月只需付 RM180.00/月', '因为资料费和邮费已经付了，不需要每个月再收。'].join('\n'),
    )
  })

  it('worked example 4 through "6 months at once" → Aug 2026 – Jan 2027, RM790', () => {
    const { snapshot } = priceQuotation(
      { ...example1, enrolMethod: '6个月一次性报名', startMonth: 8, registrationMonth: 12, subjects: ['BMP', 'MM'] },
      book,
      settings,
    )
    expect(snapshot).toMatchObject({ rateTier: '6mo_plus', months: 6, endYear: 2027, endMonth: 1, subtotal: 790 })
  })

  it('12 months at once uses the 6-months+ column for 12 months', () => {
    const { snapshot } = priceQuotation({ ...example1, enrolMethod: '12个月一次性报名', startMonth: 1, registrationMonth: null, subjects: ['MM'] }, book, settings)
    expect(snapshot?.lines[0]).toMatchObject({ type: 'tuition_standard', amount: 63 * 12 })
    expect(snapshot).toMatchObject({ endYear: 2026, endMonth: 12 })
  })

  it('says why it cannot price', () => {
    expect(priceQuotation({ ...example1, cohortId: 99 }, book, settings).error).toBe('Pick a membership level that has prices.')
    expect(priceQuotation({ ...example1, enrolMethod: 'x' }, book, settings).error).toBe('Pick how they enrol.')
    expect(priceQuotation({ ...example1, subjects: [] }, book, settings).error).toBe('Tick at least one subject.')
    expect(priceQuotation({ ...example1, subjects: ['RBT'] }, book, settings).error).toBe('RBT is not one of the subjects.')
    // The Fee Calculator's own reason comes through.
    const hidden = { ...book, rates: book.rates.filter((r) => r.cohortId !== 1 || r.subjectCount < 3) }
    expect(priceQuotation(example1, hidden, settings).error).toBe('找不到 3 科的标准学费收费表')
  })
})

describe('discount: one more line, never inside the sum', () => {
  it('10% of RM255 → RM25.50 off, RM229.50, the line goes before TOTAL and next month stays', () => {
    const { snapshot } = priceQuotation({ ...example1, discount: { kind: 'percent', value: 10, reason: '兄弟姐妹' } }, book, settings)
    expect(snapshot).toMatchObject({ subtotal: 255, total: 229.5, discount: { amount: 25.5 } })
    const rows = snapshot!.invoiceText.split('\n')
    expect(rows.slice(5, 9)).toEqual(['', '折扣（兄弟姐妹）-RM25.50', 'TOTAL RM229.50', ''])
    expect(rows).toContain('下个月只需付 RM180.00/月')
    // The sum's own lines are untouched.
    expect(snapshot!.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(255)
  })

  it('ringgit, reasons, limits', () => {
    expect(applyDiscount(255, { kind: 'amount', value: 50, reason: '促销活动' })).toEqual({ amount: 50, total: 205, error: null })
    expect(applyDiscount(255, { kind: 'amount', value: 50, reason: ' ' }).error).toBe('Pick a reason for the discount.')
    expect(applyDiscount(255, { kind: 'percent', value: 120, reason: 'x' }).error).toBe('A discount cannot be more than 100%.')
    expect(applyDiscount(255, { kind: 'amount', value: 254.5, reason: 'x' }).error).toBe('After the discount the total must still be at least RM1.00.')
    expect(applyDiscount(255, null)).toEqual({ amount: 0, total: 255, error: null })
    expect(applyDiscount(99.99, { kind: 'percent', value: 15, reason: 'x' })).toEqual({ amount: 15, total: 84.99, error: null })
  })

  it('over 10% or over RM100 waits for approval', () => {
    expect(discountNeedsApproval(255, 25.5, settings)).toBe(false)
    expect(discountNeedsApproval(255, 25.51, settings)).toBe(true)
    expect(discountNeedsApproval(2000, 150, settings)).toBe(true)
    expect(discountNeedsApproval(2000, 100, settings)).toBe(false)
    expect(discountNeedsApproval(255, 0, settings)).toBe(false)
  })
})

describe('months and money', () => {
  it('end month and sen', () => {
    expect(endMonthFrom(2026, 11, 3)).toEqual({ year: 2027, month: 1 })
    expect(endMonthFrom(2026, 1, 12)).toEqual({ year: 2026, month: 12 })
    expect(toSen(229.5)).toBe(22950)
    expect(toSen(19.99)).toBe(1999)
    expect(toSen(0.1 + 0.2)).toBe(30)
  })
})

describe('the parent’s link and the Razorpay payment link', () => {
  it('a random token of 43 URL-safe characters', () => {
    const a = newPublicToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(isPublicToken(a)).toBe(true)
    expect(newPublicToken()).not.toBe(a)
    expect(isPublicToken('abc')).toBe(false)
    expect(isPublicToken("x' or 1=1 --".padEnd(45, 'x'))).toBe(false)
  })

  it('the payment link: sen, MYR, our reference, the quotation’s expiry, back to our page', () => {
    const now = new Date('2026-10-23T10:00:00Z')
    const body = paymentLinkBody(
      { id: '3f2a9c1e-0b4d-4e8a-9c2f-1a2b3c4d5e6f', publicToken: 'T'.repeat(43), childName: 'Demo Aiden', total: 229.5, expiresAt: '2026-10-26T10:00:00Z' },
      'EduHero',
      'https://crm.example.test/',
      now,
    )
    expect(body).toMatchObject({
      amount: 22950,
      currency: 'MYR',
      accept_partial: false,
      reference_id: 'Q-3F2A9C1E0B4D',
      expire_by: Date.parse('2026-10-26T10:00:00Z') / 1000,
      notify: { sms: false, email: false },
      callback_url: `https://crm.example.test/?quote=${'T'.repeat(43)}&return=1`,
      callback_method: 'get',
      notes: { quotation_id: '3f2a9c1e-0b4d-4e8a-9c2f-1a2b3c4d5e6f' },
    })
    expect(body.reference_id.length).toBeLessThanOrEqual(40)
    // Razorpay wants the expiry at least 15 minutes ahead.
    const soon = paymentLinkBody({ id: 'a', publicToken: 't', childName: 'c', total: 1, expiresAt: '2026-10-23T10:05:00Z' }, 'S', 'https://x', now)
    expect(soon.expire_by).toBe(Date.parse('2026-10-23T10:16:00Z') / 1000)
    expect(referenceFor('3f2a9c1e-0b4d-4e8a-9c2f-1a2b3c4d5e6f')).toBe('Q-3F2A9C1E0B4D')
  })

  it('the page masks the phone and shows an old quotation as expired', () => {
    expect(maskPhone('60123456789')).toBe('••••6789')
    expect(maskPhone(null)).toBe('')
    const now = new Date('2026-10-23T10:00:00Z')
    expect(publicStatus('sent', '2026-10-23T09:59:59Z', now)).toBe('expired')
    expect(publicStatus('sent', '2026-10-23T10:00:01Z', now)).toBe('sent')
    expect(publicStatus('paid', '2026-10-20T00:00:00Z', now)).toBe('paid')
  })
})

describe('Razorpay webhooks', () => {
  it('HMAC-SHA256 hex (known answer)', async () => {
    expect(await hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog')).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8')
  })

  it('only the raw body signed with our webhook secret passes', async () => {
    const body = '{"event":"payment_link.paid","payload":{}}'
    const signature = await hmacSha256Hex('whsec_test', body)
    expect(await verifyRazorpayWebhook(body, signature, 'whsec_test')).toBe(true)
    expect(await verifyRazorpayWebhook(body, signature.toUpperCase(), 'whsec_test')).toBe(true)
    expect(await verifyRazorpayWebhook(body.replace('paid', 'paiD'), signature, 'whsec_test')).toBe(false)
    expect(await verifyRazorpayWebhook(body, signature, 'other')).toBe(false)
    expect(await verifyRazorpayWebhook(body, null, 'whsec_test')).toBe(false)
    expect(await verifyRazorpayWebhook(body, signature, '')).toBe(false)
    // Re-serialised JSON is not the raw body.
    expect(await verifyRazorpayWebhook(JSON.stringify(JSON.parse(body), null, 1), signature, 'whsec_test')).toBe(false)
  })

  const paidEvent = {
    entity: 'event',
    event: 'payment_link.paid',
    payload: {
      payment_link: {
        entity: { id: 'plink_1', reference_id: 'Q-ABC', status: 'paid', amount: 22950, amount_paid: 22950, currency: 'MYR', notes: { quotation_id: 'q1' } },
      },
      payment: { entity: { id: 'pay_1', amount: 22950, currency: 'MYR', status: 'captured', method: 'fpx' } },
    },
  }

  it('reads the parts of a payment link event', () => {
    expect(readWebhookEvent(paidEvent)).toEqual({
      event: 'payment_link.paid',
      linkId: 'plink_1',
      referenceId: 'Q-ABC',
      linkStatus: 'paid',
      amountPaid: 22950,
      currency: 'MYR',
      paymentId: 'pay_1',
      method: 'fpx',
      quotationId: 'q1',
    })
    expect(readWebhookEvent('x')).toBeNull()
    expect(readWebhookEvent({ event: 'payment_link.expired', payload: { payment_link: { entity: { id: 'plink_1' } } } })).toMatchObject({ linkId: 'plink_1', paymentId: null })
  })

  it('decides what each event does', () => {
    const event = readWebhookEvent(paidEvent)!
    const waiting = { id: 'q1', status: 'confirmed' as const, total: 229.5, rzpLinkId: 'plink_1' }
    expect(decideWebhook(event, waiting)).toEqual({ action: 'mark_paid' })
    expect(decideWebhook(event, { ...waiting, status: 'paid' })).toEqual({ action: 'already_paid' })
    expect(decideWebhook(event, null)).toEqual({ action: 'not_found' })
    expect(decideWebhook({ ...event, amountPaid: 22900 }, waiting)).toEqual({ action: 'paid_but_check', reason: 'Paid RM229.00, the quotation is RM229.50.' })
    expect(decideWebhook({ ...event, currency: 'SGD' }, waiting)).toMatchObject({ action: 'paid_but_check' })
    expect(decideWebhook(event, { ...waiting, status: 'cancelled' })).toMatchObject({ action: 'paid_but_check', reason: 'Paid after the quotation was cancelled.' })
    expect(decideWebhook(event, { ...waiting, rzpLinkId: 'plink_2' })).toMatchObject({ action: 'paid_but_check' })
    expect(decideWebhook({ ...event, event: 'payment_link.expired' }, waiting)).toEqual({ action: 'mark_expired' })
    expect(decideWebhook({ ...event, event: 'payment_link.cancelled' }, { ...waiting, status: 'paid' })).toMatchObject({ action: 'ignore' })
    expect(decideWebhook({ ...event, event: 'payment.captured' }, waiting)).toMatchObject({ action: 'ignore' })
  })
})

describe('settings', () => {
  it('missing or wrong values keep the defaults', () => {
    expect(readQuotationSettings(null)).toEqual(DEFAULT_QUOTATION_SETTINGS)
    const read = readQuotationSettings({
      enabled: true,
      expiryDays: 0,
      discountCapPercent: 15,
      enrolMethods: [{ name: '每月报名', rateTier: 'monthly', months: 1 }, { name: 'bad', rateTier: 'yearly', months: 12 }],
      discountReasons: [],
    })
    expect(read).toMatchObject({ enabled: true, expiryDays: 3, discountCapPercent: 15, discountReasons: DEFAULT_QUOTATION_SETTINGS.discountReasons })
    expect(read.enrolMethods).toEqual([{ name: '每月报名', rateTier: 'monthly', months: 1 }])
  })
})

describe('class times and the receipt', () => {
  it('a class’s weekly times in Chinese, Sunday first', async () => {
    const { classTimeLabel } = await import('../../supabase/functions/_shared/quotation/logic.ts')
    expect(
      classTimeLabel([
        { dayOfWeek: 6, startTime: '10:00:00', endTime: '11:30:00' },
        { dayOfWeek: 3, startTime: '20:00:00', endTime: '21:00:00' },
        { dayOfWeek: null, startTime: '09:00:00', endTime: '10:00:00' },
      ]),
    ).toBe('星期三 20:00–21:00, 星期六 10:00–11:30')
  })

  it('the receipt rows and a one-page PDF (brackets escaped, offsets right)', async () => {
    const { receiptRows, receiptPdf } = await import('../../supabase/functions/_shared/quotation/logic.ts')
    const rows = receiptRows({
      schoolName: 'EduHero',
      receiptNo: 'Q-ABC',
      paidAt: '2026-10-23T10:00:00Z',
      childName: 'Aiden (Tan)',
      startYear: 2026,
      startMonth: 11,
      endYear: 2027,
      endMonth: 1,
      lines: [
        { type: 'tuition_standard', amount: 585 },
        { type: 'postage', amount: 20 },
      ],
      discount: 25.5,
      total: 579.5,
      paymentMethod: 'fpx',
      paymentId: 'pay_1',
    })
    expect(rows).toContainEqual(['Months', 'Nov 2026 - Jan 2027'])
    expect(rows).toContainEqual(['Discount', '- RM 25.50'])
    expect(rows).toContainEqual(['Total paid', 'RM 579.50'])
    expect(rows).toContainEqual(['Paid by', 'FPX'])
    const pdf = new TextDecoder().decode(receiptPdf('EduHero 英雄', rows))
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf).toContain('(Aiden \\(Tan\\)) Tj')
    expect(pdf).toContain('(EduHero ??) Tj')
    // Each object starts where the cross-reference table says.
    const xrefAt = Number(pdf.match(/startxref\n(\d+)/)![1])
    expect(pdf.slice(xrefAt, xrefAt + 4)).toBe('xref')
    const offsets = [...pdf.slice(xrefAt).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]))
    offsets.forEach((offset, i) => expect(pdf.slice(offset, offset + 8)).toBe(`${i + 1} 0 obj\n`.slice(0, 8)))
  })
})

describe('Plan B: bank transfer', () => {
  it('settings: bank transfer only by default; the account must be written to be ready', async () => {
    const { bankReady, readQuotationSettings } = await import('../../supabase/functions/_shared/quotation/logic.ts')
    const plain = readQuotationSettings(null)
    expect(plain.paymentRoutes).toEqual(['bank_transfer'])
    expect(plain.bankReview).toBe(false)
    expect(bankReady(plain)).toBe(false)
    const set = readQuotationSettings({ paymentRoutes: ['razorpay', 'bank_transfer', 'cash'], bank: { bankName: 'Maybank', accountName: 'EduHero Sdn Bhd', accountNumber: '5140 1234 5678' }, bankReview: true })
    expect(set.paymentRoutes).toEqual(['bank_transfer', 'razorpay'])
    expect(set.bankReview).toBe(true)
    expect(bankReady(set)).toBe(true)
    expect(readQuotationSettings({ paymentRoutes: [] }).paymentRoutes).toEqual(['bank_transfer'])
  })

  it('confirming a transfer needs a date, the amount and the receipt; a different amount needs a reason', async () => {
    const { checkBankPayment } = await import('../../supabase/functions/_shared/quotation/logic.ts')
    const good = { paidOn: '2026-10-23', amount: 255, reference: 'MBB123', note: null, proofPath: 'q/1.pdf' }
    expect(checkBankPayment(good, 255, '2026-10-23')).toEqual({ ok: true, errors: [], amountDiffers: false })
    expect(checkBankPayment({ ...good, proofPath: null }, 255, '2026-10-23').errors).toEqual(['Add the parent’s receipt.'])
    expect(checkBankPayment({ ...good, paidOn: '2026-10-24' }, 255, '2026-10-23').errors).toEqual(['The transfer date cannot be in the future.'])
    expect(checkBankPayment({ ...good, paidOn: '' }, 255, '2026-10-23').errors).toEqual(['Write the date of the transfer.'])
    expect(checkBankPayment({ ...good, amount: 0 }, 255, '2026-10-23').errors[0]).toBe('Write the amount received.')
    const less = checkBankPayment({ ...good, amount: 250 }, 255, '2026-10-23')
    expect(less).toEqual({ ok: false, errors: ['The amount is not RM255.00: write why.'], amountDiffers: true })
    expect(checkBankPayment({ ...good, amount: 250, note: 'Bank charge RM5' }, 255, '2026-10-23')).toEqual({ ok: true, errors: [], amountDiffers: true })
    expect(checkBankPayment({ ...good, amount: 255.001 }, 255, '2026-10-23').amountDiffers).toBe(false)
  })
})

describe('§15: links and the QR', () => {
  it('only https links without spaces are kept', async () => {
    const { safeHttpsUrl, readQuotationSettings } = await import('../../supabase/functions/_shared/quotation/logic.ts')
    expect(safeHttpsUrl(' https://wa.me/60123 ')).toBe('https://wa.me/60123')
    expect(safeHttpsUrl('http://x.example')).toBeNull()
    expect(safeHttpsUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpsUrl('https://a b')).toBeNull()
    expect(safeHttpsUrl(`https://${'x'.repeat(500)}`)).toBeNull()
    const s = readQuotationSettings({ afterPayUrl: 'http://bad', contactUrl: 'https://wa.me/60111', paymentQr: { bank_transfer: 'qr/bank-1.png' } })
    expect(s).toMatchObject({ afterPayUrl: '', contactUrl: 'https://wa.me/60111', paymentQr: { bank_transfer: 'qr/bank-1.png' } })
    expect(readQuotationSettings({ paymentQr: { bank_transfer: '../secret.png' } }).paymentQr.bank_transfer).toBeNull()
  })

  it('after paying: the EC’s link, else the school’s, else none', async () => {
    const { afterPayUrlFor } = await import('../../supabase/functions/_shared/quotation/logic.ts')
    expect(afterPayUrlFor('https://wa.me/601', { afterPayUrl: 'https://school.example/thanks' })).toBe('https://wa.me/601')
    expect(afterPayUrlFor(null, { afterPayUrl: 'https://school.example/thanks' })).toBe('https://school.example/thanks')
    expect(afterPayUrlFor('http://bad', { afterPayUrl: '' })).toBeNull()
  })

  it('资料不对: the EC’s link, else the chat’s number, else the school’s; WhatsApp links get the message', async () => {
    const { contactUrlFor } = await import('../../supabase/functions/_shared/quotation/logic.ts')
    const text = encodeURIComponent('报价单 Q-ABC 资料不对：')
    expect(contactUrlFor({ ecContact: 'https://wa.me/60177', chatNumber: '60123', reference: 'Q-ABC' }, { contactUrl: '' })).toBe(`https://wa.me/60177?text=${text}`)
    expect(contactUrlFor({ ecContact: 'https://wa.me/60177?text=Hi', chatNumber: null, reference: 'Q-ABC' }, { contactUrl: '' })).toBe('https://wa.me/60177?text=Hi')
    expect(contactUrlFor({ ecContact: 'https://ec.example/me', chatNumber: null, reference: 'Q-ABC' }, { contactUrl: '' })).toBe('https://ec.example/me')
    expect(contactUrlFor({ ecContact: null, chatNumber: '+60 12-345 6789', reference: 'Q-ABC' }, { contactUrl: '' })).toBe(`https://wa.me/60123456789?text=${text}`)
    expect(contactUrlFor({ ecContact: null, chatNumber: null, reference: 'Q-ABC' }, { contactUrl: 'https://wa.me/60100' })).toBe(`https://wa.me/60100?text=${text}`)
    expect(contactUrlFor({ ecContact: null, chatNumber: '12', reference: 'Q-ABC' }, { contactUrl: '' })).toBeNull()
  })
})
