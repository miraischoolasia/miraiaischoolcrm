import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CalendarItem } from '../../lib/calendarItems'
import { CalendarItemModal } from './CalendarItemModal'

function setup(item: CalendarItem | null = null) {
  const onSave = vi.fn().mockResolvedValue(null)
  const onDelete = vi.fn().mockResolvedValue(null)
  render(
    <CalendarItemModal
      item={item}
      defaultDate="2026-10-17"
      teachers={[{ id: 1, fullName: 'Teacher Mei' }]}
      canEdit
      onClose={vi.fn()}
      onSave={onSave}
      onDelete={onDelete}
    />,
  )
  return { onSave, onDelete }
}

const seriesItem: CalendarItem = {
  id: 9,
  kind: 'meeting',
  title: 'Cyrus Zoom meeting',
  notes: null,
  date: '2026-10-26',
  startTime: '20:00',
  endTime: '21:00',
  zoomLink: null,
  assigneeId: 1,
  leadId: null,
  isDone: false,
  createdBy: null,
  seriesId: 4,
  seriesDate: '2026-10-26',
}

describe('CalendarItemModal', () => {
  it('starts a task as an all-day item that can be given a time', async () => {
    setup()

    const allDay = screen.getByRole('checkbox', { name: 'All day' })
    expect(allDay).toBeChecked()
    await userEvent.click(allDay)
    expect(screen.getByLabelText('From')).toHaveValue('09:00')
  })

  it('gives a Zoom meeting a start time and no all-day box', async () => {
    const { onSave } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Zoom meeting' }))

    expect(screen.queryByRole('checkbox', { name: 'All day' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('From')).toHaveValue('10:00')
    await userEvent.type(screen.getByLabelText('Title'), 'Parent meeting')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ kind: 'meeting', startTime: '10:00' }), {
      repeat: null,
      scope: undefined,
    })
  })

  it('repeats a new item every week on the days picked, starting from the weekday of the day', async () => {
    const { onSave } = setup()

    await userEvent.type(screen.getByLabelText('Title'), 'Weekly check-in')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Repeat every week' }))
    // 2026-10-17 is a Saturday, so Saturday starts ticked.
    expect(screen.getByRole('button', { name: 'Sat' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Mon' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Weekly check-in' }), {
      repeat: { weekdays: [6, 1], until: '' },
      scope: undefined,
    })
  })

  it('asks which days a change or a delete is for when the item belongs to a weekly rule', async () => {
    const { onSave, onDelete } = setup(seriesItem)

    expect(screen.getByRole('radio', { name: 'This day only' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'This day and all the ones after' }))
    // The day belongs to one occurrence only, so it is locked while the whole rule is changed.
    expect(screen.getByLabelText('Day')).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cyrus Zoom meeting' }), { repeat: null, scope: 'upcoming' })

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('upcoming')
  })
})
