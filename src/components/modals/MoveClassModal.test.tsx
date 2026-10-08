import { fireEvent, render, screen } from '@testing-library/react'
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

  it('moves a trial into an existing slot with one tap, or at a custom time', async () => {
    const onConfirm = vi.fn()
    render(
      <MoveClassModal
        draft={{
          ...regular,
          kind: 'trial',
          startTime: '17:00',
          endTime: '19:00',
          names: ['Kid A'],
          trialSlotOptions: [{ startTime: '14:00', endTime: '16:00', teacherName: 'T2' }],
        }}
        isSaving={false}
        error={null}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    expect(screen.queryByPlaceholderText('e.g. Teacher on leave')).not.toBeInTheDocument()
    expect(screen.getByText('A one-off trial slot is created at this time.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /2:00pm-4:00pm · T2/ }))
    expect(screen.getByText('Joins the existing trial slot at this time.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Move' }))

    expect(onConfirm).toHaveBeenCalledWith({ startTime: '14:00', endTime: '16:00', reason: null })
  })

  it('shows the teacher’s clash for the chosen time, and re-checks as the time changes', () => {
    const getClashes = vi.fn((startTime: string) =>
      startTime === '20:30'
        ? [{ scheduleId: 7, title: 'Thu Class', when: 'Friday 8:00pm-9:00pm' }]
        : [],
    )
    render(
      <MoveClassModal
        draft={regular}
        isSaving={false}
        error={null}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        getClashes={getClashes}
        clashTeacherName="Jia Hui"
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Jia Hui is already teaching at this time')
    expect(alert).toHaveTextContent('Thu Class - Friday 8:00pm-9:00pm')
    expect(getClashes).toHaveBeenCalledWith('20:30', '21:30')

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '18:00' } })
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '19:00' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
