import { describe, expect, it } from 'vitest'
import { findHoaStudentForChild } from './convertHoa'
import type { Student, TrialBooking } from '../types/domain'

function student(id: number, name: string, studentType: Student['studentType'] = 'trial'): Student {
  return {
    id, name, studentType, teacherId: null, classroomId: null, phone: null, age: null, remainingHours: 0,
    lessonExpiryDate: '2026-10-01', accountFeeExpiryDate: '2026-10-01', miraiClubExpiryDate: '2026-10-01',
    notes: null, isActive: true,
  }
}

function booking(id: number, leadId: number | null, studentId: number | null): TrialBooking {
  return { id, leadId, studentId } as TrialBooking
}

const students = [student(1, 'Ava Tan'), student(2, 'Ben Tan'), student(3, 'Cara Lim'), student(4, 'Ava Tan', 'regular')]
const trialBookings = [booking(10, 7, 1), booking(11, 7, 2), booking(12, 8, 3), booking(13, null, 3)]

describe('findHoaStudentForChild', () => {
  it("finds the lead's HOA student with the child's name, ignoring case and spaces", () => {
    expect(findHoaStudentForChild({ leadId: 7, childName: ' ava  TAN ', childCount: 2, students, trialBookings })?.id).toBe(1)
    expect(findHoaStudentForChild({ leadId: 7, childName: 'Ben Tan', childCount: 2, students, trialBookings })?.id).toBe(2)
  })

  it('never picks a sibling with another name', () => {
    expect(findHoaStudentForChild({ leadId: 7, childName: 'Dan Tan', childCount: 3, students, trialBookings })).toBeNull()
  })

  it('a lead with one child and one HOA student matches a name typed a little differently', () => {
    expect(findHoaStudentForChild({ leadId: 8, childName: 'Cara', childCount: 1, students, trialBookings })?.id).toBe(3)
  })

  it('ignores students who are regular already, and other leads', () => {
    expect(findHoaStudentForChild({ leadId: 9, childName: 'Ava Tan', childCount: 1, students, trialBookings })).toBeNull()
    const converted = [student(1, 'Ava Tan', 'regular')]
    expect(findHoaStudentForChild({ leadId: 7, childName: 'Ava Tan', childCount: 1, students: converted, trialBookings })).toBeNull()
  })
})
