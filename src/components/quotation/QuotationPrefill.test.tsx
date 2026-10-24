import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QuotationPanel, type QuotationApi } from './QuotationPanel'
import { FeeCalculatorForm, type FeeCalculatorSelection } from '../feeCalculator/FeeCalculatorForm'
import { cohortEntries, subjectOptions, type FeeCalculatorData } from '../../lib/feeCalculator/api'
import type { Classroom, Lead } from '../../types/domain'
import { DEFAULT_INVOICE_TEMPLATE } from '../../lib/feeCalculator/types'
import { DEFAULT_GLOBAL_RATES, SEED_COHORTS, SEED_SUBJECTS } from '../../lib/feeCalculator/seed'
import { DEFAULT_QUOTATION_SETTINGS } from '../../../supabase/functions/_shared/quotation/logic.ts'

// Department 1 puts the Fee Calculator in the Inbox side panel: its "Use for a quotation" fills the Quotation form.

const fees: FeeCalculatorData = {
  cohorts: SEED_COHORTS.map((c, i) => ({ id: i + 1, name: c.membershipName, sortOrder: i, isActive: true, materialsIncluded: c.materialsIncludedInTuition })),
  rates: SEED_COHORTS.flatMap((c, i) => c.rates.map((r) => ({ ...r, cohortId: i + 1 }))),
  subjects: SEED_SUBJECTS.map((s, i) => ({ ...s, id: i + 1, sortOrder: i, isActive: true, subjectId: null })),
  globalRates: DEFAULT_GLOBAL_RATES,
  invoiceTemplate: DEFAULT_INVOICE_TEMPLATE,
  membershipLevels: [],
}

const lead = { id: 7, fullName: 'Parent', phone: '60123456789', children: [{ name: 'Aiden', age: 10, phone: null }] } as unknown as Lead
const classrooms = [] as Classroom[]

function api(): QuotationApi {
  return {
    loadFees: async () => fees,
    loadSettings: async () => ({ ...DEFAULT_QUOTATION_SETTINGS, enabled: true }),
    loadStaff: async () => [],
    loadQuotations: async () => [],
    loadClassTimes: async () => new Map(),
    loadClassSizes: async () => new Map(),
    send: vi.fn(),
    approve: vi.fn(),
    cancel: vi.fn(),
    renew: vi.fn(),
    retry: vi.fn(),
    loadPdfView: vi.fn(),
    uploadProof: vi.fn(),
    markPaid: vi.fn(),
  } as unknown as QuotationApi
}

describe('Fee Calculator → quotation', () => {
  it('the calculator opens on the level given and hands its choices to "Use for a quotation"', async () => {
    const user = userEvent.setup()
    const onUse = vi.fn()
    render(
      <FeeCalculatorForm
        cohorts={cohortEntries(fees)}
        globalRates={fees.globalRates}
        primarySubjects={subjectOptions(fees, 'primary')}
        secondarySubjects={subjectOptions(fees, 'secondary')}
        bioChePhySubjects={subjectOptions(fees, 'bio_che_phy')}
        invoiceTemplate={fees.invoiceTemplate}
        today={new Date(2026, 9, 23)}
        initialLevel="secondary"
        onUse={onUse}
      />,
    )
    await user.click(screen.getAllByRole('checkbox')[0])
    await user.click(await screen.findByRole('button', { name: 'Use for a quotation' }))
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ level: 'secondary', cohortKey: '1', startYear: 2026, startMonth: 10, chargeRegistration: false }))
    expect((onUse.mock.calls[0][0] as FeeCalculatorSelection).subjects).toHaveLength(1)
  })

  it('without onUse there is no button (the Fee Calculator page as before)', () => {
    render(
      <FeeCalculatorForm
        cohorts={cohortEntries(fees)}
        globalRates={fees.globalRates}
        primarySubjects={subjectOptions(fees, 'primary')}
        secondarySubjects={subjectOptions(fees, 'secondary')}
        bioChePhySubjects={subjectOptions(fees, 'bio_che_phy')}
        invoiceTemplate={fees.invoiceTemplate}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Use for a quotation' })).not.toBeInTheDocument()
  })

  it('the Quotation form is filled from it: group, level, start, the enrol method of as many months, subjects, registration', async () => {
    const selection: FeeCalculatorSelection = {
      cohortKey: '2',
      level: 'primary',
      region: 'east_malaysia',
      rateTier: '3mo',
      startYear: 2026,
      startMonth: 11,
      endYear: 2027,
      endMonth: 1,
      subjects: ['BMP', 'MM'],
      bioChePhy: [],
      chargeRegistration: true,
      anniversaryMonth: 11,
    }
    render(
      <QuotationPanel
        lead={lead}
        chat={{ conversationId: 99, contactId: 3, inboxId: 1, phone: null }}
        classrooms={classrooms}
        onWriteMessage={vi.fn()}
        api={api()}
        today={new Date(2026, 9, 23)}
        prefill={{ id: 1, selection }}
      />,
    )
    await waitFor(() => expect(screen.getByLabelText('Membership')).toHaveValue('2'))
    expect(screen.getByLabelText('How they enrol')).toHaveValue('3个月一次性报名')
    expect(screen.getByLabelText('Region')).toHaveValue('east_malaysia')
    expect(screen.getByLabelText('Start month')).toHaveValue('11')
    expect(screen.getByRole('checkbox', { name: /^BMP/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /^MM/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /^BMK/ })).not.toBeChecked()
    expect(screen.getByLabelText('Registration month')).toHaveValue('11')
  })
})
