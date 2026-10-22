import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { defaultClassCategories, resetClassCategoriesForTests } from '../../lib/classCategories'
import { StudentDashboardSection } from './StudentDashboardSection'
import type { LeadOption, Student } from '../../types/domain'

// The tags of the students: a filter on the student list.

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
const option = (id: number, label: string): LeadOption => ({ id, kind: 'tag', label, isActive: true, legacyKey: null, color: '#dc2626' })
const options = [option(10, 'Crystal'), option(11, 'Violet')]
const map = new Map([
  [1, [10]],
  [2, [10, 11]],
])
const noop = vi.fn()

function renderList(studentTags?: { options: LeadOption[]; map: Map<number, number[]> }) {
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
      studentTags={studentTags}
    />,
  )
}

const names = () => [...document.querySelectorAll('tbody tr')].map((row) => row.querySelector('button')?.textContent).sort()

// The class categories are the defaults; nothing is read from the database.
beforeAll(() => resetClassCategoriesForTests(defaultClassCategories))

describe('student list with tags', () => {
  it('filters by a tag, and by no tag', async () => {
    renderList({ options, map })
    await userEvent.selectOptions(screen.getByLabelText('Filter by tag'), 'Violet')
    expect(names()).toEqual(['Siti'])
    await userEvent.selectOptions(screen.getByLabelText('Filter by tag'), 'Crystal')
    expect(names()).toEqual(['Ali', 'Siti'])
    await userEvent.selectOptions(screen.getByLabelText('Filter by tag'), 'No tag')
    expect(names()).toEqual(['Mei'])
  })

  it('has no tag filter when the school has no tags', () => {
    renderList({ options: [], map: new Map() })
    expect(screen.queryByLabelText('Filter by tag')).not.toBeInTheDocument()
  })
})
