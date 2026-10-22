import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { defaultClassCategories, resetClassCategoriesForTests } from '../../lib/classCategories'
import { StudentDashboardSection } from './StudentDashboardSection'
import { NO_STUDENT_FIELDS } from '../../lib/studentFields'
import type { Student, Teacher } from '../../types/domain'

// The school's extra student fields on the student list: filters by kind and consultant,
// and the Chinese name found by the search.

const base: Student = {
  id: 1,
  name: 'Ada',
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
const students = [
  { ...base, id: 1, name: 'Ali' },
  { ...base, id: 2, name: 'Siti' },
  { ...base, id: 3, name: 'Mei' },
]
const extras = new Map([
  [1, { nameZh: '阿里', kind: '新生', consultantId: 2, secondParentPhone: null }],
  [2, { nameZh: null, kind: '续报', consultantId: null, secondParentPhone: null }],
])
const consultants = [{ id: 2, fullName: 'Crystal', role: 'staff', isActive: true }] as Teacher[]
const kinds = [
  { name: '新生', sortOrder: 10, isActive: true },
  { name: '续报', sortOrder: 20, isActive: true },
]
const noop = vi.fn()

function renderList(setting = { ...NO_STUDENT_FIELDS, name_zh: true, student_kind: true, consultant: true }) {
  render(
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
      studentFields={{ setting, extras, kinds, consultants }}
    />,
  )
}

const names = () => [...document.querySelectorAll('tbody tr')].map((row) => row.querySelector('button')?.textContent).sort()

// The class categories are the defaults; nothing is read from the database.
beforeAll(() => resetClassCategoriesForTests(defaultClassCategories))

describe('student list with the extra student fields', () => {
  it('filters by kind of student, including students with none', async () => {
    renderList()
    await userEvent.selectOptions(screen.getByLabelText('Filter by kind of student'), '续报')
    expect(names()).toEqual(['Siti'])
    await userEvent.selectOptions(screen.getByLabelText('Filter by kind of student'), 'Kind not set')
    expect(names()).toEqual(['Mei'])
  })

  it('filters by consultant', async () => {
    renderList()
    await userEvent.selectOptions(screen.getByLabelText('Filter by consultant'), 'Crystal')
    expect(names()).toEqual(['Ali'])
    await userEvent.selectOptions(screen.getByLabelText('Filter by consultant'), 'No consultant')
    expect(names()).toEqual(['Mei', 'Siti'])
  })

  it('finds a student by the Chinese name', async () => {
    renderList()
    await userEvent.type(screen.getByLabelText('Search students'), '阿里')
    expect(names()).toEqual(['Ali'])
  })

  it('has no extra filters when the school shows neither field', () => {
    renderList({ ...NO_STUDENT_FIELDS, name_zh: true })
    expect(screen.queryByLabelText('Filter by kind of student')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Filter by consultant')).not.toBeInTheDocument()
  })
})
