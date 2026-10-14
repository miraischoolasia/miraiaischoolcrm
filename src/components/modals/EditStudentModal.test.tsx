import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EditStudentModal } from './EditStudentModal'

function renderModal(dateOfBirth: string, studentType: 'regular' | 'preview' = 'regular') {
  const onFieldChange = vi.fn()
  render(
    <EditStudentModal
      studentName="Mia Tan"
      classrooms={[]}
      teacherMap={new Map()}
      formState={{ fullName: 'Mia Tan', phone: '', classroomId: '', notes: '', studentType, dateOfBirth }}
      saveError={null}
      isSaving={false}
      onClose={vi.fn()}
      onSubmit={vi.fn()}
      onFieldChange={onFieldChange}
    />,
  )
  return onFieldChange
}

describe('EditStudentModal date of birth', () => {
  it('shows the birth date and reports a new one', async () => {
    const onFieldChange = renderModal('2016-03-01')

    const input = screen.getByLabelText(/Date of Birth/)
    expect(input).toHaveValue('2016-03-01')
    await userEvent.clear(input)
    expect(onFieldChange).toHaveBeenCalledWith('dateOfBirth', '')
  })

  it('does not ask for it on a preview class', () => {
    renderModal('', 'preview')

    expect(screen.queryByLabelText(/Date of Birth/)).not.toBeInTheDocument()
  })
})
