import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ClassListingSection } from './ClassListingSection'
import type { Classroom } from '../../types/domain'

describe('Classroom categories', () => {
  it('filters trial classrooms and retains custom names', async () => {
    const base: Classroom = { id: 1, name: 'Regular coding', category: 'regular', ageGroup: '6-8 Years Old', programLevel: 'Coder Foundation', teacherId: null, status: 'active', notes: null, archivedAt: null }
    const noop = vi.fn()
    render(<ClassListingSection classrooms={[base, { ...base, id: 2, category: 'trial', name: 'My custom trial' }]} classroomStudentMap={new Map()} deletingClassroomId={null} restoringClassroomId={null} canEdit={false} onDeleteClassroom={noop} onEditClassroom={noop} onEditSchedule={noop} onOpenStudentDetail={noop} onRestoreClassroom={noop} onSelectAgeGroup={noop} schedules={[]} selectedAgeGroup="6-8 Years Old" selectedClassroomId={null} setSelectedClassroomId={noop} teacherMap={new Map()} todayString="2026-09-14" />)
    await userEvent.click(screen.getByRole('button', { name: 'Trial Class' }))
    expect(screen.queryByRole('button', { name: /Regular coding/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /My custom trial/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Regular Class' }))
    expect(screen.queryByRole('button', { name: /My custom trial/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Regular coding/ })).toBeInTheDocument()
  })
})

describe('Classroom list for a teacher', () => {
  const room = (id: number, name: string, ageGroup: Classroom['ageGroup']): Classroom => ({
    id, name, category: 'regular', ageGroup, programLevel: 'Coder Pro', teacherId: 9, status: 'active', notes: null, archivedAt: null,
  })

  it('lists every class at once, without picking a category or age group first', async () => {
    const onSelectAgeGroup = vi.fn()
    const setSelectedClassroomId = vi.fn()
    render(
      <ClassListingSection
        classrooms={[room(1, 'WED C002', '9-11 Years Old'), room(2, 'SAT C009', '12-14 Years Old')]}
        classroomStudentMap={new Map()}
        deletingClassroomId={null}
        restoringClassroomId={null}
        canEdit={false}
        simple
        onEditClassroom={vi.fn()}
        onEditSchedule={vi.fn()}
        onOpenStudentDetail={vi.fn()}
        onSelectAgeGroup={onSelectAgeGroup}
        schedules={[]}
        selectedAgeGroup="9-11 Years Old"
        selectedClassroomId={null}
        setSelectedClassroomId={setSelectedClassroomId}
        teacherMap={new Map()}
        todayString="2026-10-09"
      />,
    )

    expect(screen.queryByRole('button', { name: 'Trial Class' })).not.toBeInTheDocument()
    expect(screen.queryByText('Age Group')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /WED C002/ })).toBeInTheDocument()

    // A class in another age group is opened, and the age group follows it.
    await userEvent.click(screen.getByRole('button', { name: /SAT C009/ }))
    expect(setSelectedClassroomId).toHaveBeenCalledWith(2)
    expect(onSelectAgeGroup).toHaveBeenCalledWith('12-14 Years Old')
  })
})
