import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StudentDashboardSection } from './StudentDashboardSection'
import type { FilterKey, Package, Student } from '../../types/domain'

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
        onOpenBulkImportPreviewStudents={noop}
        onOpenCreateStudent={noop}
        onOpenStudentDetail={noop}
        onOpenRenewal={noop}
        onSelectFilter={noop}
      />,
    )

    const cardName = screen.getAllByText('Ada Lovelace')
    expect(cardName).toHaveLength(2)

    const rows = document.querySelectorAll('tbody tr')
    const cards = document.querySelectorAll('ul.md\\:hidden > li')
    expect(rows).toHaveLength(1)
    expect(cards).toHaveLength(1)
  })

  function renderWithFilter(activeFilter: FilterKey, students: Student[], packages: Package[] = []) {
    render(
      <StudentDashboardSection
        activeFilter={activeFilter}
        packages={packages}
        deactivatingStudentId={null}
        isLoading={false}
        students={students}
        todayString="2026-01-01"
        onDeactivateStudent={noop}
        onOpenBulkImportPreviewStudents={noop}
        onOpenCreateStudent={noop}
        onOpenStudentDetail={noop}
        onOpenRenewal={noop}
        onSelectFilter={noop}
      />,
    )
  }

  const mixed: Student[] = [
    student,
    { ...student, id: 2, name: 'Preview Learner', studentType: 'preview' },
    { ...student, id: 3, name: 'Trial Kid', remainingHours: 0, studentType: 'trial' },
    { ...student, id: 4, name: 'Low Classes', remainingHours: 2 },
    { ...student, id: 5, name: 'Fee Due Soon', accountFeeExpiryDate: '2026-01-10' },
    { ...student, id: 6, name: 'Lesson Expired', lessonExpiryDate: '2025-12-31' },
    { ...student, id: 7, name: 'Gone Low', remainingHours: 0, isActive: false },
  ]
  const shown = () => [...document.querySelectorAll('tbody tr')].map((row) => row.querySelector('button')?.textContent)

  it('shows only regular students under Regular', () => {
    renderWithFilter('regular', mixed)
    expect(shown()).toEqual(['Ada Lovelace', 'Low Classes', 'Fee Due Soon', 'Lesson Expired', 'Gone Low'])
  })

  it('puts trial-slot and preview students under HOA', () => {
    renderWithFilter('hoa', mixed)
    expect(shown()).toEqual(['Preview Learner', 'Trial Kid'])
  })

  const pkg = (id: number, name: string, kind: Package['kind'], includesFees: boolean): Package => ({
    id,
    name,
    kind,
    classCount: 4,
    durationMonths: 1,
    includesFees,
    isActive: true,
    sortOrder: id,
  })
  const packages = [
    pkg(1, 'Trial 1 Month', 'trial', false),
    pkg(2, '6 Months', 'regular', true),
    pkg(3, 'Holiday Camp', 'camp', false),
  ]
  const enrolled: Student[] = [
    { ...student, id: 11, name: 'On Trial', packageId: 1, accountFeeExpiryDate: '2025-01-01' },
    { ...student, id: 12, name: 'Six Months', packageId: 2 },
    { ...student, id: 13, name: 'At Camp', packageId: 3, miraiClubExpiryDate: '2025-01-01' },
    { ...student, id: 14, name: 'Not Tagged' },
  ]

  it('sorts regular students by package type, untagged ones under Regular', () => {
    renderWithFilter('trial', enrolled, packages)
    expect(shown()).toEqual(['On Trial'])
    cleanup()
    renderWithFilter('camp', enrolled, packages)
    expect(shown()).toEqual(['At Camp'])
    cleanup()
    renderWithFilter('regular', enrolled, packages)
    expect(shown()).toEqual(['Six Months', 'Not Tagged'])
  })

  it('shows the package, and no fee dates or fee alerts for no-fee packages', () => {
    renderWithFilter('followUp', enrolled, packages)
    // Their old fee dates have passed, but their packages carry no fees.
    expect(shown()).toEqual([])
    cleanup()
    renderWithFilter('all', enrolled, packages)
    const row = (name: string) =>
      [...document.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes(name)) as HTMLElement
    expect(within(row('On Trial')).getByText('Trial 1 Month')).toBeInTheDocument()
    expect(within(row('On Trial')).getAllByText('—')).toHaveLength(2)
    expect(within(row('Not Tagged')).getByText('No package')).toBeInTheDocument()
    expect(within(row('Six Months')).queryByText('—')).not.toBeInTheDocument()
  })

  it('lists 2 or fewer classes and expiring dates under Need Follow Up, not deactivated ones', () => {
    renderWithFilter('followUp', mixed)
    expect(shown()).toEqual(['Low Classes', 'Fee Due Soon', 'Lesson Expired'])
  })

  it('shows how many students each filter has', () => {
    renderWithFilter('all', mixed)
    expect(screen.getByRole('button', { name: 'Need Follow Up 3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All 7' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens the student when the row is clicked, but not from its buttons', async () => {
    const onOpen = vi.fn()
    const onRenew = vi.fn()
    render(
      <StudentDashboardSection
        activeFilter="all"
        deactivatingStudentId={null}
        isLoading={false}
        students={[student]}
        todayString="2026-01-01"
        onDeactivateStudent={noop}
        onOpenBulkImportPreviewStudents={noop}
        onOpenCreateStudent={noop}
        onOpenStudentDetail={onOpen}
        onOpenRenewal={onRenew}
        onSelectFilter={noop}
      />,
    )

    const row = document.querySelector('tbody tr') as HTMLElement
    await userEvent.click(row.querySelectorAll('td')[1])
    expect(onOpen).toHaveBeenCalledWith(1)

    await userEvent.click(within(row).getByRole('button', { name: /Renew/ }))
    expect(onRenew).toHaveBeenCalledWith(1)
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(within(row).queryByRole('button', { name: /Details|Edit/ })).not.toBeInTheDocument()
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
        onOpenBulkImportPreviewStudents={noop}
        onOpenCreateStudent={noop}
        onOpenStudentDetail={noop}
        onOpenRenewal={noop}
        onSelectFilter={noop}
      />,
    )

    expect(screen.queryByText('-1')).not.toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.getAllByText('Not billed')).toHaveLength(2)
  })
})
