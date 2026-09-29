import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MakeupPlanModal } from './MakeupPlanModal'
import type { Student } from '../../types/domain'

const ali: Student = {
  id: 5,
  teacherId: 1,
  classroomId: 10,
  name: 'Ali',
  phone: null,
  age: null,
  remainingHours: 8,
  lessonExpiryDate: '2026-12-01',
  accountFeeExpiryDate: '2026-12-01',
  miraiClubExpiryDate: '2026-12-01',
  notes: null,
  isActive: true,
  studentType: 'regular',
}

// Wednesdays after the given date: Oct 7, 14, 21, 28.
const upcoming = ['2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28']
const suggestDates = (afterDate: string, count: number) =>
  upcoming.filter((date) => date > afterDate).slice(0, count)

function renderModal(onSave = vi.fn()) {
  render(
    <MakeupPlanModal
      classroomName="Wed Class"
      roster={[ali]}
      plan={null}
      initialMissedDate="2026-09-23"
      initialStudentId={null}
      suggestDates={suggestDates}
      isSaving={false}
      error={null}
      onClose={vi.fn()}
      onSave={onSave}
    />,
  )
  return onSave
}

describe('MakeupPlanModal', () => {
  it('starts with +30 min on the next two classes for the whole class', async () => {
    const onSave = renderModal()

    expect(screen.getByText('Planned 60 / 60 min')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save Make-up Plan' }))

    expect(onSave).toHaveBeenCalledWith({
      planId: null,
      missedDate: '2026-09-23',
      studentId: null,
      missedMinutes: 60,
      notes: null,
      sessions: [
        { sessionDate: '2026-10-07', extraMinutes: 30 },
        { sessionDate: '2026-10-14', extraMinutes: 30 },
      ],
    })
  })

  it('fills 4 × 15 min from the preset, for one student', async () => {
    const onSave = renderModal()

    await userEvent.selectOptions(screen.getByRole('combobox'), '5')
    await userEvent.click(screen.getByRole('button', { name: '4 × 15 min' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Make-up Plan' }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 5,
        sessions: upcoming.map((sessionDate) => ({ sessionDate, extraMinutes: 15 })),
      }),
    )
  })

  it('warns when the planned total differs but still saves', async () => {
    const onSave = renderModal()

    await userEvent.click(screen.getByRole('button', { name: 'Remove session 2' }))

    expect(screen.getByText(/Planned 30 \/ 60 min/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save Make-up Plan' }))
    expect(onSave).toHaveBeenCalled()
  })

  it('picking a recently missed class re-suggests the two classes after it', async () => {
    const onSave = vi.fn()
    render(
      <MakeupPlanModal
        classroomName="Wed Class"
        roster={[ali]}
        plan={null}
        initialMissedDate="2026-09-23"
        initialStudentId={5}
        missedDateOptions={[
          { date: '2026-09-23', label: 'Sep 23, 2026 · Leave' },
          { date: '2026-10-07', label: 'Oct 7, 2026 · Absent' },
        ]}
        suggestDates={suggestDates}
        isSaving={false}
        error={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Oct 7, 2026 · Absent' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Make-up Plan' }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        missedDate: '2026-10-07',
        studentId: 5,
        sessions: [
          { sessionDate: '2026-10-14', extraMinutes: 30 },
          { sessionDate: '2026-10-21', extraMinutes: 30 },
        ],
      }),
    )
  })

  it('blocks saving with no sessions', async () => {
    const onSave = renderModal()

    await userEvent.click(screen.getByRole('button', { name: 'Remove session 2' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove session 1' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Make-up Plan' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Add at least one make-up session.')
    expect(onSave).not.toHaveBeenCalled()
  })
})
