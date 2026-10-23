import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QuotationPanel, type QuotationApi } from './QuotationPanel'
import { guessAgeGroup } from '../../lib/quotationApi'
import { QuotePage, type QuotePageApi } from './QuotePage'
import type { FeeCalculatorData } from '../../lib/feeCalculator/api'
import type { QuotationRow } from '../../lib/quotationApi'
import type { Classroom, Lead } from '../../types/domain'
import { DEFAULT_INVOICE_TEMPLATE } from '../../lib/feeCalculator/types'
import { DEFAULT_GLOBAL_RATES, SEED_COHORTS, SEED_SUBJECTS } from '../../lib/feeCalculator/seed'
import { DEFAULT_QUOTATION_SETTINGS, type PublicQuotation } from '../../../supabase/functions/_shared/quotation/logic.ts'

const fees: FeeCalculatorData = {
  cohorts: SEED_COHORTS.map((c, i) => ({ id: i + 1, name: c.membershipName, sortOrder: i, isActive: true, materialsIncluded: c.materialsIncludedInTuition })),
  rates: SEED_COHORTS.flatMap((c, i) => c.rates.map((r) => ({ ...r, cohortId: i + 1 }))),
  subjects: SEED_SUBJECTS.map((s, i) => ({ ...s, id: i + 1, sortOrder: i, isActive: true, subjectId: null })),
  globalRates: DEFAULT_GLOBAL_RATES,
  invoiceTemplate: DEFAULT_INVOICE_TEMPLATE,
  membershipLevels: [],
}

const classrooms = [
  { id: 11, name: 'P4 Math', ageGroup: '9-11 Years Old', programLevel: 'x', teacherId: null, status: 'active', notes: null, archivedAt: null, category: 'regular', subjectId: null },
  { id: 12, name: 'Trial', ageGroup: '9-11 Years Old', programLevel: 'x', teacherId: null, status: 'active', notes: null, archivedAt: null, category: 'trial', subjectId: null },
] as unknown as Classroom[]

const lead = { id: 7, fullName: 'Parent', phone: '60123456789', children: [{ name: 'Aiden', age: 10, phone: null }] } as unknown as Lead

function api(overrides: Partial<QuotationApi> = {}): QuotationApi {
  return {
    loadFees: async () => fees,
    loadSettings: async () => ({ ...DEFAULT_QUOTATION_SETTINGS, enabled: true, publicBaseUrl: 'https://crm.example.test', bank: { bankName: 'Maybank', accountName: 'EduHero Sdn Bhd', accountNumber: '5140 1234 5678' } }),
    loadStaff: async () => [{ id: 5, name: 'LC Amy' }],
    loadQuotations: async () => [],
    loadClassTimes: async () => new Map([[11, '星期六 10:00–11:00']]),
    loadClassSizes: async () => new Map([[11, 8]]),
    send: vi.fn(async () => ({ ok: true as const, id: 'q1', status: 'sent' as const, total: 255, url: 'https://crm.example.test/?quote=T', invoiceText: '' })),
    approve: vi.fn(async () => ({ ok: true as const, url: null })),
    cancel: vi.fn(async () => ({ ok: true as const })),
    renew: vi.fn(async () => ({ ok: true as const, id: 'q2', status: 'sent' as const, total: 255, url: 'https://x/?quote=U', invoiceText: '' })),
    retry: vi.fn(async () => ({ ok: true as const })),
    loadPdfView: vi.fn(async () => ({ ok: true as const, quotation: shown, paymentsReady: false })),
    uploadProof: vi.fn(async () => ({ ok: true as const, path: 'b/receipt.pdf' })),
    markPaid: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  }
}

async function fillExample1(user: ReturnType<typeof userEvent.setup>) {
  for (const code of ['BMP', 'BMK', 'MM']) {
    await user.click(screen.getByRole('checkbox', { name: new RegExp(`^${code}`) }))
    await user.selectOptions(screen.getByLabelText(`Class for ${code}`), '11')
  }
  await user.click(screen.getByRole('checkbox', { name: 'Charge' }))
  await user.selectOptions(screen.getByLabelText('Registration month'), '10')
}

