import { describe, expect, it } from 'vitest'
import { getClassroomRosterOn, getCurrentClassPeriod, isInClassroomOn } from './roster'
import type { Student } from '../types/domain'

const student = (id: number, name: string, extra: Partial<Student>): Student => ({
  id,
  name,
  isActive: true,
  teacherId: 1,
  classroomId: 8,
  phone: null,
  age: null,
  remainingHours: 4,
  lessonExpiryDate: '2027-01-01',
  accountFeeExpiryDate: '2027-01-01',
  miraiClubExpiryDate: '2027-01-01',
  notes: null,
  studentType: 'regular',
  ...extra,
})

// WED C002 (classroom 8): Toh since it began, Chong from 1 Oct; Branson left
// TUE C004 (classroom 10) on 2 Oct.
const toh = student(9, 'Toh', { classPeriods: [{ classroomId: 8, startDate: null, endDate: null }] })
const chong = student(39, 'Chong', {
  classPeriods: [{ classroomId: 8, startDate: '2026-10-01', endDate: null }],
})
const branson = student(13, 'Branson', {
  classroomId: null,
  classPeriods: [{ classroomId: 10, startDate: null, endDate: '2026-10-02' }],
})
const students = [toh, chong, branson]

describe('getClassroomRosterOn', () => {
  it('leaves a student who joined later out of the earlier lessons', () => {
    expect(getClassroomRosterOn(students, 8, '2026-09-23').map((s) => s.name)).toEqual(['Toh'])
    expect(getClassroomRosterOn(students, 8, '2026-10-01').map((s) => s.name)).toEqual(['Toh', 'Chong'])
  })

  it('keeps a student who left in the lessons before they left', () => {
    expect(isInClassroomOn(branson, 10, '2026-09-29')).toBe(true)
    expect(isInClassroomOn(branson, 10, '2026-10-02')).toBe(false)
  })

  it('falls back to the class they are in now before the history exists', () => {
    const noHistory = student(5, 'Old', { classPeriods: undefined })
    expect(isInClassroomOn(noHistory, 8, '2020-01-01')).toBe(true)
    expect(isInClassroomOn(noHistory, 9, '2020-01-01')).toBe(false)
  })
})

describe('getCurrentClassPeriod', () => {
  it('is the open stay in the class they are in now', () => {
    expect(getCurrentClassPeriod(chong)).toEqual({ classroomId: 8, startDate: '2026-10-01', endDate: null })
    expect(getCurrentClassPeriod(branson)).toBeNull()
  })
})
