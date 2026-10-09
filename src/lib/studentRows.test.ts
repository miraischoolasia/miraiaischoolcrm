import { describe, expect, it } from 'vitest'
import { buildStudentRows, filterStudentRows, sortStudentRows } from './studentRows'
import type { Classroom, Package, Schedule, Student, Teacher } from '../types/domain'

const today = '2026-10-09'

function student(id: number, overrides: Partial<Student> = {}): Student {
  return {
    id, name: `Student ${id}`, isActive: true, teacherId: null, classroomId: null, phone: null, age: null,
    remainingHours: 10, lessonExpiryDate: '2027-03-01', accountFeeExpiryDate: '2027-03-01',
    miraiClubExpiryDate: '2027-03-01', notes: '', studentType: 'regular', ...overrides,
  }
}

const packages: Package[] = [
  { id: 1, name: 'Trial 1 Month', kind: 'trial', classCount: 4, durationMonths: 1, includesFees: false, isActive: true, sortOrder: 1 },
  { id: 2, name: '6 Months', kind: 'regular', classCount: 24, durationMonths: 6, includesFees: true, isActive: true, sortOrder: 2 },
  { id: 3, name: 'Holiday Camp', kind: 'camp', classCount: 12, durationMonths: 3, includesFees: false, isActive: true, sortOrder: 3 },
]
const classroom = { id: 5, name: 'WED C002', teacherId: 9 } as Classroom
const schedule = {
  id: 1, teacherId: 9, classroomId: 5, eventType: 'regular', status: 'active', dayOfWeek: 3,
  startTime: '16:00', endTime: '17:30',
} as Schedule
const teacher = { id: 9, fullName: 'Ms Rachel' } as Teacher

function rowsFor(students: Student[]) {
  return buildStudentRows({
    students, packages, classrooms: [classroom], schedules: [schedule], teacherMap: new Map([[9, teacher]]),
    trialBookings: [], parents: new Map(), todayString: today,
  })
}

describe('buildStudentRows', () => {
  it('names the class, its first weekly slot and the teacher', () => {
    const [row] = rowsFor([student(1, { classroomId: 5, packageId: 2 })])

    expect(row.classroom?.name).toBe('WED C002')
    expect(row.slot).toBe('Wed 16:00-17:30')
    expect(row.teacherName).toBe('Ms Rachel')
    expect(row.kind).toBe('regular')
  })

  it('flags a student who needs follow-up, but not a deactivated or no-fee one', () => {
    const rows = rowsFor([
      student(1, { remainingHours: 1, packageId: 2 }),
      student(2, { remainingHours: 1, isActive: false }),
      student(3, { packageId: 1, accountFeeExpiryDate: '2026-10-01' }),
    ])

    expect(rows.map((row) => row.needsFollowUp)).toEqual([true, false, false])
  })
})

describe('filterStudentRows', () => {
  const rows = rowsFor([
    student(1, { name: 'Ava Tan', packageId: 2, remainingHours: 1 }),
    student(2, { name: 'Ben Lim', packageId: 1 }),
    student(3, { name: 'Cara Ng', studentType: 'trial' }),
    student(4, { name: 'Dan Ho', packageId: 3 }),
  ])
  const names = (list: typeof rows) => list.map((row) => row.student.name)

  it('filters by type like the old tabs, and combines with follow-up and search', () => {
    expect(names(filterStudentRows(rows, { type: 'hoa', followUpOnly: false, search: '' }))).toEqual(['Cara Ng'])
    expect(names(filterStudentRows(rows, { type: 'trial', followUpOnly: false, search: '' }))).toEqual(['Ben Lim'])
    expect(names(filterStudentRows(rows, { type: 'camp', followUpOnly: false, search: '' }))).toEqual(['Dan Ho'])
    expect(names(filterStudentRows(rows, { type: 'regular', followUpOnly: true, search: '' }))).toEqual(['Ava Tan'])
    expect(names(filterStudentRows(rows, { type: 'all', followUpOnly: false, search: 'ben' }))).toEqual(['Ben Lim'])
  })

  it('finds a student by their ID', () => {
    expect(names(filterStudentRows(rows, { type: 'all', followUpOnly: false, search: '#004' }))).toEqual(['Dan Ho'])
    expect(names(filterStudentRows(rows, { type: 'all', followUpOnly: false, search: '3' }))).toEqual(['Cara Ng'])
  })
})

describe('sortStudentRows', () => {
  const rows = rowsFor([
    student(1, { name: 'Zed', remainingHours: 12, lessonExpiryDate: '2027-05-01' }),
    student(2, { name: 'Amy', remainingHours: 1, lessonExpiryDate: '2026-11-01' }),
    student(3, { name: 'Bob', isActive: false }),
    student(4, { name: 'Cy', studentType: 'trial' }),
  ])
  const ids = (list: typeof rows) => list.map((row) => row.student.id)

  it('puts students who need action first and deactivated ones last', () => {
    expect(ids(sortStudentRows(rows, 'attention'))).toEqual([2, 1, 4, 3])
  })

  it('sorts by name, by when the package ends and by classes left', () => {
    expect(ids(sortStudentRows(rows, 'name'))).toEqual([2, 3, 4, 1])
    expect(ids(sortStudentRows(rows, 'ends'))).toEqual([2, 3, 1, 4])
    expect(ids(sortStudentRows(rows, 'left'))).toEqual([2, 3, 1, 4])
  })
})
