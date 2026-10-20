import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Classroom, Student } from '../../types/domain'

// A school with no packages and no fees (EduHero): the class and its months, nothing about fees.
vi.mock('../../lib/brand', () => ({
  brand: {
    name: 'EduHero', clubName: 'Membership', usesFees: false, usesPackages: false,
    usesMiraiArt: false, logo: null, favicon: null, company: '', loginHint: '',
  },
}))

const { ConvertHoaModal } = await import('./ConvertHoaModal')

const hoa = {
  id: 32, name: 'Ali', studentType: 'trial', teacherId: null, classroomId: null, phone: null, age: 10,
  remainingHours: 0, lessonExpiryDate: '2026-10-01', accountFeeExpiryDate: '2026-10-01', miraiClubExpiryDate: '2026-10-01',
  notes: null, isActive: true,
} as Student
const classroom = { id: 7, name: 'Year 5 Maths', ageGroup: 'Year 5', programLevel: 'Maths', category: 'regular', status: 'active' } as Classroom

describe('ConvertHoaModal at a school that charges by the month', () => {
  it('asks for the class, first day and months, with no package and no fees', async () => {
    const onConvert = vi.fn().mockResolvedValue(null)
    render(<ConvertHoaModal student={hoa} classrooms={[classroom]} packages={[]} todayString="2026-11-01" onClose={vi.fn()} onConvert={onConvert} />)

    expect(screen.queryByLabelText('Package')).not.toBeInTheDocument()
    expect(screen.queryByText(/Account Fee|Membership/)).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Class'), '7')
    await userEvent.clear(screen.getByLabelText('Months'))
    await userEvent.type(screen.getByLabelText('Months'), '3')
    expect(screen.getByText('Paid until Jan 31, 2027.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Convert to Regular' }))
    expect(onConvert).toHaveBeenCalledWith({ classroomId: 7, startDate: '2026-11-01', months: 3 })
  })
})
