import { performanceMetricDefinitions } from './constants'
import { getLatestLessonLogMap } from './mappers'
import type {
  AttendanceStatus,
  LessonLogStudentReview,
  LessonLogSummary,
  Schedule,
} from '../types/domain'

// Students who were marked present in a lesson, as far as the reviews show: a
// present student always has a review on the latest revision of that lesson.
export function getAttendedStudentIds(
  lessonLogs: LessonLogSummary[],
  lessonReviews: LessonLogStudentReview[],
) {
  const latestLogIds = new Set(
    Array.from(getLatestLessonLogMap(lessonLogs).values()).map((log) => log.id),
  )
  return new Set(
    lessonReviews.filter((review) => latestLogIds.has(review.lessonLogId)).map((review) => review.studentId),
  )
}

export type StudentLesson = {
  log: LessonLogSummary
  schedule: Schedule | null
  status: AttendanceStatus
  // Only a present student has a review.
  review: LessonLogStudentReview | null
  isTrial: boolean
  // Mean of the five scores, null without a review.
  average: number | null
}

// Every lesson a student was part of, newest first, from the latest revision
// of each lesson. Attendance says present / absent / leave; a review without
// an attendance row (a trial class of the same child) counts as present.
export function buildStudentLessons({
  studentId,
  studentIsTrial,
  trialStudentIds,
  lessonLogs,
  lessonReviews,
  attendance,
  schedules,
}: {
  studentId: number
  studentIsTrial: boolean
  trialStudentIds: number[]
  lessonLogs: LessonLogSummary[]
  lessonReviews: LessonLogStudentReview[]
  attendance: Array<{ lessonLogId: number; status: AttendanceStatus }>
  schedules: Schedule[]
}): StudentLesson[] {
  const trialIds = new Set(trialStudentIds)
  const scheduleById = new Map(schedules.map((schedule) => [schedule.id, schedule]))
  const statusByLog = new Map(attendance.map((row) => [row.lessonLogId, row.status]))
  const latestLogs = Array.from(getLatestLessonLogMap(lessonLogs).values())

  const lessons: StudentLesson[] = []
  for (const log of latestLogs) {
    const review =
      lessonReviews.find(
        (entry) =>
          entry.lessonLogId === log.id &&
          (entry.studentId === studentId || trialIds.has(entry.studentId)),
      ) ?? null
    const status = statusByLog.get(log.id) ?? (review ? 'present' : null)
    if (!status) {
      continue
    }

    const scores = review
      ? performanceMetricDefinitions
          .map((metric) => review[metric.scoreField])
          .filter((value): value is number => value !== null)
      : []

    lessons.push({
      log,
      schedule: scheduleById.get(log.scheduleId) ?? null,
      status,
      review,
      isTrial: studentIsTrial || (review !== null && trialIds.has(review.studentId)),
      average: scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
    })
  }

  return lessons.sort(
    (a, b) =>
      b.log.lessonDate.localeCompare(a.log.lessonDate) || b.log.revisionNumber - a.log.revisionNumber,
  )
}
