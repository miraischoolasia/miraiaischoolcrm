import { useMemo } from 'react'
import { X } from '@phosphor-icons/react'
import { formatDate } from '../domain/studentStatus'
import { getLatestLessonLogMap } from '../lib/mappers'
import { performanceMetricDefinitions } from '../lib/constants'
import { weekdayLabels } from '../lib/schedule'
import { ModalShell } from './ModalShell'
import { PerformanceRadarChart } from './PerformanceRadarChart'
import type {
  Classroom,
  LessonLogStudentReview,
  LessonLogSummary,
  ReviewScoreField,
  Schedule,
  Student,
  Teacher,
} from '../types/domain'

type StudentDetailModalProps = {
  classrooms: Classroom[]
  student: Student
  lessonLogs: LessonLogSummary[]
  lessonReviews: LessonLogStudentReview[]
  onClose: () => void
  schedules: Schedule[]
  teacherMap: Map<number, Teacher>
}

export function StudentDetailModal({
  classrooms,
  student,
  lessonLogs,
  lessonReviews,
  onClose,
  schedules,
  teacherMap,
}: StudentDetailModalProps) {
  const latestLessonLogIds = useMemo(() => {
    return new Set(
      Array.from(getLatestLessonLogMap(lessonLogs).values()).map((log) => log.id),
    )
  }, [lessonLogs])

  const latestReviewEntries = useMemo(() => {
    const scheduleMap = new Map(schedules.map((schedule) => [schedule.id, schedule]))

    return lessonReviews
      .filter(
        (review) =>
          review.studentId === student.id && latestLessonLogIds.has(review.lessonLogId),
      )
      .map((review) => {
        const log = lessonLogs.find((entry) => entry.id === review.lessonLogId)
        const schedule = log ? scheduleMap.get(log.scheduleId) : null
        return {
          review,
          log,
          schedule,
        }
      })
      .filter(
        (entry): entry is {
          review: LessonLogStudentReview
          log: LessonLogSummary
          schedule: Schedule | null
        } => Boolean(entry.log),
      )
      .sort((left, right) => {
        const rightDate = `${right.log.lessonDate}-${right.log.revisionNumber}`
        const leftDate = `${left.log.lessonDate}-${left.log.revisionNumber}`
        return rightDate.localeCompare(leftDate)
      })
  }, [latestLessonLogIds, lessonLogs, lessonReviews, schedules, student.id])

  const metricAverages = useMemo(() => {
    const result = {
      logicalThinkingScore: 0,
      codingCreativityScore: 0,
      problemSolvingScore: 0,
      expressivenessScore: 0,
      sustainedFocusScore: 0,
    } satisfies Record<ReviewScoreField, number>

    if (latestReviewEntries.length === 0) {
      return result
    }

    for (const metric of performanceMetricDefinitions) {
      const values = latestReviewEntries
        .map((entry) => entry.review[metric.scoreField])
        .filter((value): value is number => value !== null)

      result[metric.scoreField] =
        values.length > 0
          ? Number(
              (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1),
            )
          : 0
    }

    return result
  }, [latestReviewEntries])

  const assignedClassroom =
    classrooms.find((classroom) => classroom.id === student.classroomId) ?? null
  const classroomSchedules = useMemo(() => {
    return schedules.filter(
      (schedule) =>
        schedule.status === 'active' &&
        schedule.eventType === 'regular' &&
        schedule.classroomId === student.classroomId,
    )
  }, [schedules, student.classroomId])

  return (
    <ModalShell maxWidth="760" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">
              Student Performance Detail
            </div>
            <h2 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
              {student.name}
              {student.studentType === 'trial' && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                  Trial
                </span>
              )}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Student ID #{String(student.id).padStart(3, '0')} - recent class reviews and five-metric performance profile.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div data-modal-body className="max-h-[82vh] space-y-6 overflow-y-auto px-6 py-6 sm:px-8">
        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Student Snapshot
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-sm text-slate-500">Remaining Classes</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {student.remainingHours}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-500">Membership Status</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {student.isActive ? 'Active' : 'Deactivated'}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-500">Assigned Teacher</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {student.teacherId
                    ? teacherMap.get(student.teacherId)?.fullName ?? 'Unassigned'
                    : 'Unassigned'}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-500">Lesson Expiry</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {formatDate(student.lessonExpiryDate)}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-500">Main Classroom</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {assignedClassroom?.name ?? 'Unassigned'}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {assignedClassroom && (
                <span
                  key={assignedClassroom.id}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700"
                >
                  {assignedClassroom.ageGroup} / {assignedClassroom.programLevel}
                </span>
              )}
              {classroomSchedules.map((schedule) => (
                <span
                  key={schedule.id}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700"
                >
                  {weekdayLabels[schedule.dayOfWeek ?? 0]} {schedule.startTime}-{schedule.endTime}
                </span>
              ))}
              {!assignedClassroom && (
                <span className="text-sm text-slate-500">
                  No regular classroom assigned yet.
                </span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Five-Metric Radar
            </div>
            <div className="mt-3">
              <PerformanceRadarChart averages={metricAverages} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {performanceMetricDefinitions.map((metric) => (
                <div
                  key={metric.key}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
                >
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {metric.shortLabel}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {metricAverages[metric.scoreField].toFixed(1)} / 5
                  </div>
                  <div className="mt-1 text-sm text-slate-500">{metric.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Recent Lesson Reviews
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Latest revision only. Low-score remarks remain visible for follow-up.
            </p>
          </div>

          <div className="space-y-4 p-5">
            {latestReviewEntries.map(({ review, log, schedule }) => (
              <div
                key={review.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-base font-semibold text-slate-900">
                      {schedule?.title ?? 'Unknown Class'}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {formatDate(log.lessonDate)} -{' '}
                      {teacherMap.get(log.teacherId)?.fullName ?? 'Unknown Teacher'} - Revision{' '}
                      {log.revisionNumber}
                    </div>
                    {log.lessonRemark && (
                      <div className="mt-2 text-sm text-slate-600">
                        Lesson Remark: {log.lessonRemark}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {performanceMetricDefinitions.map((metric) => {
                    const score = review[metric.scoreField]
                    const remark = review[metric.remarkField]
                    return (
                      <div
                        key={`${review.id}-${metric.key}`}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {metric.label}
                            </div>
                            <div className="mt-1 text-lg font-semibold text-slate-900">
                              {score ?? '-'} / 5
                            </div>
                          </div>
                          <div className="text-lg text-amber-400">
                            {'★'.repeat(score ?? 0)}
                            <span className="text-slate-200">
                              {'★'.repeat(5 - (score ?? 0))}
                            </span>
                          </div>
                        </div>
                        {remark && (
                          <div className="mt-2 text-sm text-slate-600">
                            Remark: {remark}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {latestReviewEntries.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-14 text-center text-sm text-slate-500">
                No performance reviews have been submitted for this student yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </ModalShell>
  )
}
