import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChangePackageModal } from './ChangePackageModal'
import type { Package, Student, StudentEnrollment } from '../../types/domain'

const pkg = (id: number, name: string, classCount: number, durationMonths: number, includesFees: boolean): Package => ({
  id,
  name,
  kind: includesFees ? 'regular' : 'trial',
  classCount,
  durationMonths,
  includesFees,
  isActive: true,
  sortOrder: id,
})
const packages = [pkg(1, 'Trial 1 Month', 4, 1, false), pkg(2, '3 Months', 12, 3, true)]

// Lee Xuan Hong: Trial picked by mistake, one class attended.
const student: Student = {
  id: 41,
  name: 'Lee Xuan Hong',
  isActive: true,
  teacherId: 9,
  classroomId: 12,
  phone: null,
  age: null,
  remainingHours: 3,
  lessonExpiryDate: '2026-11-03',
  accountFeeExpiryDate: '2026-10-03',
  miraiClubExpiryDate: '2026-10-03',
  notes: null,
  studentType: 'regular',
  packageId: 1,
}
const enrollment: StudentEnrollment = {
  id: 1,
  studentId: 41,
  packageId: 1,
  startDate: '2026-10-03',
  endDate: '2026-11-03',
  classCount: 4,
  remark: null,
  createdAt: '',
}

describe('ChangePackageModal', () => {
  it('replaces the wrong package: takes back its classes and starts the fee year', async () => {
    const onSave = vi.fn()
    render(
      <ChangePackageModal
        student={student}
        enrollment={enrollment}
        packages={packages}
        isSaving={false}
        error={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    )

    expect(screen.getByRole('button', { name: 'Change Package' })).toBeDisabled()
    // The package being replaced is not offered again.
    expect(screen.queryByRole('option', { name: /Trial 1 Month/ })).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Correct Package' }), '2')
    fireEvent.change(screen.getByLabelText('Starts On'), { target: { value: '2026-10-01' } })

    expect(screen.getByText(/Classes left: 3 →/)).toHaveTextContent('Classes left: 3 → 11')
    await userEvent.click(screen.getByRole('button', { name: 'Change Package' }))

    expect(onSave).toHaveBeenCalledWith({
      packageId: 2,
      startDate: '2026-10-01',
      classCount: 12,
      lessonExpiryDate: '2027-01-01',
      accountFeeExpiryDate: '2027-10-01',
      miraiClubExpiryDate: '2027-10-01',
      remark: '',
    })
  })
})
