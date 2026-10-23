import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { StudentDashboardSection } from './StudentDashboardSection'
import { defaultClassCategories, resetClassCategoriesForTests } from '../../lib/classCategories'
import { NO_STUDENT_FIELDS } from '../../lib/studentFields'
import type { Classroom, Student, Teacher } from '../../types/domain'

// The roster table: the master list's columns on the Students page.

beforeAll(() => resetClassCategoriesForTests(defaultClassCategories))

const base: Student = {
  id: 1,
  name: 'Ada',
  isActive: true,
  teacherId: null,
  classroomId: null,
  phone: '012-345 6789',
  age: null,
  remainingHours: 10,
  lessonExpiryDate: '2026-12-31',
  accountFeeExpiryDate: '2026-12-31',
  miraiClubExpiryDate: '2026-12-31',
  notes: '',
  studentType: 'regular',
}
const room = (id: number, subjectId: number) =>
  ({ id, name: `Class ${id}`, category: 'regular', categoryName: 'Regular Class', ageGroup: '9-11 Years Old', programLevel: 'Y3', teacherId: null, status: 'active', subjectId, notes: null, archivedAt: null }) as unknown as Classroom
const students: Student[] = [
  {
    ...base,
    id: 1,
    classroomId: 1,
    classPeriods: [
      { classroomId: 1, startDate: null, endDate: null },
      { classroomId: 2, startDate: '2026-03-01', endDate: null },
    ],
  },
  { ...base, id: 2, name: 'Bo', phone: null },
]
const teacherMap = new Map([
  [7, { id: 7, fullName: 'Sales Sam' } as Teacher],
  [8, { id: 8, fullName: 'Learning Lee' } as Teacher],
])
const noop = vi.fn()

function renderList(setting = { ...NO_STUDENT_FIELDS, roster_table: true, sales_person: true, consultant: true, membership: true, fee_month: true }) {
  return render(
    <StudentDashboardSection
      activeFilter="all"
      deactivatingStudentId={null}
      isLoading={false}
      students={students}
      classrooms={[room(1, 10), room(2, 11)]}
      teacherMap={teacherMap}
      studentCodes={new Map([[1, 'S1100784']])}
      todayString="2026-10-22"
      onDeactivateStudent={noop}
      onOpenBulkImportPreviewStudents={noop}
      onOpenCreateStudent={noop}
      onOpenStudentDetail={noop}
      onOpenRenewal={noop}
      onSelectFilter={noop}
      tabsByClassCategory
      studentFields={{
        setting,
        extras: new Map([[1, { nameZh: null, kind: null, consultantId: 8, secondParentPhone: null, salesPersonId: 7, membership: '26001', feeMonth: 7 }]]),
        kinds: [],
        consultants: [],
        rosterCounts: { countCategories: [], changesFrom: null },
      }}
    />,
  )
}

describe('roster table', () => {
  it('shows the master list columns of the fields the school keeps, in the list order', () => {
    renderList()
    const table = screen.getByRole('table', { name: 'Roster table' })
    const headers = within(table).getAllByRole('columnheader').map((header) => header.textContent)
    expect(headers).toEqual(['SALES PERSON', '处理报名的顾问', 'SYSTEM CODE', 'PRICE', 'STUDENT NAME', 'PHONE', '手续费支付月份', '科数', '停科', '加科'])
  })

  it('fills a student row: names of the staff, the code, the phone without dashes, and the counts from the class history', () => {
    renderList()
    const table = screen.getByRole('table', { name: 'Roster table' })
    const ada = within(table).getByRole('button', { name: 'Ada' }).closest('tr')!
    expect([...ada.querySelectorAll('td')].map((cell) => cell.textContent)).toEqual([
      'Sales Sam',
      'Learning Lee',
      'S1100784',
      '26001',
      'Ada',
      '0123456789',
      '7',
      '2', // two subjects
      '0', // stopped
      '1', // added: class 2 on 1 March
    ])
  })

  it('opens the student from the name, and can go back to the plain list', async () => {
    const onOpenStudentDetail = vi.fn()
    const { container } = render(
      <StudentDashboardSection
        activeFilter="all"
        deactivatingStudentId={null}
        isLoading={false}
        students={students}
        classrooms={[room(1, 10), room(2, 11)]}
        todayString="2026-10-22"
        onDeactivateStudent={noop}
        onOpenBulkImportPreviewStudents={noop}
        onOpenCreateStudent={noop}
        onOpenStudentDetail={onOpenStudentDetail}
        onOpenRenewal={noop}
        onSelectFilter={noop}
        studentFields={{ setting: { ...NO_STUDENT_FIELDS, roster_table: true }, extras: new Map(), kinds: [], consultants: [] }}
      />,
    )
    await userEvent.click(within(screen.getByRole('table', { name: 'Roster table' })).getByRole('button', { name: 'Bo' }))
    expect(onOpenStudentDetail).toHaveBeenCalledWith(2)
    await userEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.queryByRole('table', { name: 'Roster table' })).not.toBeInTheDocument()
    expect(container.querySelector('table')).not.toBeNull()
  })

  it('is not there when the school has not switched it on', () => {
    renderList({ ...NO_STUDENT_FIELDS, membership: true })
    expect(screen.queryByRole('table', { name: 'Roster table' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'List view' })).not.toBeInTheDocument()
  })
})
