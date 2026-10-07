import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StudentDetailModal } from './StudentDetailModal'
import type { Classroom, Student } from '../types/domain'

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

  it('lists the package history with the current package', () => {
    render(
      <StudentDetailModal
        classrooms={[]}
        student={{ ...student, packageId: 2 }}
        lessonLogs={[]}
        lessonReviews={[]}
        onClose={vi.fn()}
        schedules={[]}
        teacherMap={new Map()}
        packages={[
          { id: 1, name: 'Trial 1 Month', kind: 'trial', classCount: 4, durationMonths: 1, includesFees: false, isActive: true, sortOrder: 1 },
          { id: 2, name: '6 Months', kind: 'regular', classCount: 24, durationMonths: 6, includesFees: true, isActive: true, sortOrder: 2 },
        ]}
        enrollments={[
          { id: 9, studentId: 1, packageId: 2, startDate: '2026-11-01', endDate: '2027-05-01', classCount: 24, remark: null, createdAt: '' },
          { id: 8, studentId: 1, packageId: 1, startDate: '2026-10-01', endDate: '2026-11-01', classCount: 4, remark: null, createdAt: '' },
        ]}
      />,
    )

    const section = screen.getByRole('heading', { name: 'Packages' }).closest('section') as HTMLElement
    expect(section).toHaveTextContent('Now on 6 Months')
    expect([...section.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      '6 MonthsNov 1, 2026 - May 1, 2027 · 24 classes',
      'Trial 1 MonthOct 1, 2026 - Nov 1, 2026 · 4 classes',
    ])
  })

  it('shows the lesson and Mirai Club expiry, or that the package has no fees', () => {
    const { unmount } = render(
      <StudentDetailModal
        classrooms={[]}
        student={{ ...student, miraiClubExpiryDate: '2026-11-30' }}
        lessonLogs={[]}
        lessonReviews={[]}
        onClose={vi.fn()}
        schedules={[]}
        teacherMap={new Map()}
      />,
    )
    expect(screen.getByText('Lesson Expiry')).toBeInTheDocument()
    expect(screen.getByText('Mirai Club Expiry')).toBeInTheDocument()
    expect(screen.getByText('Nov 30, 2026')).toBeInTheDocument()
    unmount()

    render(
      <StudentDetailModal
        classrooms={[]}
        student={{ ...student, packageId: 1 }}
        lessonLogs={[]}
        lessonReviews={[]}
        onClose={vi.fn()}
        schedules={[]}
        teacherMap={new Map()}
        packages={[
          { id: 1, name: 'Trial 1 Month', kind: 'trial', classCount: 4, durationMonths: 1, includesFees: false, isActive: true, sortOrder: 1 },
        ]}
      />,
    )
    expect(screen.getByText('Not in this package')).toBeInTheDocument()
  })

  it('shows when the student joined their class and lets it be corrected', async () => {
    const room = (id: number, name: string): Classroom => ({
      id,
      name,
      category: 'regular',
      ageGroup: '9-11 Years Old',
      programLevel: 'Coder Pro',
      teacherId: null,
      status: 'active',
      notes: null,
      archivedAt: null,
    })
    const onSetClassStart = vi.fn().mockResolvedValueOnce('Pick a day after they started their previous class.').mockResolvedValueOnce(null)
    render(
      <StudentDetailModal
        classrooms={[room(8, 'WED Coding Class C002'), room(10, 'TUE Coding Class C004')]}
        student={{
          ...student,
          classroomId: 8,
          classPeriods: [
            { classroomId: 10, startDate: null, endDate: '2026-10-01' },
            { classroomId: 8, startDate: '2026-10-01', endDate: null },
          ],
        }}
        lessonLogs={[]}
        lessonReviews={[]}
        onClose={vi.fn()}
        schedules={[]}
        teacherMap={new Map()}
        onSetClassStart={onSetClassStart}
      />,
    )

    expect(screen.getByText('In This Class Since')).toBeInTheDocument()
    expect(screen.getByText(/Earlier: TUE Coding Class C004 until/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Change the day they joined' }))
    fireEvent.change(screen.getByLabelText('Joined the class on'), { target: { value: '2026-09-20' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSetClassStart).toHaveBeenLastCalledWith('2026-09-20')
    expect(await screen.findByRole('alert')).toHaveTextContent('previous class')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('button', { name: 'Change the day they joined' })).toBeInTheDocument()
  })

  it('has no join-day editing without Students edit', () => {
    render(
      <StudentDetailModal
        classrooms={[]}
        student={{ ...student, classroomId: 8, classPeriods: [{ classroomId: 8, startDate: null, endDate: null }] }}
        lessonLogs={[]}
        lessonReviews={[]}
        onClose={vi.fn()}
        schedules={[]}
        teacherMap={new Map()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Change the day they joined' })).not.toBeInTheDocument()
  })
})