describe('Inbox Quotation tab', () => {
  it('guesses the grade from the age', () => {
    expect(guessAgeGroup(['6-8 Years Old', '9-11 Years Old'], 10)).toBe('9-11 Years Old')
    expect(guessAgeGroup(['Standard 4', 'Standard 5'], 10)).toBe('')
    expect(guessAgeGroup(['10 岁', '11 岁'], 10)).toBe('10 岁')
  })

  it('prices worked example 1 and puts the parent’s link in the message box', async () => {
    const user = userEvent.setup()
    const quoteApi = api()
    const write = vi.fn()
    render(<QuotationPanel lead={lead} chat={{ conversationId: 99, contactId: 3, inboxId: 1, phone: '60123456789' }} classrooms={classrooms} onWriteMessage={write} api={quoteApi} today={new Date(2026, 9, 23)} />)
    expect(await screen.findByLabelText('Child')).toHaveValue('Aiden')
    expect(screen.getByLabelText('Grade (lists its classes)')).toHaveValue('9-11 Years Old')
    await fillExample1(user)
    // Only the open regular class of the grade is offered, with its time and size.
    expect(screen.getByLabelText('Class for MM')).toHaveTextContent('P4 Math · 星期六 10:00–11:00 · 8 students')
    expect(screen.getByLabelText('Class for MM')).not.toHaveTextContent('Trial')
    expect(screen.getByTestId('quote-total')).toHaveTextContent('RM255.00')
    expect(screen.getByRole('button', { name: /Send quotation/ })).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Learning Consultant'), '5')
    await user.click(screen.getByRole('button', { name: /Send quotation/ }))
    expect(quoteApi.send).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 7,
        conversationId: 99,
        childName: 'Aiden',
        consultantId: 5,
        expectTotal: 255,
        classes: [
          { subjectCode: 'BMP', classroomId: 11 },
          { subjectCode: 'BMK', classroomId: 11 },
          { subjectCode: 'MM', classroomId: 11 },
        ],
        choices: expect.objectContaining({ cohortId: 1, enrolMethod: '每月报名', startYear: 2026, startMonth: 10, registrationMonth: 10, subjects: ['BMP', 'BMK', 'MM'] }),
      }),
    )
    expect(write).toHaveBeenCalledWith('这是 Aiden 的报价单，共 RM255.00。请点以下链接确认并付款（3 天内有效）：\nhttps://crm.example.test/?quote=T')
  })

  it('a discount over the cap is sent for approval; the reason is needed', async () => {
    const user = userEvent.setup()
    render(<QuotationPanel lead={lead} chat={{ conversationId: 99, contactId: 3, inboxId: 1, phone: null }} classrooms={classrooms} onWriteMessage={vi.fn()} api={api()} today={new Date(2026, 9, 23)} />)
    await screen.findByLabelText('Child')
    await fillExample1(user)
    await user.selectOptions(screen.getByLabelText('Learning Consultant'), '5')
    await user.type(screen.getByLabelText('Discount'), '30')
    expect(screen.getByText('Pick a reason for the discount.')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Reason'), '兄弟姐妹')
    expect(screen.getByTestId('quote-total')).toHaveTextContent('RM225.00')
    // RM30 of RM255 is 11.8%: over the 10% cap.
    expect(screen.getByRole('button', { name: /Send for approval/ })).toBeEnabled()
  })

  it('lists this chat’s quotations with what can be done next', async () => {
    const rows: QuotationRow[] = [
      { id: 'a', status: 'needs_approval', childName: 'Aiden', total: 200, subtotal: 255, discountAmount: 55, expiresAt: null, paidAt: null, publicToken: 'T', reference: 'Q-AAAAAAAAAAAA', paymentRoute: 'bank_transfer', fulfilStatus: null, fulfilError: null, loginStatus: null, createdAt: '', createdBy: 1, invoiceText: '' },
      { id: 'b', status: 'paid', childName: 'Bella', total: 255, subtotal: 255, discountAmount: 0, expiresAt: null, paidAt: '2026-10-23T00:00:00Z', publicToken: 'U', reference: 'Q-ABC', paymentRoute: 'razorpay', fulfilStatus: 'failed', fulfilError: 'Class is archived.', loginStatus: null, createdAt: '', createdBy: 1, invoiceText: '' },
    ]
    const user = userEvent.setup()
    const quoteApi = api({ loadQuotations: async () => rows })
    render(<QuotationPanel lead={lead} chat={{ conversationId: 99, contactId: 3, inboxId: 1, phone: null }} classrooms={classrooms} canApprove onWriteMessage={vi.fn()} api={quoteApi} />)
    expect(await screen.findByText('Needs approval')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Paid but not enrolled yet: Class is archived.')
    await user.click(screen.getByRole('button', { name: /Run again/ }))
    expect(quoteApi.retry).toHaveBeenCalledWith('b')
    await user.click(screen.getByRole('button', { name: /Approve discount/ }))
    expect(quoteApi.approve).toHaveBeenCalledWith('a')
  })
})

