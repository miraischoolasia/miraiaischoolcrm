import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CalendarFilterBar } from './CalendarFilterBar'
import { defaultCalendarFilter, type CalendarFilter, type CalendarTeam } from '../../lib/calendarFilter'

const people = [
  { id: 1, name: 'Ms Angeline' },
  { id: 2, name: 'Ms Joey' },
  { id: 3, name: 'Mr Kc' },
]

function Harness({ onChange, teams = [], canPickPeople = true }: { onChange: (filter: CalendarFilter) => void; teams?: CalendarTeam[]; canPickPeople?: boolean }) {
  const [filter, setFilter] = useState(defaultCalendarFilter())
  return (
    <CalendarFilterBar
      filter={filter}
      onChange={(next) => {
        setFilter(next)
        onChange(next)
      }}
      people={people}
      teams={teams}
      canPickPeople={canPickPeople}
    />
  )
}

describe('CalendarFilterBar', () => {
  it('turns "Only mine" on, which sets the team and people aside', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} teams={[{ id: 5, name: 'Science', memberIds: [1, 2] }]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Only mine' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ mine: true }))
    expect(screen.getByLabelText('Filter by team')).toBeDisabled()
    expect(screen.getByRole('button', { name: /People:/ })).toBeDisabled()
  })

  it('picks one or several people, found by name', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'People: Everyone' }))
    const picker = screen.getByRole('dialog', { name: 'Pick people' })
    await userEvent.type(within(picker).getByLabelText('Find a teacher or staff'), 'ms')
    expect(within(picker).queryByText('Mr Kc')).not.toBeInTheDocument()
    await userEvent.click(within(picker).getByLabelText('Ms Joey'))
    await userEvent.click(within(picker).getByLabelText('Ms Angeline'))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ personIds: [2, 1] }))
    expect(screen.getByRole('button', { name: 'People: 2 people' })).toBeInTheDocument()
  })

  it('picks a team, and says when the school has none yet', async () => {
    const onChange = vi.fn()
    const { unmount } = render(<Harness onChange={onChange} />)
    expect(screen.getByLabelText('Filter by team')).toBeDisabled()
    expect(screen.getByRole('option', { name: 'No teams yet' })).toBeInTheDocument()
    unmount()

    render(<Harness onChange={onChange} teams={[{ id: 5, name: 'Science', memberIds: [1, 2] }]} />)
    await userEvent.selectOptions(screen.getByLabelText('Filter by team'), 'Science')
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ teamId: 5 }))
  })

  it('from every kind, a click shows only that kind; more clicks add kinds; "All kinds" brings them back', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const kinds = screen.getByRole('group', { name: 'Kinds shown' })
    await userEvent.click(within(kinds).getByRole('button', { name: 'Follow-ups' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ kinds: ['follow_up'] }))
    await userEvent.click(within(kinds).getByRole('button', { name: 'Tasks' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ kinds: ['follow_up', 'task'] }))
    await userEvent.click(within(kinds).getByRole('button', { name: 'All kinds' }))
    expect(onChange.mock.lastCall?.[0].kinds).toHaveLength(7)
  })

  it('clears every filter at once, and offers no people or team to an account that only sees its own', async () => {
    const onChange = vi.fn()
    const { unmount } = render(<Harness onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Only mine' }))
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onChange).toHaveBeenLastCalledWith(defaultCalendarFilter())
    unmount()

    render(<Harness onChange={onChange} canPickPeople={false} />)
    expect(screen.queryByLabelText('Filter by team')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /People:/ })).not.toBeInTheDocument()
  })
})
