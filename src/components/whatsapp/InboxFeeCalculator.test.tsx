import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InboxFeeCalculator } from './InboxFeeCalculator'
import { feeLevelOf } from '../../lib/inboxFees'
import type { FeeCalculatorData } from '../../lib/feeCalculator/api'
import type { Lead, Student } from '../../types/domain'
import { DEFAULT_INVOICE_TEMPLATE } from '../../lib/feeCalculator/types'
import { DEFAULT_GLOBAL_RATES, SEED_COHORTS, SEED_SUBJECTS } from '../../lib/feeCalculator/seed'

const fees: FeeCalculatorData = {
  cohorts: SEED_COHORTS.map((c, i) => ({ id: i + 1, name: c.membershipName, sortOrder: i, isActive: true, materialsIncluded: c.materialsIncludedInTuition })),
  rates: SEED_COHORTS.flatMap((c, i) => c.rates.map((r) => ({ ...r, cohortId: i + 1 }))),
  subjects: SEED_SUBJECTS.map((s, i) => ({ ...s, id: i + 1, sortOrder: i, isActive: true, subjectId: null })),
  globalRates: DEFAULT_GLOBAL_RATES,
  invoiceTemplate: DEFAULT_INVOICE_TEMPLATE,
  membershipLevels: [],
}

const today = '2026-10-23'
const leadWith = (gradeLevel: number | null) =>
  ({ id: 2, fullName: 'Parent', phone: '60123456789', children: [{ name: 'Aiden', age: null, phone: null, gradeLevel, gradeYear: 2026 }] }) as unknown as Lead

describe('feeLevelOf', () => {
  it('starts Form 1-5 on secondary and Year 1-6 on primary, from the lead or else the student', () => {
    expect(feeLevelOf(leadWith(8), [], today)).toBe('secondary')
    expect(feeLevelOf(leadWith(3), [], today)).toBe('primary')
    expect(feeLevelOf(leadWith(null), [], today)).toBeNull()
    expect(feeLevelOf(null, [], today)).toBeNull()
    expect(feeLevelOf(leadWith(null), [{ gradeLevel: 7, gradeYear: 2026 } as Student], today)).toBe('secondary')
  })

  it('moves the grade on with the years', () => {
    expect(feeLevelOf({ ...leadWith(6), children: [{ name: 'A', age: null, phone: null, gradeLevel: 6, gradeYear: 2025 }] } as unknown as Lead, [], today)).toBe(
      'secondary',
    )
  })
})

describe('InboxFeeCalculator', () => {
  it("opens on the child's level and hands the fees to the Quotation tab", async () => {
    const onUse = vi.fn()
    render(<InboxFeeCalculator lead={leadWith(8)} students={[]} load={async () => fees} onUseForQuotation={onUse} />)

    expect(await screen.findByText(/Started on secondary from the child/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Secondary' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getAllByRole('checkbox')[0])
    await userEvent.click(await screen.findByRole('button', { name: 'Use for a quotation' }))
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ level: 'secondary' }))
  })

  it('without a grade or quotations: the calculator as on its own page, no button', async () => {
    render(<InboxFeeCalculator lead={leadWith(null)} students={[]} load={async () => fees} />)

    expect(await screen.findByRole('button', { name: 'Primary' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/Started on/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use for a quotation' })).not.toBeInTheDocument()
  })

  it('says so when the prices cannot be read', async () => {
    render(<InboxFeeCalculator lead={null} students={[]} load={async () => null} />)
    expect(await screen.findByText(/prices could not be read/)).toBeInTheDocument()
  })
})
