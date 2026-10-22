import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Programme } from '../../lib/programmes'
import { MAX_TABS, offerEntries, ProgrammeSwitch, type Offer } from './ProgrammeSwitch'

const offer = (id: number, label: string, category: string | null = null, legacy: Offer['legacy'] = null): Offer => ({
  key: String(id),
  label,
  legacy,
  programme: { id, name: label, legacyKey: legacy, outcome: 'booking', messageTemplate: '', isActive: true, sortOrder: id, steps: [], category } as Programme,
})

describe('ProgrammeSwitch', () => {
  it('shows nothing when there is only one offer', () => {
    const { container } = render(<ProgrammeSwitch offers={[offer(1, 'Regular Class')]} current="1" followed={new Set()} onChange={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('puts every offer without a category side by side, each under its own name', async () => {
    const onChange = vi.fn()
    render(
      <ProgrammeSwitch
        offers={[offer(1, 'HOA class', null, 'hoa'), offer(2, 'Holiday Camp', null, 'camp'), offer(3, 'Regular Class')]}
        current="1"
        followed={new Set()}
        onChange={onChange}
      />,
    )
    expect(screen.getByRole('button', { name: 'HOA class' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Regular Class' }))
    expect(onChange).toHaveBeenCalledWith('3')
  })

  it('groups the offers of one category behind a single tab, and lists them when that tab is open', async () => {
    const onChange = vi.fn()
    render(
      <ProgrammeSwitch
        offers={[offer(1, 'Regular Class'), offer(2, 'Form 4 exam', 'Exam'), offer(3, 'Form 5 exam', 'exam')]}
        current="1"
        followed={new Set()}
        onChange={onChange}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Form 4 exam' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Exam/ }))
    expect(onChange).toHaveBeenCalledWith('2')
  })

  it('shows the offers of the open category under the tabs', () => {
    render(
      <ProgrammeSwitch
        offers={[offer(1, 'Regular Class'), offer(2, 'Form 4 exam', 'Exam'), offer(3, 'Form 5 exam', 'Exam')]}
        current="3"
        followed={new Set(['2'])}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('group', { name: 'Exam: pick one' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Form 5 exam' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Form 4 exam/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Already on this lead')).toBeInTheDocument()
  })

  it('folds into one drop-down, grouped by category, when there are too many for tabs', async () => {
    const offers = [
      ...Array.from({ length: MAX_TABS }, (_, index) => offer(index + 1, `Plain ${index + 1}`)),
      offer(20, 'Form 4 exam', 'Exam'),
    ]
    const onChange = vi.fn()
    render(<ProgrammeSwitch offers={offers} current="1" followed={new Set()} onChange={onChange} />)
    const select = screen.getByRole('combobox', { name: 'What are they signing up for' })
    expect(screen.getByRole('group', { name: 'Exam' })).toBeInTheDocument()
    await userEvent.selectOptions(select, '20')
    expect(onChange).toHaveBeenCalledWith('20')
  })

  it('turns a long category into a drop-down of its own', () => {
    const offers = [offer(1, 'Regular Class'), ...Array.from({ length: MAX_TABS + 1 }, (_, index) => offer(10 + index, `Exam ${index + 1}`, 'Exam'))]
    render(<ProgrammeSwitch offers={offers} current="10" followed={new Set()} onChange={vi.fn()} />)
    expect(screen.getByRole('combobox', { name: 'Exam: pick one' })).toBeInTheDocument()
  })

  it('builds one entry per offer and one per category, in order', () => {
    const entries = offerEntries([offer(1, 'A'), offer(2, 'B', 'Exam'), offer(3, 'C'), offer(4, 'D', 'EXAM')])
    expect(entries.map((entry) => (entry.kind === 'offer' ? entry.offer.label : `${entry.label}(${entry.offers.length})`))).toEqual(['A', 'Exam(2)', 'C'])
  })
})
