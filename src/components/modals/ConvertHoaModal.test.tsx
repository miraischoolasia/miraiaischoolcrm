import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConvertHoaModal } from './ConvertHoaModal'
import type { Classroom, Package, Student } from '../../types/domain'

// Mirai: packages and fees.

const hoa = {
  id: 32, name: 'Ava Tan', studentType: 'trial', teacherId: null, classroomId: null, phone: null, age: 8,
  remainingHours: 0, lessonExpiryDate: '2026-10-01', accountFeeExpiryDate: '2026-10-01', miraiClubExpiryDate: '2026-10-01',
  notes: null, isActive: true,
} as Student
const classroom = { id: 5, name: 'WED C002', ageGroup: '6-8 Years Old', programLevel: 'Coder Foundation', category: 'regular', status: 'active' } as Classroom
const sixMonths: Package = {
  id: 2, name: '6 Months', kind: 'regular', classCount: 24, durationMonths: 6, includesFees: true, isActive: true, sortOrder: 1,
}

describe('ConvertHoaModal', () => {
  it('converts with the class, package, its classes and end date, and a new fee year', async () => {
    const onConvert = vi.fn().mockResolvedValue(null)
    render(
      <ConvertHoaModal student={hoa} classrooms={[classroom]} packages={[sixMonths]} todayString="2026-11-02" onClose={vi.fn()} onConvert={onConvert} />,
    )

    await userEvent.selectOptions(screen.getByLabelText('Class'), '5')
    await userEvent.selectOptions(screen.getByLabelText('Package'), '2')
    expect(screen.getByText(/24 classes, until/)).toHaveTextContent('Account Fee and Mirai Club run for a year')

    await userEvent.click(screen.getByRole('button', { name: 'Convert to Regular' }))
    expect(onConvert).toHaveBeenCalledWith(
      expect.objectContaining({ classroomId: 5, startDate: '2026-11-02', packageId: 2, classCount: 24 }),
    )
    const sent = onConvert.mock.calls[0][0]
    expect(sent.lessonExpiryDate > '2027-04-01').toBe(true)
    expect(sent.accountFeeExpiryDate > '2027-10-01').toBe(true)
  })

  it('asks for the class and the package first', async () => {
    const onConvert = vi.fn()
    render(
      <ConvertHoaModal student={hoa} classrooms={[classroom]} packages={[sixMonths]} todayString="2026-11-02" onClose={vi.fn()} onConvert={onConvert} />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Convert to Regular' }))
    expect(screen.getByText('Pick the class.')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Class'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Convert to Regular' }))
    expect(screen.getByText('Pick the package.')).toBeInTheDocument()
    expect(onConvert).not.toHaveBeenCalled()
  })

  it('shows why it could not convert', async () => {
    render(
      <ConvertHoaModal
        student={hoa}
        classrooms={[classroom]}
        packages={[sixMonths]}
        todayString="2026-11-02"
        onClose={vi.fn()}
        onConvert={vi.fn().mockResolvedValue('Converting to a regular student needs the database update first.')}
      />,
    )

    await userEvent.selectOptions(screen.getByLabelText('Class'), '5')
    await userEvent.selectOptions(screen.getByLabelText('Package'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Convert to Regular' }))
    expect(await screen.findByText(/needs the database update first/)).toBeInTheDocument()
  })
})
