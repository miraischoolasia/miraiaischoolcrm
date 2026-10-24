import { describe, expect, it } from 'vitest'
import { getClassroomRosterOn, getCurrentClassPeriod, getExtraClassIds, getStudentClassIds, isInClassroomOn } from './roster'
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

describe('several classes', () => {
  const both = student(50, 'Mei', {
    classPeriods: [
      { classroomId: 8, startDate: null, endDate: null },
      { classroomId: 12, startDate: '2026-10-05', endDate: null },
      { classroomId: 10, startDate: null, endDate: '2026-09-01' },
    ],
  })

  it('lists the main class and every open extra class, not the ones left', () => {
    expect(getStudentClassIds(both)).toEqual([8, 12])
    expect(getExtraClassIds(both)).toEqual([12])
    expect(getExtraClassIds(branson)).toEqual([])
  })

  it('puts the student on the roster of each class', () => {
    expect(isInClassroomOn(both, 12, '2026-10-06')).toBe(true)
    expect(isInClassroomOn(both, 8, '2026-10-06')).toBe(true)
    expect(isInClassroomOn(both, 12, '2026-10-04')).toBe(false)
  })
})

describe('one-day seats (Change class / Replacement)', () => {
  const seat = (kind: 'change' | 'replacement') => ({
    id: 1,
    studentId: 9,
    kind,
    fromClassroomId: 8,
    fromDate: '2026-11-02',
    toClassroomId: 10,
    toDate: '2026-11-03',
    note: null,
  })

  it('a change takes the child out of the old lesson that day and into the new one', () => {
    const moved = { ...toh, lessonSeats: [seat('change')] }

    expect(isInClassroomOn(moved, 8, '2026-11-02')).toBe(false)
    expect(isInClassroomOn(moved, 10, '2026-11-03')).toBe(true)
    // Any other day is as before.
    expect(isInClassroomOn(moved, 8, '2026-11-09')).toBe(true)
    expect(isInClassroomOn(moved, 10, '2026-11-10')).toBe(false)
  })

  it('a replacement keeps the child in the old lesson and adds the new one', () => {
    const moved = { ...toh, lessonSeats: [seat('replacement')] }

    expect(isInClassroomOn(moved, 8, '2026-11-02')).toBe(true)
    expect(isInClassroomOn(moved, 10, '2026-11-03')).toBe(true)
  })

  it('lists the child on the roster of the lesson they sit in', () => {
    const moved = { ...toh, lessonSeats: [seat('change')] }

    expect(getClassroomRosterOn([moved, chong], 10, '2026-11-03').map((entry) => entry.name)).toEqual(['Toh'])
    expect(getClassroomRosterOn([moved, chong], 8, '2026-11-02').map((entry) => entry.name)).toEqual(['Chong'])
  })
})
