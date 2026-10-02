import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DeleteTeacherModal } from './DeleteTeacherModal'
import type { Teacher } from '../../types/domain'

function makeTeacher(id: number, fullName: string): Teacher {
  return {
    id,
    authUserId: null,
    username: `t${id}`,
    fullName,
    email: null,
    phone: null,
    role: 'teacher',
    isActive: true,
    permissions: {},
  }
}

const leaving = makeTeacher(2, 'Leaving Teacher')
const successor = makeTeacher(3, 'Next Teacher')

describe('DeleteTeacherModal', () => {
  it('defaults to handing classes over when the teacher still has classrooms', async () => {
    const onConfirm = vi.fn()
    render(
      <DeleteTeacherModal
        teacher={leaving}
        classroomNames={['Mon Class']}
        successorOptions={[successor]}
        isDeleting={false}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    expect(screen.getByText('Currently teaches: Mon Class')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Teacher' }))
    expect(onConfirm).toHaveBeenCalledWith(3)
  })

  it('can remove without a successor', async () => {
    const onConfirm = vi.fn()
    render(
      <DeleteTeacherModal
        teacher={leaving}
        classroomNames={['Mon Class']}
        successorOptions={[successor]}
        isDeleting={false}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    await userEvent.selectOptions(screen.getByRole('combobox'), '')
    expect(screen.getByText(/upcoming classes stop/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Teacher' }))
    expect(onConfirm).toHaveBeenCalledWith(null)
  })
})
