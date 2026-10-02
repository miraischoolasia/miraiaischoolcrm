import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AssignPackagesModal } from './AssignPackagesModal'
import type { Package, Student } from '../../types/domain'

const student = (id: number, name: string, packageId: number | null = null): Student => ({
  id,
  name,
  isActive: true,
  teacherId: null,
  classroomId: null,
  phone: null,
  age: null,
  remainingHours: 8,
  lessonExpiryDate: '2026-12-31',
  accountFeeExpiryDate: '2026-12-31',
  miraiClubExpiryDate: '2026-12-31',
  notes: '',
  studentType: 'regular',
  packageId,
})
const pkg = (id: number, name: string, isActive = true): Package => ({
  id,
  name,
  kind: 'regular',
  classCount: 12,
  durationMonths: 3,
  includesFees: true,
  isActive,
  sortOrder: id,
})

describe('AssignPackagesModal', () => {
  it('lists untagged students first and saves only what changed', async () => {
    const onSave = vi.fn()
    render(
      <AssignPackagesModal
        students={[student(1, 'Zara', 2), student(2, 'Ali'), student(3, 'Bee')]}
        packages={[pkg(1, '3 Months'), pkg(2, '6 Months'), pkg(3, 'Old Deal', false)]}
        isSaving={false}
        error={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    )

    const names = screen.getAllByRole('listitem').map((item) => item.querySelector('.font-semibold')?.textContent)
    expect(names).toEqual(['Ali', 'Bee', 'Zara'])
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    // Hidden packages are not offered.
    expect(
      within(screen.getByRole('combobox', { name: 'Package for Ali' })).queryByRole('option', { name: /Old Deal/ }),
    ).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Package for Ali' }), '6 Months')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Package for Zara' }), '3 Months')
    await userEvent.click(screen.getByRole('button', { name: 'Save 2 changes' }))

    expect(onSave).toHaveBeenCalledWith([
      { studentId: 1, packageId: 1 },
      { studentId: 2, packageId: 2 },
    ])
  })
})
