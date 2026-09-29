import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MoveClassModal, type MoveClassDraft } from './MoveClassModal'

const regular: MoveClassDraft = {
  kind: 'regular',
  scheduleId: 100,
  title: 'Wed Class',
  fromDate: '2026-10-07',
  fromStartTime: '20:30',
  toDate: '2026-10-09',
  startTime: '20:30',
  endTime: '21:30',
  names: ['Ali', 'Bee'],
  trialSlotOptions: [],
}

describe('MoveClassModal', () => {
  it('confirms a regular class move in one click with the dropped time', async () => {
    const onConfirm = vi.fn()
    render(
      <MoveClassModal draft={regular} isSaving={false} error={null} onClose={vi.fn()} onConfirm={onConfirm} />,
    )

    expect(screen.getByText('Ali, Bee')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Move' }))

    expect(onConfirm).toHaveBeenCalledWith({
      startTime: '20:30',
      endTime: '21:30',
      reason: null,
      targetScheduleId: null,
    })
  })

  it('passes an optional reason', async () => {
    const onConfirm = vi.fn()
    render(
      <MoveClassModal draft={regular} isSaving={false} error={null} onClose={vi.fn()} onConfirm={onConfirm} />,
    )

    await userEvent.type(screen.getByPlaceholderText('e.g. Teacher on leave'), 'Teacher sick')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Move' }))

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ reason: 'Teacher sick' }))
  })

  it('lets the admin pick between trial slots on the target day', async () => {
    const onConfirm = vi.fn()
    render(
      <MoveClassModal
        draft={{
          ...regular,
          kind: 'trial',
          names: ['Kid A'],
          trialSlotOptions: [
            { scheduleId: 120, label: '10:00-11:00 · Trial · T2' },
            { scheduleId: 121, label: '14:00-15:00 · Trial · T3' },
          ],
        }}
        isSaving={false}
        error={null}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    expect(screen.queryByPlaceholderText('e.g. Teacher on leave')).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox'), '121')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Move' }))

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ targetScheduleId: 121 }))
  })
})
