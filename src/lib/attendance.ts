import { createEmptyAttendanceReviewForm } from './mappers'
import { needsRemark, type ReviewMetric } from './reviewCriteria'
import type { AttendanceReviewFormState, AttendanceStatus } from '../types/domain'

export type AttendanceStatusPayload = {
  student_id: number
  status: AttendanceStatus
}

export type AttendanceReviewPayload = {
  student_id: number
  // This student's own note on the lesson.
  lessonRemark: string | null
  scores: Array<{ criterion_id: number; score: number; remark: string | null }>
}

export type AttendanceSubmissionResult =
  | { ok: true; payload: AttendanceStatusPayload[]; reviewPayload: AttendanceReviewPayload[] }
  | { ok: false; error: string }

/**
 * Validates every present student has a full review against the school's
 * criteria (a remark is mandatory when a score is at or below the criterion's
 * threshold, mirroring the rule enforced server-side by the
 * `submit_lesson_attendance` Postgres function), then builds the RPC payload.
 * Pure and side-effect free so the validation rule can be unit tested without
 * mounting the attendance modal or hitting Supabase.
 */
export function buildAttendanceSubmission(
  rosterIds: number[],
  attendanceStatuses: Record<number, AttendanceStatus>,
  attendanceReviews: Record<number, AttendanceReviewFormState>,
  studentNameById: Map<number, string>,
  metrics: ReviewMetric[],
): AttendanceSubmissionResult {
  const payload: AttendanceStatusPayload[] = rosterIds.map((studentId) => ({
    student_id: studentId,
    status: attendanceStatuses[studentId] ?? 'present',
  }))
  const reviewPayload: AttendanceReviewPayload[] = []

  for (const studentId of rosterIds) {
    const status = attendanceStatuses[studentId] ?? 'present'
    if (status !== 'present') {
      continue
    }

    const reviewForm = attendanceReviews[studentId] ?? createEmptyAttendanceReviewForm()
    const scores: AttendanceReviewPayload['scores'] = []

    for (const metric of metrics) {
      const score = reviewForm.scores[metric.id] ?? null
      if (score === null) {
        return {
          ok: false,
          error: `Please rate ${metric.label} for every present student.`,
        }
      }

      const remark = (reviewForm.remarks[metric.id] ?? '').trim()
      if (needsRemark(metric, score) && !remark) {
        const studentName = studentNameById.get(studentId) ?? 'this student'
        return {
          ok: false,
          error: `${studentName}: ${metric.label} requires a remark when the score is ${lowScoreText(metric)}.`,
        }
      }

      scores.push({ criterion_id: metric.id, score, remark: remark || null })
    }

    reviewPayload.push({
      student_id: studentId,
      lessonRemark: reviewForm.lessonRemark.trim() || null,
      scores,
    })
  }

  return { ok: true, payload, reviewPayload }
}

// "1 or 2" for the usual threshold of 2, "1" for 1, "1-3" for 3, ...
export function lowScoreText(metric: ReviewMetric) {
  const top = metric.remarkRequiredAtOrBelow
  if (top <= 1) return '1'
  if (top === 2) return '1 or 2'
  return `1-${top}`
}

// A review is complete when every criterion is rated and every low score has
// its remark. The same rule buildAttendanceSubmission enforces.
export function isReviewComplete(reviewForm: AttendanceReviewFormState | undefined, metrics: ReviewMetric[]) {
  const form = reviewForm ?? createEmptyAttendanceReviewForm()
  return metrics.every((metric) => {
    const score = form.scores[metric.id] ?? null
    return score !== null && (!needsRemark(metric, score) || (form.remarks[metric.id] ?? '').trim() !== '')
  })
}

export function countRatedMetrics(reviewForm: AttendanceReviewFormState | undefined, metrics: ReviewMetric[]) {
  const form = reviewForm ?? createEmptyAttendanceReviewForm()
  return metrics.filter((metric) => (form.scores[metric.id] ?? null) !== null).length
}

// Who is present, who has a finished review, and who still needs one.
export function getReviewProgress(
  rosterIds: number[],
  attendanceStatuses: Record<number, AttendanceStatus>,
  attendanceReviews: Record<number, AttendanceReviewFormState>,
  metrics: ReviewMetric[],
) {
  const presentIds = rosterIds.filter((id) => (attendanceStatuses[id] ?? 'present') === 'present')
  const doneIds = presentIds.filter((id) => isReviewComplete(attendanceReviews[id], metrics))
  const pendingIds = presentIds.filter((id) => !doneIds.includes(id))
  return { presentIds, doneIds, pendingIds, awayCount: rosterIds.length - presentIds.length }
}
