import { describe, expect, it } from 'vitest'
import { buildStudentParents } from './studentParents'
import type { Lead, Student, TrialBooking } from '../types/domain'

function student(id: number, phone: string | null = null): Student {
  return {
    id, name: `Student ${id}`, isActive: true, teacherId: null, classroomId: null, phone, age: null,
    remainingHours: 4, lessonExpiryDate: '2026-12-31', accountFeeExpiryDate: '2026-12-31',
    miraiClubExpiryDate: '2026-12-31', notes: '', studentType: 'regular',
  }
}

function lead(id: number, fullName: string | null, phone: string | null, convertedStudentId: number | null = null): Lead {
  return {
    id, fullName, phone, sourceId: null, picId: null, state: null, tagIds: [],
    checks: {} as Lead['checks'], status: 'new', children: [], notes: null, followUps: [], tasks: [],
    convertedStudentId, addedDate: '2026-10-01', createdAt: '', updatedAt: '',
  }
}

const booking = (studentId: number, leadId: number): TrialBooking => ({
  id: 1, scheduleId: 1, bookingDate: '2026-10-12', leadId, studentId, childName: 'x', childAge: 7, phone: null, notes: null,
})

describe('buildStudentParents', () => {
  it('uses the lead the student was converted from, and the student phone over the lead phone', () => {
    const parents = buildStudentParents({
      students: [student(1, '0123'), student(2)],
      leads: [lead(10, 'Mrs Tan', '0999', 1), lead(11, 'Mr Lim', '0888', 2)],
      trialBookings: [],
    })

    expect(parents.get(1)).toEqual({ name: 'Mrs Tan', phone: '0123' })
    expect(parents.get(2)).toEqual({ name: 'Mr Lim', phone: '0888' })
  })

  it('finds the parent of an HOA student through the booking', () => {
    const parents = buildStudentParents({
      students: [student(5)],
      leads: [lead(20, 'Mrs Ho', '0777')],
      trialBookings: [booking(5, 20)],
    })

    expect(parents.get(5)).toEqual({ name: 'Mrs Ho', phone: '0777' })
  })

  it('gives a student with no lead their phone and no name', () => {
    const parents = buildStudentParents({ students: [student(7, '0555')], leads: [], trialBookings: [] })

    expect(parents.get(7)).toEqual({ name: null, phone: '0555' })
  })
})