const shown: PublicQuotation = {
  status: 'viewed',
  schoolName: 'EduHero',
  childName: 'Aiden',
  phone: '••••6789',
  classes: [{ subject: 'Mathematics 数学', classroom: 'P4 Math', when: '星期六 10:00–11:00' }],
  months: '2026年10月',
  lines: [{ label: '标准科目学费（3科，2026年10月，共1个月）', amount: 195 }],
  subtotal: 255,
  discount: { label: '折扣（兄弟姐妹）', amount: 25.5 },
  total: 229.5,
  expiresAt: '2026-10-26T10:00:00Z',
  terms: '学费一经缴付恕不退还。',
  paidAt: null,
  paidMessage: '付款成功！',
  receiptNo: 'Q-3F2A9C1E0B4D',
  paymentRoute: 'razorpay',
  bank: null,
  bankNote: '',
}

function pageApi(overrides: Partial<QuotePageApi> = {}): QuotePageApi {
  return {
    view: vi.fn(async () => ({ ok: true as const, quotation: shown, paymentsReady: true })),
    confirm: vi.fn(async () => ({ ok: true as const, url: 'https://rzp.io/l/abc' })),
    status: vi.fn(async () => ({ ok: true as const, status: 'paid' as const, paidAt: '2026-10-23T10:00:00Z', total: 229.5 })),
    ...overrides,
  }
}

