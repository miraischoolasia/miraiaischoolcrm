import { describe, expect, it } from 'vitest'
import { quotationPdfName, quotationPdfRows } from './quotationPdf'
import type { PublicQuotation } from '../../supabase/functions/_shared/quotation/logic.ts'

const q: PublicQuotation = {
  status: 'sent',
  schoolName: 'EduHero',
  childName: 'Aiden',
  phone: '••••6789',
  classes: [{ subject: 'Mathematics 数学', classroom: 'P4 Math', when: '星期六 10:00–11:00' }],
  months: '2026年10月',
  lines: [
    { label: '标准科目学费（3科，2026年10月，共1个月）', amount: 195 },
    { label: '资料费（11月12月，3科）', amount: 30 },
  ],
  subtotal: 225,
  discount: { label: '折扣（兄弟姐妹）', amount: 22.5 },
  total: 202.5,
  expiresAt: '2026-10-26T10:00:00+08:00',
  terms: '学费一经缴付恕不退还。',
  paidAt: null,
  paidMessage: '',
  receiptNo: 'Q-3F2A9C1E0B4D',
  paymentRoute: 'bank_transfer',
  bank: { bankName: 'Maybank', accountName: 'EduHero Sdn Bhd', accountNumber: '5140 1234 5678' },
  bankNote: '转账时请在备注写孩子的名字和报价单号。',
}

describe('the quotation PDF', () => {
  it('has what the parent’s page has, the kept lines, the discount and the bank account', () => {
    const rows = quotationPdfRows(q)
    expect(rows[0]).toEqual({ kind: 'title', text: 'EduHero' })
    expect(rows).toContainEqual({ kind: 'subtitle', text: '报价单 Q-3F2A9C1E0B4D' })
    expect(rows).toContainEqual({ kind: 'text', text: 'Mathematics 数学　P4 Math · 星期六 10:00–11:00' })
    expect(rows).toContainEqual({ kind: 'money', label: '标准科目学费（3科，2026年10月，共1个月）', amount: 'RM195.00' })
    expect(rows).toContainEqual({ kind: 'money', label: '折扣（兄弟姐妹）', amount: '-RM22.50', tone: 'discount' })
    expect(rows).toContainEqual({ kind: 'money', label: '总数', amount: 'RM202.50', strong: true })
    expect(rows).toContainEqual({ kind: 'text', text: '户口号码：5140 1234 5678' })
    expect(rows).toContainEqual({ kind: 'text', text: '转账时请在备注写孩子的名字和报价单号。', muted: true })
  })

  it('a Razorpay or paid quotation has no bank account on it', () => {
    expect(quotationPdfRows({ ...q, paymentRoute: 'razorpay', bank: null }).some((r) => r.kind === 'text' && r.text.startsWith('户口号码'))).toBe(false)
    const paid = quotationPdfRows({ ...q, status: 'paid' })
    expect(paid.some((r) => r.kind === 'text' && r.text.startsWith('户口号码'))).toBe(false)
    expect(paid).toContainEqual({ kind: 'text', text: '已付款 RM202.50' })
  })

  it('is named after the child and the number', () => {
    expect(quotationPdfName(q)).toBe('Quotation Aiden Q-3F2A9C1E0B4D.pdf')
    expect(quotationPdfName({ ...q, childName: 'A/B: C' })).toBe('Quotation A B  C Q-3F2A9C1E0B4D.pdf')
  })
})
