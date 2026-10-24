import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { guessGradeGroup } from '../../lib/quotationApi'
import { DEFAULT_QUOTATION_SETTINGS } from '../../../supabase/functions/_shared/quotation/logic.ts'
import { DEFAULT_INVOICE_TEMPLATE } from '../../lib/feeCalculator/types'
import { DEFAULT_GLOBAL_RATES, SEED_COHORTS, SEED_SUBJECTS } from '../../lib/feeCalculator/seed'
import { QuotationPanel } from './QuotationPanel'

// A school that shows school grade instead of age (EduHero, ③'s grade_level): the Quotation tab picks the class grade
// and the level from the child's grade; Mirai keeps age.

vi.mock('../../lib/ageDisplay', () => ({ useAgeDisplay: () => 'grade' }))
vi.mock('../../lib/ageGroups', () => ({ useAgeGroups: () => ['Year 3-4', 'Year 5-6', 'Form 1', 'Form 2', 'Form 3'] }))

describe('the class grade for a school grade', () => {
  it('finds names and ranges, primary and secondary', () => {
    const groups = ['Year 1-3', 'Year 4', 'P5', 'Form 1', 'F2', 'Form 3-5']
    expect(guessGradeGroup(groups, 2)).toBe('Year 1-3')
    expect(guessGradeGroup(groups, 4)).toBe('Year 4')
    expect(guessGradeGroup(groups, 5)).toBe('P5')
    expect(guessGradeGroup(groups, 7)).toBe('Form 1')
    expect(guessGradeGroup(groups, 8)).toBe('F2')
    expect(guessGradeGroup(groups, 10)).toBe('Form 3-5')
    expect(guessGradeGroup(groups, 6)).toBe('')
    expect(guessGradeGroup(groups, null)).toBe('')
  })

  it('Form 1 is not Year 1 (and the reverse); Chinese names too', () => {
    expect(guessGradeGroup(['Year 1', 'Form 1'], 7)).toBe('Form 1')
    expect(guessGradeGroup(['Form 1', 'Year 1'], 1)).toBe('Year 1')
    expect(guessGradeGroup(['中二', '中三'], 9)).toBe('中三')
    expect(guessGradeGroup(['四年级', '五年级'], 5)).toBe('五年级')
  })
})

describe('the Quotation tab in grade mode', () => {
  it('shows School grade instead of Age; the child’s Form 2 picks the Form 2 classes and secondary', async () => {
    const fees = {
      cohorts: SEED_COHORTS.map((c, i) => ({ id: i + 1, name: c.membershipName, sortOrder: i, isActive: true, materialsIncluded: c.materialsIncludedInTuition })),
      rates: SEED_COHORTS.flatMap((c, i) => c.rates.map((r) => ({ ...r, cohortId: i + 1 }))),
      subjects: SEED_SUBJECTS.map((s, i) => ({ ...s, id: i + 1, sortOrder: i, isActive: true, subjectId: null })),
      globalRates: DEFAULT_GLOBAL_RATES,
      invoiceTemplate: DEFAULT_INVOICE_TEMPLATE,
      membershipLevels: [],
    }
    const thisYear = new Date().getFullYear()
    const lead = {
      id: 7,
      fullName: 'Parent',
      phone: '60123456789',
      children: [
        { name: 'Mei', age: 14, phone: null, gradeLevel: 8, gradeYear: thisYear },
        { name: 'Kai', age: 10, phone: null, gradeLevel: 4, gradeYear: thisYear },
      ],
    }
    const api = {
      loadFees: async () => fees,
      loadSettings: async () => ({ ...DEFAULT_QUOTATION_SETTINGS, enabled: true }),
      loadStaff: async () => [],
      loadQuotations: async () => [],
      loadClassTimes: async () => new Map(),
      loadClassSizes: async () => new Map(),
    }
    const user = userEvent.setup()
    render(
      <QuotationPanel
        lead={lead as never}
        chat={{ conversationId: 99, contactId: 3, inboxId: 1, phone: null }}
        classrooms={[]}
        onWriteMessage={vi.fn()}
        api={api as never}
      />,
    )
    // The panel loads first; with the whole suite running at once that can take longer than the default 1 second.
    expect(await screen.findByLabelText('School grade', {}, { timeout: 10_000 })).toHaveValue('8')
    expect(screen.queryByLabelText('Age')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Grade (lists its classes)')).toHaveValue('Form 2'), { timeout: 10_000 })
    expect(screen.getByLabelText('Level')).toHaveValue('secondary')
    // Another child: Year 4 -> the Year 3-4 classes, primary.
    await user.clear(screen.getByLabelText('Child'))
    await user.type(screen.getByLabelText('Child'), 'Kai')
    expect(screen.getByLabelText('School grade')).toHaveValue('4')
    expect(screen.getByLabelText('Grade (lists its classes)')).toHaveValue('Year 3-4')
    expect(screen.getByLabelText('Level')).toHaveValue('primary')
  })
})
