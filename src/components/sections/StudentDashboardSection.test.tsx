import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StudentDashboardSection } from './StudentDashboardSection'
import type { Student } from '../../types/domain'

const student: Student = {
  id: 1,
  name: 'Ada Lovelace',
  isActive: true,
  teacherId: null,
  classroomId: null,
  phone: null,
  remainingHours: 10,
  lessonExpiryDate: '2026-12-31',
  accountFeeExpiryDate: '2026-12-31',
  miraiClubExpiryDate: '2026-12-31',
  notes: '',
  studentType: 'regular',
}

const noop = vi.fn()

describe('StudentDashboardSection', () => {
  it('renders both the mobile card list and the desktop table for the same data', () => {
    render(
      <StudentDashboardSection
        activeFilter="all"
        deactivatingStudentId={null}
        isLoading={false}
        students={[student]}
        todayString="2026-01-01"
        onDeactivateStudent={noop}
        onEditStudent={noop}
        onOpenBulkImportPreviewStudents={noop}
        onOpenCreateStudent={noop}
        onOpenStudentDetail={noop}
        onOpenRenewal={noop}
        onToggleFilter={noop}
      />,
    )

    const cardName = screen.getAllByText('Ada Lovelace')
    expect(cardName).toHaveLength(2)

    const rows = document.querySelectorAll('tbody tr')
    const cards = document.querySelectorAll('ul.md\\:hidden > li')
    expect(rows).toHaveLength(1)
    expect(cards).toHaveLength(1)
  })

  it('filters preview students separately from regular students', () => {
    render(
      <StudentDashboardSection
        activeFilter="preview"
        deactivatingStudentId={null}
        isLoading={false}
        students={[
          student,
          {
            ...student,
            id: 2,
            name: 'Preview Learner',
            phone: '+60 12-000 0000',
            studentType: 'preview',
          },
        ]}
        todayString="2026-01-01"
        onDeactivateStudent={noop}
        onEditStudent={noop}
        onOpenBulkImportPreviewStudents={noop}
        onOpenCreateStudent={noop}
        onOpenStudentDetail={noop}
        onOpenRenewal={noop}
        onToggleFilter={noop}
      />,
    )

    expect(screen.getAllByText('Preview Learner')).toHaveLength(2)
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument()
  })

  it('keeps trial-booking students out of the Normal filter, same as preview students', () => {
    render(
      <StudentDashboardSection
        activeFilter="normal"
        deactivatingStudentId={null}
        isLoading={false}
        students={[
          student,
          {
            ...student,
            id: 3,
            name: 'Trial Kid',
            remainingHours: 0,
            studentType: 'trial',
          },
        ]}
        todayString="2026-01-01"
        onDeactivateStudent={noop}
        onEditStudent={noop}
        onOpenBulkImportPreviewStudents={noop}
        onOpenCreateStudent={noop}
        onOpenStudentDetail={noop}
        onOpenRenewal={noop}
        onToggleFilter={noop}
      />,
    )

    expect(screen.getAllByText('Ada Lovelace')).toHaveLength(2)
    expect(screen.queryByText('Trial Kid')).not.toBeInTheDocument()
  })

  it('hides the raw (possibly negative) class count for a trial-booking student', () => {
    // Trial attendance reuses the regular present/absent deduction logic
    // unmodified, so remainingHours can go negative (0 -> -1) once a trial
    // student is marked present. That number is never billed against, so
    // showing it raw next to "Healthy" would just be confusing.
    render(
      <StudentDashboardSection
        activeFilter="all"
        deactivatingStudentId={null}
        isLoading={false}
        students={[{ ...student, id: 4, name: 'Trial Kid', remainingHours: -1, studentType: 'trial' }]}
        todayString="2026-01-01"
        onDeactivateStudent={noop}
        onEditStudent={noop}
        onOpenBulkImportPreviewStudents={noop}
        onOpenCreateStudent={noop}
        onOpenStudentDetail={noop}
        onOpenRenewal={noop}
        onToggleFilter={noop}
      />,
    )

    expect(screen.queryByText('-1')).not.toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.getAllByText('Not billed')).toHaveLength(2)
  })
})
