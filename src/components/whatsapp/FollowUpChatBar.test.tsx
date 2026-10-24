import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CalendarItem } from '../../lib/calendarItems'
import { FollowUpChatBar } from './FollowUpChatBar'

const now = new Date(2026, 9, 17, 15, 30)
const item: CalendarItem = {
  id: 7, kind: 'task', title: 'Follow up 2/5', notes: null, date: '2026-10-16', startTime: '10:00', endTime: null,
  zoomLink: null, assigneeId: 1, leadId: 11, isDone: false, createdBy: null, followupRound: 1, followupStep: 2,
}

describe('FollowUpChatBar', () => {
  it('says which follow-up is due, ticks it done and moves it to another day', async () => {
    const onDone = vi.fn(async () => null)
    const onChangeDate = vi.fn(async () => null)
    render(<FollowUpChatBar item={item} stepLabel="2/5" state="late" handlerName="Amy" onDone={onDone} onChangeDate={onChangeDate} now={now} />)

    expect(screen.getByRole('region', { name: 'Follow-up' })).toHaveTextContent('Follow-up 2/5 · overdue, Fri 16 Oct, 10:00 · Amy')
    await userEvent.click(screen.getByRole('button', { name: /Done/ }))
    expect(onDone).toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Change date' }))
    const day = screen.getByLabelText('New day for this follow-up')
    await userEvent.clear(day)
    await userEvent.type(day, '2026-10-20')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onChangeDate).toHaveBeenCalledWith('2026-10-20')
  })

  it('puts the template for this follow-up in the message box, or lets the team pick one of several', async () => {
    const onUseTemplate = vi.fn()
    const reply = (id: number, title: string) => ({ id, title, steps: [{ kind: 'text' as const, text: 'Hi' }], isActive: true, followupStep: 2 })
    const { rerender } = render(
      <FollowUpChatBar item={item} stepLabel="2/5" state="today" onDone={vi.fn()} onChangeDate={vi.fn()} templates={[reply(1, 'Math 2nd')]} onUseTemplate={onUseTemplate} now={now} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Use template' }))
    expect(onUseTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))

    rerender(
      <FollowUpChatBar
        item={item}
        stepLabel="2/5"
        state="today"
        onDone={vi.fn()}
        onChangeDate={vi.fn()}
        templates={[reply(1, 'Math 2nd'), reply(2, 'English 2nd')]}
        onUseTemplate={onUseTemplate}
        now={now}
      />,
    )
    await userEvent.selectOptions(screen.getByLabelText('Use a template'), '2')
    expect(onUseTemplate).toHaveBeenLastCalledWith(expect.objectContaining({ id: 2 }))
  })
})
