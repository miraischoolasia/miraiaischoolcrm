import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StudentDashboardSection } from './StudentDashboardSection'
import type { Classroom, Package, Schedule, Student, Teacher } from '../../types/domain'
import type { StudentParent } from '../../lib/studentParents'

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

type Extra = Partial<React.ComponentProps<typeof StudentDashboardSection>>

function renderSection(students: Student[], extra: Extra = {}) {
  return render(
    <StudentDashboardSection
      activeFilter="all"
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
      {...extra}
    />,
  )
}

describe('StudentDashboardSection', () => {
  it('renders both the mobile card list and the desktop table for the same data', () => {
    renderSection([student])

    expect(screen.getAllByText('Ada Lovelace')).toHaveLength(2)
    expect(document.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(document.querySelectorAll('ul.md\\:hidden > li')).toHaveLength(1)
  })

  const mixed: Student[] = [
    student,
    { ...student, id: 2, name: 'Preview Learner', studentType: 'preview' },
    { ...student, id: 3, name: 'Trial Kid', remainingHours: 0, studentType: 'trial' },
    { ...student, id: 4, name: 'Low Classes', remainingHours: 2 },
    { ...student, id: 5, name: 'Fee Due Soon', accountFeeExpiryDate: '2026-01-10' },
    { ...student, id: 6, name: 'Lesson Expired', lessonExpiryDate: '2025-12-31' },
    { ...student, id: 7, name: 'Gone Low', remainingHours: 0, isActive: false },
  ]
  const shown = () =>
    [...document.querySelectorAll('tbody tr')].map((row) => row.querySelector('button')?.textContent)
  const row = (name: string) =>
    [...document.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes(name)) as HTMLElement

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

  it('puts the students who need action first, healthy next and deactivated last', () => {
    renderSection(mixed, { activeFilter: 'regular' })

    expect(shown()).toEqual(['Lesson Expired', 'Low Classes', 'Fee Due Soon', 'Ada Lovelace', 'Gone Low'])
  })

  it('puts trial-slot and preview students under HOA', () => {
    renderSection(mixed, { activeFilter: 'hoa' })

    expect(shown()).toEqual(['Preview Learner', 'Trial Kid'])
  })

  it('sorts regular students by package type, untagged ones under Regular', () => {
    renderSection(enrolled, { activeFilter: 'trial', packages })
    expect(shown()).toEqual(['On Trial'])
    cleanup()
    renderSection(enrolled, { activeFilter: 'camp', packages })
    expect(shown()).toEqual(['At Camp'])
    cleanup()
    renderSection(enrolled, { activeFilter: 'regular', packages })
    expect(shown()).toEqual(['Six Months', 'Not Tagged'])
  })

  it('shows the package, and no fee dates or fee alerts for no-fee packages', () => {
    renderSection(enrolled, { packages, followUpOnly: true })
    // Their old fee dates have passed, but their packages carry no fees.
    expect(shown()).toEqual([])
    cleanup()

    renderSection(enrolled, { packages })
    expect(within(row('On Trial')).getByText('Trial 1 Month')).toBeInTheDocument()
    expect(within(row('On Trial')).getByText('No fees')).toBeInTheDocument()
    expect(within(row('Not Tagged')).getByText('No package')).toBeInTheDocument()
    expect(within(row('Six Months')).getByText('Paid to Dec 2026')).toBeInTheDocument()
    expect([...document.querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual([
      'Student', 'Class', 'Package', 'Classes left', 'Ends', 'Fees', 'Status', 'Actions',
    ])
  })

  it('shows one status per student: the most urgent, and how many more', () => {
    renderSection([
      { ...student, id: 20, name: 'Many Problems', remainingHours: 1, lessonExpiryDate: '2025-12-30', accountFeeExpiryDate: '2026-01-05' },
      { ...student, id: 21, name: 'Fine' },
    ])

    const trouble = row('Many Problems')
    expect(within(trouble).getByText('Package ended')).toBeInTheDocument()
    expect(within(trouble).getByText('+1')).toHaveAttribute('title', 'Fee due in 4d')
    expect(within(trouble).queryByText('Classes low')).not.toBeInTheDocument()
    expect(within(row('Fine')).getByText('✓ On track')).toBeInTheDocument()
  })

  it('names the fee that is a problem, and the days left', () => {
    renderSection([{ ...student, miraiClubExpiryDate: '2026-01-04' }])

    expect(within(row('Ada')).getByText('Mirai Club due')).toBeInTheDocument()
    expect(within(row('Ada')).getByText('in 3 days')).toBeInTheDocument()
  })

  it('combines the type tab with the follow-up switch, with counts', async () => {
    const onToggle = vi.fn()
    renderSection(mixed, { onToggleFollowUp: onToggle })

    expect(screen.getByRole('button', { name: 'All 7' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Needs follow-up 3' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Needs follow-up 3' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    cleanup()

    renderSection(mixed, { followUpOnly: true, onToggleFollowUp: onToggle })
    // 2 or fewer classes and expiring dates, not deactivated ones.
    expect(shown()).toEqual(['Lesson Expired', 'Low Classes', 'Fee Due Soon'])
  })

  it('searches by name, ID, parent and phone', async () => {
    const parents = new Map<number, StudentParent>([[5, { name: 'Mrs Tan', phone: '0123456' }]])
    renderSection(mixed, { parents })
    const search = screen.getByRole('searchbox', { name: 'Search students' })

    await userEvent.type(search, 'tan')
    expect(shown()).toEqual(['Fee Due Soon'])
    await userEvent.clear(search)
    await userEvent.type(search, '0123')
    expect(shown()).toEqual(['Fee Due Soon'])
    await userEvent.clear(search)
    await userEvent.type(search, '#006')
    expect(shown()).toEqual(['Lesson Expired'])
  })

  it('sorts by name when asked', async () => {
    renderSection([
      { ...student, id: 1, name: 'Zed' },
      { ...student, id: 2, name: 'Amy', remainingHours: 1 },
      { ...student, id: 3, name: 'Bob' },
    ])
    expect(shown()).toEqual(['Amy', 'Zed', 'Bob'])

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort students' }), 'name')
    expect(shown()).toEqual(['Amy', 'Bob', 'Zed'])
  })

  it('shows the class, its time and the teacher', () => {
    const classroom = { id: 5, name: 'WED C002', teacherId: 9 } as Classroom
    const schedule = {
      id: 1, teacherId: 9, classroomId: 5, eventType: 'regular', status: 'active', dayOfWeek: 3,
      startTime: '16:00', endTime: '17:30',
    } as Schedule
    const teacher = { id: 9, fullName: 'Ms Rachel' } as Teacher
    renderSection([{ ...student, classroomId: 5 }], {
      classrooms: [classroom],
      schedules: [schedule],
      teacherMap: new Map([[9, teacher]]),
    })

    expect(within(row('Ada')).getByText('WED C002')).toBeInTheDocument()
    expect(within(row('Ada')).getByText('Wed 16:00-17:30 · Ms Rachel')).toBeInTheDocument()
  })

  it('opens the student when the row is clicked, but not from its buttons', async () => {
    const onOpen = vi.fn()
    renderSection([student], { onOpenStudentDetail: onOpen })

    const tableRow = document.querySelector('tbody tr') as HTMLElement
    await userEvent.click(tableRow.querySelectorAll('td')[1])
    expect(onOpen).toHaveBeenCalledWith(1)

    await userEvent.click(within(tableRow).getByRole('button', { name: 'More actions for Ada Lovelace' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('offers Renew on the row only when action is needed, and always in the menu', async () => {
    const onRenew = vi.fn()
    renderSection(
      [student, { ...student, id: 2, name: 'Almost Done', remainingHours: 1 }],
      { onOpenRenewal: onRenew },
    )

    expect(within(row('Ada')).queryByRole('button', { name: 'Renew' })).not.toBeInTheDocument()
    await userEvent.click(within(row('Almost Done')).getByRole('button', { name: 'Renew' }))
    expect(onRenew).toHaveBeenLastCalledWith(2)

    await userEvent.click(within(row('Ada')).getByRole('button', { name: 'More actions for Ada Lovelace' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Renew' }))
    expect(onRenew).toHaveBeenLastCalledWith(1)
  })

  it('keeps Deactivate inside the menu, and disabled once deactivated', async () => {
    const onDeactivate = vi.fn()
    renderSection(
      [student, { ...student, id: 2, name: 'Already Gone', isActive: false }],
      { onDeactivateStudent: onDeactivate },
    )
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument()

    await userEvent.click(within(row('Ada')).getByRole('button', { name: 'More actions for Ada Lovelace' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Deactivate' }))
    expect(onDeactivate).toHaveBeenCalledWith(1)

    await userEvent.click(within(row('Already Gone')).getByRole('button', { name: 'More actions for Already Gone' }))
    expect(screen.getByRole('menuitem', { name: 'Deactivated' })).toBeDisabled()
  })

  it('hides the raw (possibly negative) class count for a trial-booking student', () => {
    // Trial attendance reuses the regular present/absent deduction logic
    // unmodified, so remainingHours can go negative (0 -> -1) once a trial
    // student is marked present. That number is never billed against, so
    // showing it raw would just be confusing.
    renderSection([{ ...student, id: 4, name: 'Trial Kid', remainingHours: -1, studentType: 'trial' }])

    expect(screen.queryByText('-1')).not.toBeInTheDocument()
    expect(within(row('Trial Kid')).getByText('HOA class')).toBeInTheDocument()
    expect(within(row('Trial Kid')).queryByRole('button', { name: 'Renew' })).not.toBeInTheDocument()
  })

  it('lists students by student ID when nothing sets them apart, without the phone number', () => {
    renderSection([
      { ...student, id: 39, name: 'Chong Kai Qing', phone: '60166119153' },
      { ...student, id: 10, name: 'Albee' },
      { ...student, id: 15, name: 'Chee' },
    ])

    expect(shown()).toEqual(['Albee', 'Chee', 'Chong Kai Qing'])
    expect(screen.queryByText(/60166119153/)).not.toBeInTheDocument()
    expect(screen.getAllByText('#039').length).toBeGreaterThan(0)
  })

  it('says when a filter finds nobody', () => {
    renderSection([student], { activeFilter: 'camp' })

    expect(screen.getByText('No students match. Try clearing the search or the filters.')).toBeInTheDocument()
  })
})
