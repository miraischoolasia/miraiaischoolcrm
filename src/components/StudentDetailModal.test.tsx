import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StudentDetailModal } from './StudentDetailModal'
import type { Student } from '../types/domain'

const student: Student = {
  id: 1,
  name: 'Ada Lovelace',
  isActive: true,
  teacherId: null,
  classroomId: null,
  phone: null,
  age: null,
  remainingHours: 10,
  lessonExpiryDate: '2026-12-31',
  accountFeeExpiryDate: '2026-12-31',
  miraiClubExpiryDate: '2026-12-31',
  notes: '',
  studentType: 'regular',
}

function renderModal(onEdit?: () => void) {
  render(
    <StudentDetailModal
      classrooms={[]}
      student={student}
      lessonLogs={[]}
      lessonReviews={[]}
      onClose={vi.fn()}
      schedules={[]}
      teacherMap={new Map()}
      onEdit={onEdit}
    />,
  )
}

describe('StudentDetailModal', () => {
  it('offers Edit in the header when the account may edit students', async () => {
    const onEdit = vi.fn()
    renderModal(onEdit)

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('has no Edit button otherwise', () => {
    renderModal()

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })
})
