import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudentDashboardSection } from './StudentDashboardSection'
import { resetClassCategoriesForTests } from '../../lib/classCategories'
import type { Classroom, Student } from '../../types/domain'

// The tabs above the list follow the school's class categories (My Classroom) instead of HOA / Trial / Regular / Camp.

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
const room = (id: number, name: string, categoryName: string) =>
  ({ id, name, category: 'regular', categoryName, ageGroup: '12-14 Years Old', programLevel: 'Form 2', teacherId: null, status: 'active', notes: null, archivedAt: null }) as unknown as Classroom
const classrooms = [room(1, 'Main A', 'Main'), room(2, 'Free A', 'Free')]
const students = [
  { ...base, id: 1, name: 'Ali', classroomId: 1 },
  { ...base, id: 2, name: 'Siti', classroomId: 1, classPeriods: [{ classroomId: 1, startDate: null, endDate: null }, { classroomId: 2, startDate: null, endDate: null }] },
  { ...base, id: 3, name: 'Mei' },
]
const noop = vi.fn()

function renderList(extra: Partial<React.ComponentProps<typeof StudentDashboardSection>> = {}) {
  resetClassCategoriesForTests([
    { name: 'Main', kind: 'regular', sortOrder: 10, isActive: true },
    { name: 'Free', kind: 'regular', sortOrder: 20, isActive: true },
    { name: 'Camp short', kind: 'camp', sortOrder: 30, isActive: true },
  ])
  return render(
    <StudentDashboardSection
      activeFilter="all"
      deactivatingStudentId={null}
      isLoading={false}
      students={students}
      classrooms={classrooms}
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

const tabLabels = () => screen.getAllByRole('button', { pressed: false }).concat(screen.getAllByRole('button', { pressed: true })).map((button) => button.textContent)

afterEach(() => resetClassCategoriesForTests(null))

describe('student tabs by class category', () => {
  it('shows All first, each category with people in it, and No class; an empty category is hidden', () => {
    renderList({ tabsByClassCategory: true })
    const tabs = screen.getAllByRole('button').filter((button) => button.hasAttribute('aria-pressed') && /\d$/.test(button.textContent ?? ''))
    expect(tabs.map((button) => button.textContent)).toEqual(['All3', 'Main2', 'Free1', 'No class1'])
    expect(tabLabels().join()).not.toContain('Camp short')
    expect(tabLabels().join()).not.toContain('HOA')
  })

  it('opens a category with the people who are in a class of it', async () => {
    const onSelectFilter = vi.fn()
    renderList({ tabsByClassCategory: true, onSelectFilter })
    await userEvent.click(screen.getByRole('button', { name: /^Free/ }))
    expect(onSelectFilter).toHaveBeenCalledWith('category:Free')
  })

  it('lists only the students of the open category, or the ones in no class', () => {
    const { unmount } = renderList({ tabsByClassCategory: true, activeFilter: 'category:Free' })
    expect([...document.querySelectorAll('tbody tr')].map((row) => row.querySelector('button')?.textContent)).toEqual(['Siti'])
    unmount()
    renderList({ tabsByClassCategory: true, activeFilter: 'category-none' })
    expect([...document.querySelectorAll('tbody tr')].map((row) => row.querySelector('button')?.textContent)).toEqual(['Mei'])
  })

  it('keeps the open tab even when nobody is in it', () => {
    renderList({ tabsByClassCategory: true, activeFilter: 'category:Camp short' })
    expect(screen.getByRole('button', { name: /^Camp short/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps HOA / Trial / Regular / Camp when the school has not switched', () => {
    renderList({ tabsByClassCategory: false })
    expect(screen.getByRole('button', { name: /^HOA/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Camp/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^No class/ })).not.toBeInTheDocument()
  })
})
