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
})