describe('the parent’s quotation page', () => {
  it('shows the classes, lines, discount and total; agree, then pay on Razorpay', async () => {
    const user = userEvent.setup()
    const goTo = vi.fn()
    const quoteApi = pageApi()
    render(<QuotePage token="T" returned={false} api={quoteApi} goTo={goTo} />)
    expect(await screen.findByText('Aiden')).toBeInTheDocument()
    expect(screen.getByText('P4 Math · 星期六 10:00–11:00')).toBeInTheDocument()
    expect(screen.getByText('折扣（兄弟姐妹）')).toBeInTheDocument()
    expect(screen.getByTestId('quote-page-total')).toHaveTextContent('RM229.50')
    const pay = screen.getByRole('button', { name: '确认并付款 RM229.50' })
    expect(pay).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /我已阅读并同意/ }))
    await user.click(pay)
    expect(quoteApi.confirm).toHaveBeenCalledWith('T')
    expect(goTo).toHaveBeenCalledWith('https://rzp.io/l/abc')
  })

  it('back from Razorpay: waits for our server’s notice, then shows it is paid', async () => {
    const status = vi
      .fn<QuotePageApi['status']>()
      .mockResolvedValueOnce({ ok: true, status: 'confirmed', paidAt: null, total: 229.5 })
      .mockResolvedValue({ ok: true, status: 'paid', paidAt: '2026-10-23T10:00:00Z', total: 229.5 })
    render(<QuotePage token="T" returned api={pageApi({ status })} goTo={vi.fn()} pollMs={30} />)
    expect(await screen.findByText('付款处理中，请稍候…')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('已付款 RM229.50')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /确认并付款/ })).not.toBeInTheDocument()
  })

  it('an expired or unknown link cannot be paid', async () => {
    render(<QuotePage token="T" returned={false} api={pageApi({ view: async () => ({ ok: true, quotation: { ...shown, status: 'expired' }, paymentsReady: true }) })} goTo={vi.fn()} />)
    expect(await screen.findByText('这张报价单已经过期，请联系顾问更新报价。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /确认并付款/ })).not.toBeInTheDocument()
  })

  it('says so when the link is not valid', async () => {
    render(<QuotePage token="T" returned={false} api={pageApi({ view: async () => ({ ok: false, error: 'This link is not valid.' }) })} goTo={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('This link is not valid.')
  })
})

describe('Plan B: bank transfer', () => {
  const sentRow: QuotationRow = {
    id: 'q9', status: 'viewed', childName: 'Aiden', total: 255, subtotal: 255, discountAmount: 0, expiresAt: '2026-10-26T00:00:00Z', paidAt: null,
    publicToken: 'T', reference: 'Q-AAAAAAAAAAAA', paymentRoute: 'bank_transfer', fulfilStatus: null, fulfilError: null, loginStatus: null, createdAt: '', createdBy: 1, invoiceText: '',
  }

  it('the EC marks a transfer paid: receipt required, a different amount needs a reason, submitted once', async () => {
    const user = userEvent.setup()
    const quoteApi = api({ loadQuotations: async () => [sentRow] })
    render(<QuotationPanel lead={lead} chat={{ conversationId: 99, contactId: 3, inboxId: 1, phone: null }} classrooms={classrooms} onWriteMessage={vi.fn()} api={quoteApi} today={new Date(2026, 9, 23)} />)
    await user.click(await screen.findByRole('button', { name: /Mark as paid/ }))
    const form = screen.getByRole('form', { name: 'Mark Aiden’s quotation as paid' })
    const submit = within(form).getByRole('button', { name: 'Submit' })
    expect(submit).toBeDisabled()
    await user.upload(within(form).getByLabelText('The parent’s receipt (photo or PDF)'), new File(['%PDF'], 'receipt.pdf', { type: 'application/pdf' }))
    expect(submit).toBeEnabled()
    const amount = within(form).getByLabelText('Amount received (RM)')
    await user.clear(amount)
    await user.type(amount, '250')
    expect(within(form).getByText('Not the quotation’s RM255.00. Write why below.')).toBeInTheDocument()
    expect(submit).toBeDisabled()
    await user.type(within(form).getByLabelText('Why the amount differs'), 'Bank charge')
    await user.type(within(form).getByLabelText('Bank reference (optional)'), 'MBB778899')
    expect(within(form).queryByText(/write why|Add the|Write the/)).toBeNull()
    expect(submit).toBeEnabled()
    await user.click(submit)
    expect(quoteApi.uploadProof).toHaveBeenCalledWith('q9', expect.any(File))
    expect(quoteApi.markPaid).toHaveBeenCalledWith('q9', { paidOn: '2026-10-23', amount: 250, reference: 'MBB778899', note: 'Bank charge', proofPath: 'b/receipt.pdf' })
    expect(await screen.findByText('Marked paid: the child is being enrolled and the login sent.')).toBeInTheDocument()
  })

  it('a quotation is sent as a bank transfer by default, and not before the bank account is written', async () => {
    const user = userEvent.setup()
    const quoteApi = api({ loadSettings: async () => ({ ...DEFAULT_QUOTATION_SETTINGS, enabled: true, publicBaseUrl: 'https://crm.example.test' }) })
    render(<QuotationPanel lead={lead} chat={{ conversationId: 99, contactId: 3, inboxId: 1, phone: null }} classrooms={classrooms} onWriteMessage={vi.fn()} api={quoteApi} today={new Date(2026, 9, 23)} />)
    expect(await screen.findByText(/The school’s bank account is not written yet/)).toBeInTheDocument()
    await fillExample1(user)
    await user.selectOptions(screen.getByLabelText('Learning Consultant'), '5')
    expect(screen.getByRole('button', { name: /Send quotation/ })).toBeDisabled()
    expect(screen.queryByLabelText('The parent pays by')).not.toBeInTheDocument()
  })

  it('the parent’s page shows the bank account and no pay button', async () => {
    const bank = { ...shown, paymentRoute: 'bank_transfer' as const, bank: { bankName: 'Maybank', accountName: 'EduHero Sdn Bhd', accountNumber: '5140 1234 5678' }, bankNote: '转账时请在备注写孩子的名字。' }
    render(<QuotePage token="T" returned={false} api={pageApi({ view: async () => ({ ok: true, quotation: bank, paymentsReady: false }) })} goTo={vi.fn()} />)
    expect(await screen.findByText('5140 1234 5678')).toBeInTheDocument()
    expect(screen.getByText('转账时请在备注写孩子的名字。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /确认并付款/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /下载报价单 PDF/ })).toBeInTheDocument()
  })
})
