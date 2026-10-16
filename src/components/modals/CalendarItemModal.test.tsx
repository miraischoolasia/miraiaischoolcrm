import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CalendarItemModal } from './CalendarItemModal'

function setup() {
  const onSave = vi.fn().mockResolvedValue(null)
  render(
    <CalendarItemModal
      item={null}
      defaultDate="2026-10-17"
      teachers={[{ id: 1, fullName: 'Teacher Mei' }]}
      canEdit
      onClose={vi.fn()}
      onSave={onSave}
    />,
  )
  return { onSave }
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
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ kind: 'meeting', startTime: '10:00' }))
  })
})
