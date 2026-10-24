import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CalendarItem } from '../lib/calendarItems'
import { FollowUpWorklist } from './FollowUpWorklist'

const now = new Date(2026, 9, 17, 15, 30)
const item = (id: number, date: string, leadId: number, change: Partial<CalendarItem> = {}): CalendarItem => ({
  id, kind: 'task', title: `Follow up ${id}`, notes: null, date, startTime: '10:00', endTime: null, zoomLink: null,
  assigneeId: 1, leadId, isDone: false, createdBy: null, followupRound: 1, followupStep: 1, ...change,
})
const items = [item(1, '2026-10-15', 11), item(2, '2026-10-17', 12), item(3, '2026-10-20', 13)]

function setup() {
  const props = {
    onDone: vi.fn(async () => null),
    onCloseLead: vi.fn(async () => null),
    onOpenChat: vi.fn(),
  }
  render(<FollowUpWorklist items={items} meId={1} seesAll={false} leadNameOf={(id) => `Family ${id}`} now={now} {...props} />)
  return props
}

describe('FollowUpWorklist', () => {
  it('lists overdue, today and the next 7 days', () => {
    setup()
    expect(screen.getByText('1 overdue · 1 today · 1 in the next 7 days')).toBeInTheDocument()
    expect(screen.getByText('Overdue (1)')).toBeInTheDocument()
    expect(screen.getByText('Family 13')).toBeInTheDocument()
  })

  it('marks one done at once, and several only when ticked and confirmed', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Mark Family 11 done' }))
    expect(props.onDone).toHaveBeenCalledWith([1])

    expect(screen.queryByRole('button', { name: /Mark \d+ done/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Pick Family 11' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Pick Family 12' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mark 2 done' }))
    expect(props.onDone).toHaveBeenCalledTimes(1)
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Yes' }))
    expect(props.onDone).toHaveBeenLastCalledWith([1, 2])
  })

  it('closes a lead after asking, and opens its chat', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Close Family 12' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Close Family 12? The lead becomes Lost')
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(props.onCloseLead).toHaveBeenCalledWith(12)
    await userEvent.click(screen.getAllByRole('button', { name: /Chat/ })[0])
    expect(props.onOpenChat).toHaveBeenCalledWith(11)
  })
})
