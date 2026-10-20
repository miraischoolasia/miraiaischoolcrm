import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClassListingSection } from './ClassListingSection'
import { defaultClassCategories, resetClassCategoriesForTests, type ClassCategory } from '../../lib/classCategories'
import type { Classroom, Student } from '../../types/domain'

const room: Classroom = {
  id: 1,
  name: 'SCI Form 1 · Ms Joey',
  category: 'regular',
  ageGroup: 'Form 1',
  programLevel: '常规班',
  teacherId: null,
  status: 'active',
  notes: null,
  archivedAt: null,
}

function student(index: number): Student {
  return {
    id: index,
    name: `Pupil ${String(index).padStart(2, '0')}`,
    isActive: true,
    remainingHours: 4,
    lessonExpiryDate: '2026-12-31',
    accountFeeExpiryDate: '2026-12-31',
    miraiClubExpiryDate: '2026-12-31',
    studentType: 'regular',
  } as Student
}

function renderList(classrooms: Classroom[], roster: Student[] = []) {
  const noop = vi.fn()
  render(
    <ClassListingSection
      classrooms={classrooms}
      classroomStudentMap={new Map([[1, roster]])}
      deletingClassroomId={null}
      restoringClassroomId={null}
      canEdit={false}
      onEditClassroom={noop}
      onEditSchedule={noop}
      onOpenStudentDetail={noop}
      onSelectAgeGroup={noop}
      schedules={[]}
      selectedAgeGroup="Form 1"
      selectedClassroomId={1}
      setSelectedClassroomId={noop}
      teacherMap={new Map()}
      todayString="2026-10-19"
    />,
  )
}

// A fixed list: the tests never read the real database.
beforeEach(() => resetClassCategoriesForTests(defaultClassCategories, false))
afterEach(() => resetClassCategoriesForTests(defaultClassCategories, false))

describe('Class roster pages', () => {
  it('shows 20 students a page with previous and next', async () => {
    renderList([room], Array.from({ length: 45 }, (_, index) => student(index + 1)))
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(21) // header + 20
    expect(screen.getByText('1–20 of 45')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Pupil 21')).toBeInTheDocument()
    expect(screen.queryByText('Pupil 01')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('41–45 of 45')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()

    // The Students tab shares the page.
    await userEvent.click(screen.getByRole('button', { name: /^Students/ }))
    expect(screen.getByText('Pupil 45')).toBeInTheDocument()
    expect(screen.queryByText('Pupil 20')).not.toBeInTheDocument()
  })

  it('has no pager for 20 students or fewer', () => {
    renderList([room], Array.from({ length: 20 }, (_, index) => student(index + 1)))
    expect(screen.queryByRole('navigation', { name: 'Student pages' })).not.toBeInTheDocument()
  })
})

describe("The school's class categories", () => {
  it('makes a tab of each category and files classes by it', async () => {
    const school: ClassCategory[] = [
      { name: 'Regular Class', kind: 'regular', sortOrder: 10, isActive: true },
      { name: '备战班', kind: 'regular', sortOrder: 15, isActive: true },
      { name: 'Trial Class', kind: 'trial', sortOrder: 20, isActive: false },
    ]
    resetClassCategoriesForTests(school, true)
    renderList([room, { ...room, id: 2, name: 'SEJ 备战 F1', categoryName: '备战班' }])

    expect(screen.queryByRole('button', { name: 'Trial Class' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '备战班' }))
    expect(screen.getByRole('button', { name: /SEJ 备战 F1/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /SCI Form 1/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Regular Class' }))
    expect(screen.getByRole('button', { name: /SCI Form 1/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /SEJ 备战 F1/ })).not.toBeInTheDocument()
  })
})
