import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FeeCalculatorSection } from './FeeCalculatorSection'
import { FeeCalculatorForm } from './FeeCalculatorForm'
import type { FeeSettingsApi } from './FeeCalculatorSettings'
import { cohortEntries, subjectOptions, type FeeCalculatorData } from '../../lib/feeCalculator/api'
import { DEFAULT_INVOICE_TEMPLATE } from '../../lib/feeCalculator/types'
import { DEFAULT_GLOBAL_RATES, SEED_COHORTS, SEED_SUBJECTS } from '../../lib/feeCalculator/seed'

function seedData(): FeeCalculatorData {
  return {
    cohorts: SEED_COHORTS.map((cohort, index) => ({
      id: index + 1,
      name: cohort.membershipName,
      sortOrder: (index + 1) * 10,
      isActive: true,
      materialsIncluded: cohort.materialsIncludedInTuition,
    })),
    rates: SEED_COHORTS.flatMap((cohort, index) => cohort.rates.map((rate) => ({ ...rate, cohortId: index + 1 }))),
    subjects: SEED_SUBJECTS.map((subject, index) => ({ ...subject, id: index + 1, sortOrder: index, isActive: true, subjectId: null })),
    globalRates: DEFAULT_GLOBAL_RATES,
    invoiceTemplate: DEFAULT_INVOICE_TEMPLATE,
    membershipLevels: ['26001', '26002', 'LATEST'].map((name) => ({ name, isActive: true })),
  }
}

function api(): FeeSettingsApi {
  return {
    saveCohort: vi.fn(async () => null),
    saveRates: vi.fn(async () => null),
    saveSubject: vi.fn(async () => null),
    saveGlobalRates: vi.fn(async () => null),
    saveTemplate: vi.fn(async () => null),
    renameLevel: vi.fn(async () => null),
    addLevel: vi.fn(async () => null),
  }
}

function form(today: Date) {
  const data = seedData()
  render(
    <FeeCalculatorForm
      cohorts={cohortEntries(data)}
      globalRates={data.globalRates}
      primarySubjects={subjectOptions(data, 'primary')}
      secondarySubjects={subjectOptions(data, 'secondary')}
      bioChePhySubjects={subjectOptions(data, 'bio_che_phy')}
      invoiceTemplate={data.invoiceTemplate}
      today={today}
    />,
  )
}

