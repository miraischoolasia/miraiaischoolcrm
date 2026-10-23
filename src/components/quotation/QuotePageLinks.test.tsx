import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QuotePage, type QuotePageApi } from './QuotePage'
import type { PublicQuotation } from '../../../supabase/functions/_shared/quotation/logic.ts'

// §15 (boss 2026-10-23): the QR, where the parent goes after paying, and "资料不对".

const shown: PublicQuotation = {
  status: 'viewed',
  schoolName: 'EduHero',
  childName: 'Aiden',
  phone: '••••6789',
  classes: [{ subject: 'Mathematics 数学', classroom: 'P4 Math', when: '星期六 10:00–11:00' }],
  months: '2026年10月',
  lines: [{ label: '标准科目学费（3科，2026年10月，共1个月）', amount: 195 }],
  subtotal: 255,
  discount: null,
  total: 255,
  expiresAt: '2026-10-26T10:00:00Z',
  terms: '',
  paidAt: null,
  paidMessage: '付款成功！',
  receiptNo: 'Q-3F2A9C1E0B4D',
  paymentRoute: 'bank_transfer',
  bank: { bankName: 'Maybank', accountName: 'EduHero Sdn Bhd', accountNumber: '5140 1234 5678' },
  bankNote: '',
  qrUrl: 'https://x.example/qr.png',
  qrPath: null,
  afterPayUrl: 'https://wa.me/60177',
  contactUrl: 'https://wa.me/60177?text=wrong',
  parentSaidPaid: false,
}

function pageApi(quotation: PublicQuotation, overrides: Partial<QuotePageApi> = {}): QuotePageApi {
  return {
    view: vi.fn(async () => ({ ok: true as const, quotation, paymentsReady: true })),
    confirm: vi.fn(async () => ({ ok: true as const, url: 'https://rzp.io/l/abc' })),
    status: vi.fn(async () => ({ ok: true as const, status: 'paid' as const, paidAt: '2026-10-23T10:00:00Z', total: 255 })),
    parentPaid: vi.fn(async () => ({ ok: true as const })),
    parentWrong: vi.fn(async () => ({ ok: true as const, contactUrl: 'https://wa.me/60177?text=x' })),
    ...overrides,
  }
}

describe('the parent’s page, §15', () => {
  it('bank transfer: the QR beside the bank details; "我已转账" tells the EC and shows the EC’s link', async () => {
    const user = userEvent.setup()
    const api = pageApi(shown)
    render(<QuotePage token="T" returned={false} api={api} goTo={vi.fn()} />)
    expect(await screen.findByRole('img', { name: '银行转账 QR Code' })).toHaveAttribute('src', 'https://x.example/qr.png')
    await user.click(screen.getByRole('button', { name: '资料正确，我已转账' }))
    expect(api.parentPaid).toHaveBeenCalledWith('T')
    expect(await screen.findByText(/顾问核对收款后/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /前往下一步/ })).toHaveAttribute('href', 'https://wa.me/60177')
    expect(screen.queryByRole('button', { name: '资料正确，我已转账' })).not.toBeInTheDocument()
  })

  it('a parent who already said they transferred sees the thank-you, not the button', async () => {
    render(<QuotePage token="T" returned={false} api={pageApi({ ...shown, parentSaidPaid: true })} goTo={vi.fn()} />)
    expect(await screen.findByText(/顾问核对收款后/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '资料正确，我已转账' })).not.toBeInTheDocument()
  })

  it('"资料不对，联系顾问" tells the EC and opens their WhatsApp', async () => {
    const user = userEvent.setup()
    const goTo = vi.fn()
    const api = pageApi(shown)
    render(<QuotePage token="T" returned={false} api={api} goTo={goTo} />)
    await user.click(await screen.findByRole('button', { name: /资料不对，联系顾问/ }))
    expect(api.parentWrong).toHaveBeenCalledWith('T')
    expect(goTo).toHaveBeenCalledWith('https://wa.me/60177?text=x')
  })

  it('Razorpay: the pay button says the details are right', async () => {
    render(<QuotePage token="T" returned={false} api={pageApi({ ...shown, paymentRoute: 'razorpay', bank: null, qrUrl: null })} goTo={vi.fn()} />)
    expect(await screen.findByRole('button', { name: '资料正确，前往付款 RM255.00' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /资料不对，联系顾问/ })).toBeInTheDocument()
  })

  it('back from paying: shows paid, then goes on to the EC’s link after 3 seconds, once', async () => {
    const goTo = vi.fn()
    const paid = { ...shown, paymentRoute: 'razorpay' as const, status: 'paid' as const, paidAt: '2026-10-23T10:00:00Z' }
    render(<QuotePage token="T" returned api={pageApi(paid)} goTo={goTo} />)
    expect(await screen.findByText('已付款 RM255.00')).toBeInTheDocument()
    expect(await screen.findByText(/秒后前往/)).toBeInTheDocument()
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('https://wa.me/60177'), { timeout: 5000 })
    expect(goTo).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /资料不对/ })).not.toBeInTheDocument()
  })

  it('opening a paid quotation later does not jump away', async () => {
    const goTo = vi.fn()
    const paid = { ...shown, status: 'paid' as const, paidAt: '2026-10-23T10:00:00Z' }
    render(<QuotePage token="T" returned={false} api={pageApi(paid)} goTo={goTo} />)
    expect(await screen.findByRole('link', { name: /前往下一步/ })).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 1200))
    expect(goTo).not.toHaveBeenCalled()
  })
})
