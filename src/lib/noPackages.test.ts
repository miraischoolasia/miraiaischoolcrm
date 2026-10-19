import { describe, expect, it, vi } from 'vitest'
import type { Package, Student } from '../types/domain'

// A school that does not give every student a package (EduHero: the students brought over from the recordings
// site have none, with 0 classes and a far-off 2099-12-31 end): they are not chased for classes or an end date.
// A student there who does have a package still is.
vi.mock('./brand', () => ({
  brand: {
    name: 'EduHero', clubName: 'Membership', usesFees: false, usesPackages: false,
    usesMiraiArt: false, logo: null, favicon: null, company: '',
  },
}))

const { getStudentStatus, getStudentIssues } = await import('../domain/studentStatus')
const { buildStudentRows, sortStudentRows } = await import('./studentRows')
const { pickFollowUpStudents } = await import('./adminToday')

const today = '2026-10-19'

function student(id: number, overrides: Partial<Student> = {}): Student {
  return {
    id, name: `Student ${id}`, isActive: true, teacherId: null, classroomId: 5, phone: null, age: null,
    remainingHours: 0, lessonExpiryDate: '2099-12-31', accountFeeExpiryDate: '2099-12-31',
    miraiClubExpiryDate: '2099-12-31', notes: '', studentType: 'regular', packageId: null, ...overrides,
  }
}

const packages: Package[] = [
  { id: 2, name: '6 Months', kind: 'regular', classCount: 24, durationMonths: 6, includesFees: false, isActive: true, sortOrder: 1 },
]

function rowsFor(students: Student[]) {
  return buildStudentRows({
    students, packages, classrooms: [], schedules: [], teacherMap: new Map(), trialBookings: [],
    parents: new Map(), todayString: today,
  })
}

describe('a school that does not give every student a package', () => {
  it('does not count a student with no package as needing follow-up', () => {
    const status = getStudentStatus(student(1), today)

    expect(status.tracksClasses).toBe(false)
    expect(status.hoursLow).toBe(false)
    expect(status.lessonExpired).toBe(false)
    expect(status.tags.map((tag) => tag.label)).toEqual(['Normal'])
    expect(getStudentIssues(student(1), status)).toEqual([])
  })

  it('not even with an end date long past', () => {
    const status = getStudentStatus(student(1, { lessonExpiryDate: '2020-01-01' }), today)

    expect(status.lessonExpired).toBe(false)
    expect(getStudentIssues(student(1), status)).toEqual([])
  })

  it('leaves the Today and Student List counts at zero for thousands of them', () => {
    const rows = rowsFor(Array.from({ length: 4643 }, (_, index) => student(index + 1)))

    expect(rows.filter((row) => row.needsFollowUp)).toHaveLength(0)
    expect(pickFollowUpStudents(rows)).toMatchObject({ total: 0, critical: 0 })
  })

  it('still chases a student who has a package', () => {
    const rows = rowsFor([student(1), student(2, { packageId: 2, remainingHours: 0, lessonExpiryDate: '2027-03-01' })])

    expect(rows.map((row) => row.needsFollowUp)).toEqual([false, true])
    expect(rows[1].issues[0].label).toBe('No classes left')
    expect(pickFollowUpStudents(rows)).toMatchObject({ total: 1, critical: 1 })
  })

  it('still flags a deactivated student', () => {
    const [row] = rowsFor([student(1, { isActive: false })])

    expect(row.issues.map((issue) => issue.label)).toEqual(['Deactivated'])
  })

  it('sorts students with nothing to count last for "fewest classes left" and "ends soonest"', () => {
    const rows = rowsFor([student(1), student(2, { packageId: 2, remainingHours: 3, lessonExpiryDate: '2027-03-01' })])

    expect(sortStudentRows(rows, 'left').map((row) => row.student.id)).toEqual([2, 1])
    expect(sortStudentRows(rows, 'ends').map((row) => row.student.id)).toEqual([2, 1])
  })
})
