import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ClassroomModal } from './ClassroomModal'
import type { Classroom, ClassroomFormState, Teacher } from '../../types/domain'

const classroom: Classroom = {
  category: 'regular',
  id: 10,
  name: 'Mon Class',
  ageGroup: '9-11 Years Old',
  programLevel: 'Coder Pro',
  teacherId: 2,
  status: 'active',
  notes: null,
  archivedAt: null,
}

const teachers: Teacher[] = [2, 3].map((id) => ({
  id,
  authUserId: null,
  username: `t${id}`,
  fullName: `Teacher ${id}`,
  email: null,
  phone: null,
  role: 'teacher',
  isActive: true,
  permissions: {},
}))

function renderWithTeacher(teacherId: string) {
  const formState: ClassroomFormState = {
    category: 'regular',
    name: 'Mon Class',
    ageGroup: '9-11 Years Old',
    programLevel: 'Coder Pro',
    teacherId,
    teacherEffectiveDate: '2026-09-28',
    notes: '',
  }

  render(
    <ClassroomModal
      isCreating={false}
      editingClassroom={classroom}
      assignableTeachers={teachers}
      formState={formState}
      saveError={null}
      isSaving={false}
      onClose={vi.fn()}
      onSubmit={vi.fn()}
      onFieldChange={vi.fn()}
    />,
  )
}

describe('ClassroomModal teacher change', () => {
  it('hides the start date while the teacher is unchanged', () => {
    renderWithTeacher('2')
    expect(screen.queryByText('New teacher starts from')).not.toBeInTheDocument()
  })

  it('asks for the start date when the teacher changes', () => {
    renderWithTeacher('3')
    expect(screen.getByText('New teacher starts from')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2026-09-28')).toBeInTheDocument()
  })
})
