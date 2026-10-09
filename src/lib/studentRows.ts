import {
  getAttentionRank,
  getStudentIssues,
  getStudentStatus,
  type StudentIssue,
} from '../domain/studentStatus'
import { getStudentKind, type StudentKind } from './studentLink'
import type { StudentParent } from './studentParents'
import { weekdayLabels } from './schedule'
import type { Classroom, FilterKey, Package, Schedule, Student, Teacher, TrialBooking } from '../types/domain'

export type StudentSort = 'attention' | 'name' | 'ends' | 'left'

export type StudentRow = {
  student: Student
  pkg: Package | null
  kind: StudentKind
  status: ReturnType<typeof getStudentStatus>
  issues: StudentIssue[]
  needsFollowUp: boolean
  rank: number
  classroom: Classroom | null
  // "Wed 16:00-17:30", the first weekly class of the student's classroom.
  slot: string | null
  teacherName: string | null
  parent: StudentParent | null
  // The HOA class a trial-slot student was booked into.
  booking: TrialBooking | null
}

export type StudentRowSources = {
  students: Student[]
  packages: Package[]
  classrooms: Classroom[]
  schedules: Schedule[]
  teacherMap: Map<number, Teacher>
  trialBookings: TrialBooking[]
  parents: Map<number, StudentParent>
  todayString: string
}

export function buildStudentRows({
  students,
  packages,
  classrooms,
  schedules,
  teacherMap,
  trialBookings,
  parents,
  todayString,
}: StudentRowSources): StudentRow[] {
  const packageById = new Map(packages.map((pkg) => [pkg.id, pkg]))
  const classroomById = new Map(classrooms.map((classroom) => [classroom.id, classroom]))
  const bookingByStudent = new Map<number, TrialBooking>()
  for (const booking of trialBookings) {
    const current = booking.studentId === null ? undefined : bookingByStudent.get(booking.studentId)
    if (booking.studentId !== null && (!current || booking.bookingDate > current.bookingDate)) {
      bookingByStudent.set(booking.studentId, booking)
    }
  }
  const slotByClassroom = new Map<number, Schedule>()
  for (const schedule of [...schedules].sort((a, b) => (a.dayOfWeek ?? 7) - (b.dayOfWeek ?? 7))) {
    if (
      schedule.classroomId !== null &&
      schedule.status === 'active' &&
      schedule.eventType === 'regular' &&
      !slotByClassroom.has(schedule.classroomId)
    ) {
      slotByClassroom.set(schedule.classroomId, schedule)
    }
  }

  return students.map((student) => {
    const pkg = student.packageId ? packageById.get(student.packageId) ?? null : null
    const status = getStudentStatus(
      { ...student, feesApply: pkg ? pkg.includesFees : true },
      todayString,
    )
    const issues = getStudentIssues(student, status)
    const classroom = student.classroomId ? classroomById.get(student.classroomId) ?? null : null
    const schedule = classroom ? slotByClassroom.get(classroom.id) ?? null : null
    const teacherId = student.teacherId ?? schedule?.teacherId ?? classroom?.teacherId ?? null

    return {
      student,
      pkg,
      kind: getStudentKind(student, packages),
      status,
      issues,
      needsFollowUp: student.isActive && issues.length > 0,
      rank: getAttentionRank(student.isActive, issues),
      classroom,
      slot:
        schedule && schedule.dayOfWeek !== null
          ? `${weekdayLabels[schedule.dayOfWeek].slice(0, 3)} ${schedule.startTime}-${schedule.endTime}`
          : null,
      teacherName: teacherId ? teacherMap.get(teacherId)?.fullName ?? null : null,
      parent: parents.get(student.id) ?? null,
      booking: bookingByStudent.get(student.id) ?? null,
    }
  })
}

export function filterStudentRows(
  rows: StudentRow[],
  { type, followUpOnly, search }: { type: FilterKey; followUpOnly: boolean; search: string },
) {
  const query = search.trim().toLowerCase()

  return rows.filter((row) => {
    if (type !== 'all' && row.kind !== type) {
      return false
    }
    if (followUpOnly && !row.needsFollowUp) {
      return false
    }
    if (!query) {
      return true
    }
    const haystack = [
      row.student.name,
      String(row.student.id),
      `#${String(row.student.id).padStart(3, '0')}`,
      row.parent?.name,
      row.parent?.phone,
      row.classroom?.name,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(query)
  })
}

const NO_DATE = '9999-12-31'

// Always breaks ties by ID, so the order never jumps between renders.
export function sortStudentRows(rows: StudentRow[], sort: StudentSort) {
  const compare: Record<StudentSort, (a: StudentRow, b: StudentRow) => number> = {
    attention: (a, b) => a.rank - b.rank,
    name: (a, b) => a.student.name.localeCompare(b.student.name),
    // HOA and Preview rows have no package dates, so they go last.
    ends: (a, b) =>
      (a.kind === 'hoa' ? NO_DATE : a.student.lessonExpiryDate).localeCompare(
        b.kind === 'hoa' ? NO_DATE : b.student.lessonExpiryDate,
      ),
    left: (a, b) =>
      (a.kind === 'hoa' ? Infinity : a.student.remainingHours) -
      (b.kind === 'hoa' ? Infinity : b.student.remainingHours),
  }
  return [...rows].sort((a, b) => compare[sort](a, b) || a.student.id - b.student.id)
}
