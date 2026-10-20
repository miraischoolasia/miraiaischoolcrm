import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), add: vi.fn(), hide: vi.fn() }))

vi.mock('../lib/studentExtras', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchMonthPlans: (...args: unknown[]) => mocks.fetch(...args),
  addMonthPlan: (...args: unknown[]) => mocks.add(...args),
  hideMonthPlan: (...args: unknown[]) => mocks.hide(...args),
}))

const { MonthPlansCard } = await import('./MonthPlansCard')

const classes = [
  { id: 5, name: 'Year 5 Maths' },
  { id: 6, name: 'Year 5 Science' },
]
const maths = { id: 1, studentId: 9, classroomId: 5, startDate: '2026-11-01', months: 3, endDate: '2027-01-31', remark: null, createdAt: '' }

describe('MonthPlansCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.add.mockResolvedValue(null)
    mocks.hide.mockResolvedValue(null)
  })

  it('shows nothing before the database update', async () => {
    mocks.fetch.mockResolvedValue(null)
    const { container } = render(<MonthPlansCard studentId={9} classes={classes} canEdit todayString="2026-10-19" />)

    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('lists each subject with its own months', async () => {
    mocks.fetch.mockResolvedValue([maths])
    render(<MonthPlansCard studentId={9} classes={classes} canEdit todayString="2026-10-19" />)

    const mathsRow = (await screen.findByText('Year 5 Maths')).closest('li')!
    expect(mathsRow).toHaveTextContent('Nov 1, 2026 – Jan 31, 2027 · 3 months')
    expect(screen.getByText('Year 5 Science').closest('li')).toHaveTextContent('No months yet')
  })

  it('renews a subject from the day after it ends, with the end worked out', async () => {
    mocks.fetch.mockResolvedValue([maths])
    render(<MonthPlansCard studentId={9} classes={classes} canEdit todayString="2026-10-19" />)

    const mathsRow = (await screen.findByText('Year 5 Maths')).closest('li')!
    await userEvent.click(within(mathsRow).getByRole('button', { name: 'Renew' }))
    expect(screen.getByLabelText('First day')).toHaveValue('2027-02-01')
    await userEvent.clear(screen.getByLabelText('Months'))
    await userEvent.type(screen.getByLabelText('Months'), '6')
    expect(screen.getByText('Ends Jul 31, 2027')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save months' }))
    expect(mocks.add).toHaveBeenCalledWith({ studentId: 9, classroomId: 5, startDate: '2027-02-01', months: 6, remark: '' })
  })

  it('offers no changes without Students edit', async () => {
    mocks.fetch.mockResolvedValue([maths])
    render(<MonthPlansCard studentId={9} classes={classes} canEdit={false} todayString="2026-10-19" />)

    await screen.findByText('Year 5 Maths')
    expect(screen.queryByRole('button', { name: 'Add months' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Renew' })).not.toBeInTheDocument()
  })
})
