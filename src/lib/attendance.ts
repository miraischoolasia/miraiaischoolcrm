import { createEmptyAttendanceReviewForm } from './mappers'
import { performanceMetricDefinitions } from './constants'
import type {
  AttendanceReviewFormState,
  AttendanceStatus,
  ReviewRemarkField,
  ReviewScoreField,
} from '../types/domain'

export type AttendanceStatusPayload = {
  student_id: number
  status: AttendanceStatus
}

export type AttendanceReviewPayload = {
  student_id: number
} & Record<ReviewScoreField, number> &
  Record<ReviewRemarkField, string | null>

export type AttendanceSubmissionResult =
  | { ok: true; payload: AttendanceStatusPayload[]; reviewPayload: AttendanceReviewPayload[] }
  | { ok: false; error: string }

/**
 * Validates every present student has a full performance review (a remark is
 * mandatory when a score is 1 or 2, mirroring the same rule enforced server-side
 * by the `submit_lesson_attendance` Postgres function), then builds the RPC
 * payload. Pure and side-effect free so the validation rule can be unit tested
 * without mounting the attendance modal or hitting Supabase.
 */
export function buildAttendanceSubmission(
  rosterIds: number[],
  attendanceStatuses: Record<number, AttendanceStatus>,
  attendanceReviews: Record<number, AttendanceReviewFormState>,
  studentNameById: Map<number, string>,
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

    for (const metric of performanceMetricDefinitions) {
      const score = reviewForm[metric.scoreField]
      if (score === null) {
        return {
          ok: false,
          error: `Please rate ${metric.label} for every present student.`,
        }
      }

      if (score <= 2 && !reviewForm[metric.remarkField].trim()) {
        const studentName = studentNameById.get(studentId) ?? 'this student'
        return {
          ok: false,
          error: `${studentName}: ${metric.label} requires a remark when the score is 1 or 2.`,
        }
      }
    }

    reviewPayload.push({
      student_id: studentId,
      logicalThinkingScore: reviewForm.logicalThinkingScore ?? 3,
      logicalThinkingRemark: reviewForm.logicalThinkingRemark.trim() || null,
      codingCreativityScore: reviewForm.codingCreativityScore ?? 3,
      codingCreativityRemark: reviewForm.codingCreativityRemark.trim() || null,
      problemSolvingScore: reviewForm.problemSolvingScore ?? 3,
      problemSolvingRemark: reviewForm.problemSolvingRemark.trim() || null,
      expressivenessScore: reviewForm.expressivenessScore ?? 3,
      expressivenessRemark: reviewForm.expressivenessRemark.trim() || null,
      sustainedFocusScore: reviewForm.sustainedFocusScore ?? 3,
      sustainedFocusRemark: reviewForm.sustainedFocusRemark.trim() || null,
    })
  }

  return { ok: true, payload, reviewPayload }
}
