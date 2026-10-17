import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExtraClassesField } from './ExtraClassesField'
import type { Classroom, Student } from '../types/domain'

const classroom = (id: number, name: string, status: Classroom['status'] = 'active'): Classroom => ({
  category: 'regular' as Classroom['category'],
  id,
  name,
  ageGroup: '7-9' as Classroom['ageGroup'],
  programLevel: 'L1' as Classroom['programLevel'],
  teacherId: null,
  status,
  notes: null,
  archivedAt: null,
})
const classrooms = [classroom(1, 'MM Form 2'), classroom(2, 'SCI Form 2'), classroom(3, 'BM Form 2'), classroom(4, 'Old', 'archived')]
const student: Student = {
  id: 9,
  name: 'Mei',
  isActive: true,
  teacherId: null,
  classroomId: 1,
  phone: null,
  age: null,
  remainingHours: 4,
  lessonExpiryDate: '2027-01-01',
  accountFeeExpiryDate: '2027-01-01',
  miraiClubExpiryDate: '2027-01-01',
  notes: null,
  studentType: 'regular',
  classPeriods: [
    { classroomId: 1, startDate: null, endDate: null },
    { classroomId: 2, startDate: '2026-10-01', endDate: null },
  ],
}

describe('ExtraClassesField', () => {
  it('lists the other classes and adds one more', async () => {
    const onAdd = vi.fn().mockResolvedValue(null)
    render(<ExtraClassesField student={student} classrooms={classrooms} onAdd={onAdd} onRemove={vi.fn()} />)
    expect(screen.getByText('SCI Form 2')).toBeInTheDocument()
    const picker = screen.getByLabelText('Add to another class')
    // Not the classes the student is in, nor archived ones.
    expect(Array.from(picker.querySelectorAll('option')).map((option) => option.textContent)).toEqual(['Add to another class…', 'BM Form 2'])
    await userEvent.selectOptions(picker, '3')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledWith(3)
  })

  it('removes a class after asking, and shows the reason when it fails', async () => {
    const onRemove = vi.fn().mockResolvedValue('Only staff who may edit students can change classes.')
    vi.stubGlobal('confirm', vi.fn(() => true))
    render(<ExtraClassesField student={student} classrooms={classrooms} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalledWith(2)
    expect(await screen.findByText('Only staff who may edit students can change classes.')).toBeInTheDocument()
  })

  it('shows nothing to a viewer when there is no other class', () => {
    const { container } = render(
      <ExtraClassesField student={{ ...student, classPeriods: [{ classroomId: 1, startDate: null, endDate: null }] }} classrooms={classrooms} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
