import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ClassTeachersField } from './ClassTeachersField'
import type { Classroom, Teacher } from '../types/domain'

const mocks = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('../lib/classroomTeachers', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  saveClassroomTeachers: mocks.save,
}))

const teacher = (id: number, fullName: string) => ({ id, fullName, role: 'teacher', isActive: true }) as Teacher
const teachers = [teacher(1, 'Master Tan'), teacher(2, 'Ms Madeline'), teacher(3, 'Mr Henry')]
const classroom = { id: 50, name: 'MM Form 2', teacherId: 1, teacherIds: [1, 2] } as Classroom

describe('ClassTeachersField', () => {
  it('shows every teacher, the main one marked, and saves a new list with the main teacher first', async () => {
    mocks.save.mockResolvedValue(null)
    const onSaved = vi.fn()
    render(
      <ClassTeachersField
        classroom={classroom}
        teacherMap={new Map(teachers.map((entry) => [entry.id, entry]))}
        assignableTeachers={teachers}
        onSaved={onSaved}
      />,
    )
    expect(screen.getByText('Master Tan · main')).toBeInTheDocument()
    expect(screen.getByText('Ms Madeline')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit teachers' }))
    await userEvent.click(screen.getByLabelText('Mr Henry'))
    await userEvent.click(screen.getByLabelText('Ms Madeline'))
    await userEvent.click(screen.getByRole('button', { name: 'Save teachers' }))
    expect(mocks.save).toHaveBeenCalledWith(50, [1, 3])
    expect(onSaved).toHaveBeenCalled()
  })

  it('gives no editing to a login that may not change classes', () => {
    render(<ClassTeachersField classroom={classroom} teacherMap={new Map(teachers.map((entry) => [entry.id, entry]))} />)
    expect(screen.queryByRole('button', { name: 'Edit teachers' })).not.toBeInTheDocument()
  })
})
