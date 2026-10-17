import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CalendarItem } from '../../lib/calendarItems'
import { FollowUpButton, FollowUpChip } from './FollowUpButton'

// Saturday 17 Oct 2026, 15:30.
const now = () => new Date(2026, 9, 17, 15, 30)

const people = [
  { id: 1, name: 'Amy' },
  { id: 2, name: 'Ben' },
]

const item = (id: number, change: Partial<CalendarItem> = {}): CalendarItem => ({
  id,
  kind: 'task',
  title: 'Follow up Mei Ling',
  notes: null,
  date: '2026-10-18',
  startTime: '10:00',
  endTime: null,
  zoomLink: null,
  assigneeId: 1,
  leadId: 11,
  isDone: false,
  createdBy: 1,
  ...change,
})

function renderButton(props: Partial<React.ComponentProps<typeof FollowUpButton>> = {}) {
  const handlers = {
    onSave: vi.fn().mockResolvedValue(null),
    onDone: vi.fn().mockResolvedValue(null),
    onRemove: vi.fn().mockResolvedValue(null),
  }
  render(<FollowUpButton leadId={11} leadName="Mei Ling" items={[]} people={people} meId={1} now={now} {...handlers} {...props} />)
  return handlers
}

const openButton = () => screen.getByRole('button', { name: /^Follow up: set a day/ })

describe('FollowUpButton', () => {
  it('is switched off for a chat with no lead, and says why', () => {
    renderButton({ leadId: null })

    expect(openButton()).toBeDisabled()
    expect(openButton()).toHaveAttribute('title', expect.stringContaining('Save this chat as a lead first'))
  })

  it('sets a follow-up from a quick choice, to remind the person who is signed in', async () => {
    const { onSave } = renderButton()
    await userEvent.click(openButton())

    await userEvent.click(screen.getByRole('button', { name: 'Tomorrow 10:00 am' }))
    await userEvent.type(screen.getByPlaceholderText(/ask about the F4/), 'ask about F4')
    await userEvent.click(screen.getByRole('button', { name: 'Set the reminder' }))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'task',
          title: 'Follow up Mei Ling',
          date: '2026-10-18',
          startTime: '10:00',
          notes: 'ask about F4',
          assigneeId: 1,
          leadId: 11,
        }),
      ),
    )
  })

  it('lets the reminder go to another person', async () => {
    const { onSave } = renderButton()
    await userEvent.click(openButton())

    await userEvent.click(screen.getByRole('button', { name: 'In 3 days' }))
    await userEvent.selectOptions(screen.getByLabelText('Remind'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Set the reminder' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: 2, date: '2026-10-20' })))
  })

  it('asks for a day and time before saving, and refuses one that has passed', async () => {
    const { onSave } = renderButton()
    await userEvent.click(openButton())

    await userEvent.click(screen.getByRole('button', { name: 'Set the reminder' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Pick the day.')

    await userEvent.type(screen.getByLabelText('Day'), '2026-10-17')
    await userEvent.type(screen.getByLabelText('Time'), '09:00')
    await userEvent.click(screen.getByRole('button', { name: 'Set the reminder' }))
    expect(screen.getByRole('alert')).toHaveTextContent('That time has already passed.')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('shows what is saved on the server when it says no', async () => {
    renderButton({ onSave: vi.fn().mockResolvedValue('You may not add this.') })
    await userEvent.click(openButton())
    await userEvent.click(screen.getByRole('button', { name: 'Tomorrow 10:00 am' }))
    await userEvent.click(screen.getByRole('button', { name: 'Set the reminder' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('You may not add this.')
  })

  it('lists the lead\'s follow-ups, with who is reminded, and ticks one off or removes it', async () => {
    const { onDone, onRemove } = renderButton({
      items: [item(1), item(2, { leadId: 99 }), item(3, { date: '2026-10-17', startTime: '14:00', assigneeId: 2, notes: 'call' })],
    })
    await userEvent.click(openButton())

    const list = screen.getByRole('list', { name: 'Follow-ups set' })
    expect(list).toHaveTextContent('Today 14:00 · late')
    expect(list).toHaveTextContent('Ben · call')
    expect(list).toHaveTextContent('Tomorrow 10:00')
    expect(list.querySelectorAll('li')).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: 'Done: Tomorrow 10:00' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(1))
    await userEvent.click(screen.getByRole('button', { name: 'Remove: Today 14:00' }))
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(3))
  })
})

describe('FollowUpChip', () => {
  it('names the next follow-up, and says when it is late', () => {
    const { rerender } = render(<FollowUpChip leadId={11} items={[item(1)]} now={now} />)
    expect(screen.getByText(/Follow up: Tomorrow 10:00/)).toBeInTheDocument()

    rerender(<FollowUpChip leadId={11} items={[item(1, { date: '2026-10-17', startTime: '09:00' })]} now={now} />)
    expect(screen.getByText(/Follow up: Today 09:00 \(late\)/)).toBeInTheDocument()
  })

  it('shows nothing when the lead has none', () => {
    const { container } = render(<FollowUpChip leadId={11} items={[item(1, { leadId: 99 })]} now={now} />)

    expect(container).toBeEmptyDOMElement()
  })
})
