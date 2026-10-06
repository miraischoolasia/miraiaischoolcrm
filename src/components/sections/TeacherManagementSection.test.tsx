import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TeacherManagementSection } from './TeacherManagementSection'
import type { Teacher } from '../../types/domain'

const account = (id: number, fullName: string, role: Teacher['role']): Teacher => ({
  id,
  authUserId: null,
  username: fullName.toLowerCase(),
  fullName,
  email: null,
  phone: null,
  role,
  isActive: true,
  permissions: {},
})

const teachers = [
  account(1, 'Admin Demo', 'admin'),
  account(9, 'Ho Jia Hui', 'teacher'),
  account(12, 'Cyrus', 'staff'),
  account(14, 'Ivy', 'staff'),
]

function renderSection() {
  render(
    <TeacherManagementSection
      deletingTeacherId={null}
      isLoading={false}
      teachers={teachers}
      onDeleteTeacher={vi.fn()}
      onEditTeacher={vi.fn()}
      onOpenCreateTeacher={vi.fn()}
      protectedTeacherIds={new Set([1])}
    />,
  )
}

const listedNames = () =>
  [...document.querySelectorAll('tbody tr')].map((row) => row.querySelector('.font-semibold')?.textContent)

describe('TeacherManagementSection', () => {
  it('labels each ID by role', () => {
    renderSection()

    expect(screen.getAllByText('Staff ID #012').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Teacher ID #009').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Admin ID #001').length).toBeGreaterThan(0)
  })

  it('filters by role, with a count on each', async () => {
    renderSection()

    expect(screen.getByRole('button', { name: 'Staff 2' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Staff 2' }))
    expect(listedNames()).toEqual(['Cyrus', 'Ivy'])

    await userEvent.click(screen.getByRole('button', { name: 'Teacher 1' }))
    expect(listedNames()).toEqual(['Ho Jia Hui'])

    await userEvent.click(screen.getByRole('button', { name: 'All 4' }))
    expect(listedNames()).toHaveLength(4)
  })
})
