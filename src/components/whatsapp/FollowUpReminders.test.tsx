import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CalendarItem } from '../../lib/calendarItems'
import { FollowUpReminders } from './FollowUpReminders'

const now = () => new Date(2026, 9, 17, 15, 30)

const item = (id: number, change: Partial<CalendarItem> = {}): CalendarItem => ({
  id,
  kind: 'task',
  title: 'Follow up Mei Ling',
  notes: 'ask about F4',
  date: '2026-10-17',
  startTime: '15:00',
  endTime: null,
  zoomLink: null,
  assigneeId: 1,
  leadId: 11,
  isDone: false,
  createdBy: 1,
  ...change,
})

describe('FollowUpReminders', () => {
  it('shows nothing when nothing is due', () => {
    const { container } = render(<FollowUpReminders due={[]} onOpen={vi.fn()} onDone={vi.fn()} onSnooze={vi.fn()} now={now} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('opens the chat, ticks it off, or puts it off', async () => {
    const onOpen = vi.fn()
    const onDone = vi.fn().mockResolvedValue(null)
    const onSnooze = vi.fn()
    render(<FollowUpReminders due={[item(5)]} onOpen={onOpen} onDone={onDone} onSnooze={onSnooze} now={now} />)

    expect(screen.getByText('Follow up Mei Ling')).toBeInTheDocument()
    expect(screen.getByText('Today 15:00 · ask about F4')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open chat' }))
    expect(onOpen).toHaveBeenCalledWith(11)
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(5))
    await userEvent.selectOptions(screen.getByLabelText('Remind me again: Follow up Mei Ling'), 'hour')
    expect(onSnooze).toHaveBeenCalledWith(5, now().getTime() + 60 * 60 * 1000)
  })

  it('shows the first three and counts the rest', () => {
    render(<FollowUpReminders due={[item(1), item(2), item(3), item(4), item(5)]} onOpen={vi.fn()} onDone={vi.fn()} onSnooze={vi.fn()} now={now} />)

    expect(screen.getAllByRole('button', { name: 'Open chat' })).toHaveLength(3)
    expect(screen.getByText('+2 more follow-ups due')).toBeInTheDocument()
  })

  it('shows what the server says when ticking off fails', async () => {
    render(<FollowUpReminders due={[item(5)]} onOpen={vi.fn()} onDone={vi.fn().mockResolvedValue('Could not save.')} onSnooze={vi.fn()} now={now} />)
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save.')
  })
})
