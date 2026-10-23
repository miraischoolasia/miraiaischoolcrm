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
  it('shows the master list columns of the fields the school keeps, in the list order with the name first', () => {
    renderList()
    const table = screen.getByRole('table', { name: 'Roster table' })
    const headers = within(table).getAllByRole('columnheader').map((header) => header.textContent)
    expect(headers).toEqual(['STUDENT NAME', 'SALES PERSON', '处理报名的顾问', 'SYSTEM CODE', 'PRICE', 'PHONE', '手续费支付月份', '科数', '停科', '加科'])
  })

  it('fills a student row: names of the staff, the code, the phone without dashes, and the counts from the class history', () => {
    renderList()
    const table = screen.getByRole('table', { name: 'Roster table' })
    const ada = within(table).getByRole('button', { name: 'Ada' }).closest('tr')!
    expect([...ada.querySelectorAll('td')].map((cell) => cell.textContent)).toEqual([
      'Ada',
      'Sales Sam',
      'Learning Lee',
      'S1100784',
      '26001',
      '0123456789',
      '7',
      '2', // two subjects
      '0', // stopped
      '1', // added: class 2 on 1 March
    ])
  })

  it('opens the student from anywhere on the row, and shows a dash where a value is empty', async () => {
    const onOpenStudentDetail = vi.fn()
    render(
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
    const table = screen.getByRole('table', { name: 'Roster table' })
    await userEvent.click(within(table).getByRole('button', { name: 'Bo' }))
    expect(onOpenStudentDetail).toHaveBeenCalledWith(2)
    const bo = within(table).getByRole('button', { name: 'Bo' }).closest('tr')!
    // Bo has no phone and no code: a dash, not a blank.
    expect([...bo.querySelectorAll('td')].slice(1, 3).map((cell) => cell.textContent)).toEqual(['-', '-'])
    await userEvent.click(within(bo).getAllByRole('cell')[2])
    expect(onOpenStudentDetail).toHaveBeenCalledTimes(2)
  })

  it('has no List / Roster switch: only the roster', () => {
    renderList()
    expect(screen.queryByRole('group', { name: 'List view' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'List' })).not.toBeInTheDocument()
  })

  it('lets the person choose and order the columns in Manage columns, the name locked first', async () => {
    window.localStorage.clear()
    renderList()
    await userEvent.click(screen.getByRole('button', { name: 'Manage columns' }))
    const drawer = screen.getByRole('dialog', { name: 'Manage columns' })

    // The name cannot be switched off.
    expect(within(drawer).getByRole('checkbox', { name: 'STUDENT NAME' })).toBeDisabled()
    await userEvent.type(within(drawer).getByRole('searchbox', { name: 'Search columns' }), 'phone')
    expect(within(drawer).getAllByRole('checkbox')).toHaveLength(1)
    await userEvent.clear(within(drawer).getByRole('searchbox', { name: 'Search columns' }))

    await userEvent.click(within(drawer).getByRole('checkbox', { name: 'PHONE' }))
    await userEvent.click(within(drawer).getByRole('button', { name: 'Move PRICE up' }))
    await userEvent.click(within(drawer).getByRole('button', { name: 'Apply' }))

    const headers = within(screen.getByRole('table', { name: 'Roster table' })).getAllByRole('columnheader').map((header) => header.textContent)
    expect(headers).toEqual(['STUDENT NAME', 'SALES PERSON', '处理报名的顾问', 'PRICE', 'SYSTEM CODE', '手续费支付月份', '科数', '停科', '加科'])
  })

  it('Cancel leaves the columns as they were', async () => {
    window.localStorage.clear()
    renderList()
    await userEvent.click(screen.getByRole('button', { name: 'Manage columns' }))
    const drawer = screen.getByRole('dialog', { name: 'Manage columns' })
    await userEvent.click(within(drawer).getByRole('checkbox', { name: 'PHONE' }))
    await userEvent.click(within(drawer).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Manage columns' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Roster table' })).getAllByRole('columnheader').map((header) => header.textContent)).toContain('PHONE')
  })

  it('is not there when the school has not switched it on', () => {
    renderList({ ...NO_STUDENT_FIELDS, membership: true })
    expect(screen.queryByRole('table', { name: 'Roster table' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Manage columns' })).not.toBeInTheDocument()
  })
})
