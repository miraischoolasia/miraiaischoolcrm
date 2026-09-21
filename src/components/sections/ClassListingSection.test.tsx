import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ClassListingSection } from './ClassListingSection'
import type { Classroom } from '../../types/domain'

describe('Classroom categories', () => {
  it('filters trial classrooms and retains custom names', async () => {
    const base: Classroom = { id: 1, name: 'Regular coding', category: 'regular', ageGroup: '6-8 Years Old', programLevel: 'Coder Foundation', teacherId: null, status: 'active', notes: null, archivedAt: null }
    const noop = vi.fn()
    render(<ClassListingSection classrooms={[base, { ...base, id: 2, category: 'trial', name: 'My custom trial' }]} classroomStudentMap={new Map()} deletingClassroomId={null} restoringClassroomId={null} isAdminView={false} onDeleteClassroom={noop} onEditClassroom={noop} onEditSchedule={noop} onOpenStudentDetail={noop} onRestoreClassroom={noop} onSelectAgeGroup={noop} schedules={[]} selectedAgeGroup="6-8 Years Old" selectedClassroomId={null} setSelectedClassroomId={noop} teacherMap={new Map()} todayString="2026-09-14" />)
    await userEvent.click(screen.getByRole('button', { name: 'Trial Class' }))
    expect(screen.queryByRole('button', { name: /Regular coding/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /My custom trial/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Regular Class' }))
    expect(screen.queryByRole('button', { name: /My custom trial/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Regular coding/ })).toBeInTheDocument()
  })
})
