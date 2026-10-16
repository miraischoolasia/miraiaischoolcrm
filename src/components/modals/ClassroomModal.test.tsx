import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ClassroomModal } from './ClassroomModal'
import type { Programme } from '../../lib/programmes'
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
    zoomLink: '',
    programmeId: '',
    subjectId: '',
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

describe('ClassroomModal zoom link', () => {
  it('shows the Zoom link of the class and reports a change', async () => {
    const onFieldChange = vi.fn()
    render(
      <ClassroomModal
        isCreating={false}
        editingClassroom={classroom}
        assignableTeachers={teachers}
        formState={{
          category: 'regular',
          name: 'Mon Class',
          ageGroup: '9-11 Years Old',
          programLevel: 'Coder Pro',
          teacherId: '2',
          teacherEffectiveDate: '2026-09-28',
          notes: '',
          zoomLink: 'https://zoom.us/j/1',
          programmeId: '',
          subjectId: '',
        }}
        saveError={null}
        isSaving={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onFieldChange={onFieldChange}
      />,
    )

    const input = screen.getByLabelText(/Zoom Link/)
    expect(input).toHaveValue('https://zoom.us/j/1')
    await userEvent.type(input, '2')
    expect(onFieldChange).toHaveBeenCalledWith('zoomLink', 'https://zoom.us/j/12')
  })
})

describe('ClassroomModal programme', () => {
  const maths: Programme = {
    id: 5,
    name: 'Maths tuition',
    legacyKey: null,
    outcome: 'enrol',
    messageTemplate: '',
    isActive: true,
    sortOrder: 10,
    steps: [],
  }
  const trialCourse: Programme = { ...maths, id: 6, name: 'Trial lessons', outcome: 'booking' }

  function renderWith(programmes: Programme[], programmeId: string, onFieldChange = vi.fn()) {
    render(
      <ClassroomModal
        isCreating
        editingClassroom={null}
        assignableTeachers={teachers}
        formState={{
          category: 'regular',
          name: '',
          ageGroup: '9-11 Years Old',
          programLevel: 'Coder Pro',
          teacherId: '',
          teacherEffectiveDate: '2026-09-28',
          notes: '',
          zoomLink: '',
          programmeId,
          subjectId: '',
        }}
        programmes={programmes}
        saveError={null}
        isSaving={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onFieldChange={onFieldChange}
      />,
    )
    return onFieldChange
  }

  it('has no Programme choice when the school has no programme', () => {
    renderWith([], '')
    expect(screen.queryByRole('combobox', { name: /Programme/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Age Group')).toBeInTheDocument()
  })

  it('makes the class a regular class for a programme that enrols, and a trial class for one that keeps a place', async () => {
    const onFieldChange = renderWith([maths, trialCourse], '')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Programme/ }), '5')
    expect(onFieldChange).toHaveBeenCalledWith('programmeId', '5')
    expect(onFieldChange).toHaveBeenCalledWith('category', 'regular')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Programme/ }), '6')
    expect(onFieldChange).toHaveBeenCalledWith('category', 'trial')
  })

  it('leaves out the age group and level for a programme the school made', () => {
    renderWith([maths], '5')
    expect(screen.queryByLabelText('Age Group')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Program Level')).not.toBeInTheDocument()
  })
})