describe('Fee Calculator', () => {
  it('works out worked example 1 from the clicks (26002, primary, West, this month = Oct 2026, 3 subjects, registration Oct)', async () => {
    const user = userEvent.setup()
    form(new Date(2026, 9, 22))
    expect(screen.getByLabelText('Price group (membership)')).toHaveValue('1')
    await user.click(screen.getByLabelText('Bahasa Melayu Pemahaman 国文理解'))
    await user.click(screen.getByLabelText('Bahasa Melayu Karangan 国文作文'))
    await user.click(screen.getByLabelText('Mathematics 数学'))
    await user.click(screen.getByLabelText('Charge the yearly registration fee this time'))
    await user.selectOptions(screen.getByLabelText('Registration month'), '10')
    expect(screen.getByTestId('fee-total')).toHaveTextContent('RM255.00')
    expect(screen.getByTestId('fee-invoice-text').textContent).toContain('下个月只需付 RM180.00/月')
  })

  it('offers last year to next year and picks the price column from the months', async () => {
    const user = userEvent.setup()
    form(new Date(2026, 9, 22))
    const years = within(screen.getByLabelText('Start year')).getAllByRole('option').map((option) => option.textContent)
    expect(years).toEqual(['2025', '2026', '2027'])
    expect(screen.getByLabelText('Start month')).toHaveValue('10')
    await user.selectOptions(screen.getByLabelText('End month'), '12')
    expect(screen.getByRole('button', { name: '3 months at once' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '6 months or more' }))
    expect(screen.getByLabelText('End year')).toHaveValue('2027')
    expect(screen.getByLabelText('End month')).toHaveValue('3')
  })

  it('shows the reason when the table has no price for that many subjects', async () => {
    const user = userEvent.setup()
    const data = seedData()
    // 26002 with only 1-2 subjects priced.
    data.rates = data.rates.filter((rate) => rate.cohortId !== 1 || rate.subjectCount <= 2)
    render(
      <FeeCalculatorForm
        cohorts={cohortEntries(data)}
        globalRates={data.globalRates}
        primarySubjects={subjectOptions(data, 'primary')}
        secondarySubjects={subjectOptions(data, 'secondary')}
        bioChePhySubjects={subjectOptions(data, 'bio_che_phy')}
        invoiceTemplate={data.invoiceTemplate}
        today={new Date(2026, 9, 1)}
      />,
    )
    for (const name of ['Bahasa Cina 华文', 'Mathematics 数学', 'Science 科学']) await user.click(screen.getByLabelText(name))
    expect(screen.getByRole('alert')).toHaveTextContent('找不到 3 科的标准学费收费表')
  })

  it('a consultant sees only the calculator; the edit tick adds Price settings', async () => {
    const user = userEvent.setup()
    const load = vi.fn(async () => seedData())
    const { unmount } = render(<FeeCalculatorSection canEdit={false} isAdmin={false} load={load} api={api()} />)
    expect(await screen.findByLabelText('Price group (membership)')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Price settings' })).not.toBeInTheDocument()
    unmount()

    render(<FeeCalculatorSection canEdit isAdmin={false} load={load} api={api()} />)
    await user.click(await screen.findByRole('tab', { name: 'Price settings' }))
    expect(screen.getByRole('heading', { name: 'Price groups' })).toBeInTheDocument()
    // Renaming a group renames a membership level: admin only.
    expect(screen.queryByRole('button', { name: 'Rename 26002' })).not.toBeInTheDocument()
  })

  it('saves a changed price table as whole rows, and refuses an empty price', async () => {
    const user = userEvent.setup()
    const settingsApi = api()
    render(<FeeCalculatorSection canEdit isAdmin load={async () => seedData()} api={settingsApi} />)
    await user.click(await screen.findByRole('tab', { name: 'Price settings' }))
    await user.click(screen.getAllByRole('button', { name: 'Edit prices' })[1])
    const cell = screen.getByLabelText('Primary, 1 subjects, Monthly')
    await user.clear(cell)
    await user.click(screen.getByRole('button', { name: 'Save prices of 26001' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Primary, 1 subject, Monthly: fill in a price of 0 or more.')
    expect(settingsApi.saveRates).not.toHaveBeenCalled()

    await user.type(cell, '60')
    await user.click(screen.getByRole('button', { name: 'Save prices of 26001' }))
    expect(settingsApi.saveRates).toHaveBeenCalledTimes(1)
    const [cohortId, materials, rows] = vi.mocked(settingsApi.saveRates).mock.calls[0]
    expect(cohortId).toBe(2)
    expect(materials).toBe(false)
    expect(rows).toHaveLength(63)
    expect(rows).toContainEqual({ level: 'primary', track: 'standard', subjectCount: 1, cycleTier: 'monthly', amount: 60 })
  })

  it('adds a group only for a membership level without one', async () => {
    const user = userEvent.setup()
    const settingsApi = api()
    render(<FeeCalculatorSection canEdit isAdmin={false} load={async () => seedData()} api={settingsApi} />)
    await user.click(await screen.findByRole('tab', { name: 'Price settings' }))
    const options = within(screen.getByLabelText('Add a group for')).getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['Pick a membership level', 'LATEST'])
    await user.selectOptions(screen.getByLabelText('Add a group for'), 'LATEST')
    await user.click(screen.getByRole('button', { name: 'Add group' }))
    expect(settingsApi.saveCohort).toHaveBeenCalledWith(null, { name: 'LATEST' })
  })
})

describe('a price group that uses another group’s prices (boss 2026-10-23)', () => {
  function withLatest(): FeeCalculatorData {
    const data = seedData()
    return { ...data, cohorts: [...data.cohorts, { id: 9, name: 'LATEST', sortOrder: 90, isActive: true, materialsIncluded: false, usesCohortId: 1 }] }
  }

  it('the calculator prices LATEST as the group it follows', () => {
    const entries = cohortEntries(withLatest())
    const first = entries.find((e) => e.key === '1')
    const latest = entries.find((e) => e.label === 'LATEST')
    expect(latest?.primary).toEqual(first?.primary)
    expect(latest?.materialsIncludedInTuition).toBe(first?.materialsIncludedInTuition)
  })

  it('settings: shows whose prices it uses, no price editing for it; back to its own; copy a table', async () => {
    const user = userEvent.setup()
    const data = withLatest()
    const first = data.cohorts[0]
    const second = data.cohorts[1]
    const settingsApi = { ...api(), followCohort: vi.fn(async () => null), copyRates: vi.fn(async () => null) }
    render(<FeeCalculatorSection canEdit isAdmin load={async () => data} api={settingsApi} />)
    await user.click(await screen.findByRole('tab', { name: 'Price settings' }))
    const row = screen.getByText(`uses ${first.name}'s prices`).closest('li') as HTMLElement
    expect(within(row).queryByRole('button', { name: 'Edit prices' })).not.toBeInTheDocument()
    expect(screen.getByLabelText(`Prices for ${first.name}`)).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Prices for LATEST'), 'Own prices')
    expect(settingsApi.followCohort).toHaveBeenCalledWith(9, null)
    await user.selectOptions(screen.getByLabelText(`Copy prices into ${second.name} from`), String(first.id))
    await user.click(within(screen.getByLabelText(`Copy prices into ${second.name} from`).closest('li') as HTMLElement).getByRole('button', { name: 'Copy' }))
    expect(settingsApi.copyRates).toHaveBeenCalledWith(second.id, first.id)
  })
})
