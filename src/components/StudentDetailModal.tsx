import { useMemo, useState } from 'react'
import { PencilSimple, X } from '@phosphor-icons/react'
import { formatDate, getDateMeta, getTodayString } from '../domain/studentStatus'
import { getLatestLessonLogMap } from '../lib/mappers'
import { performanceMetricDefinitions } from '../lib/constants'
import { weekdayLabels } from '../lib/schedule'
import { buildPathway } from '../lib/pathway'
import { getCurrentClassPeriod } from '../lib/roster'
import { ExpiryCell } from './ExpiryCell'
import { ModalShell } from './ModalShell'
import { PathwaySection } from './PathwaySection'
import { PerformanceRadarChart } from './PerformanceRadarChart'
import type {
  Classroom,
  LessonLogStudentReview,
  LessonLogSummary,
  MakeupPlan,
  ReviewScoreField,
  Schedule,
  Student,
  Teacher,
  Package,
  StudentEnrollment,
} from '../types/domain'

type StudentDetailModalProps = {
  classrooms: Classroom[]
  student: Student
  lessonLogs: LessonLogSummary[]
  lessonReviews: LessonLogStudentReview[]
  onClose: () => void
  schedules: Schedule[]
  teacherMap: Map<number, Teacher>
  // Trial-type student rows from this student's trial bookings (linked via
  // the lead they were converted from), so the trial reviews show here too.
  trialStudentIds?: number[]
  // This student's make-up plans plus whole-class ones for their classroom.
  makeupPlans?: MakeupPlan[]
  onArrangeMakeup?: () => void
  onEditMakeup?: (planId: number) => void
  // Left out when the account may not edit students.
  onEdit?: () => void
  // Package history, newest first, and the packages to name them.
  enrollments?: StudentEnrollment[]
  packages?: Package[]
  // Fixes a package picked by mistake; left out without Students edit.
  onChangePackage?: () => void
  // Corrects the day the student started in their class (null = since the
  // class began). Resolves to an error message, or null when saved. Left
  // out without Students edit.
  onSetClassStart?: (startDate: string | null) => Promise<string | null>
}

export function StudentDetailModal({
  classrooms,
  student,
  lessonLogs,
  lessonReviews,
  onClose,
  schedules,
  teacherMap,
  trialStudentIds = [],
  makeupPlans = [],
  onArrangeMakeup,
  onEditMakeup,
  onEdit,
  enrollments = [],
  packages = [],
  onChangePackage,
  onSetClassStart,
}: StudentDetailModalProps) {
  const isPreviewStudent = student.studentType === 'preview'
  const latestLessonLogIds = useMemo(() => {
    return new Set(
      Array.from(getLatestLessonLogMap(lessonLogs).values()).map((log) => log.id),
    )
  }, [lessonLogs])

  const latestReviewEntries = useMemo(() => {
    const scheduleMap = new Map(schedules.map((schedule) => [schedule.id, schedule]))
    const trialIds = new Set(trialStudentIds)

    return lessonReviews
      .filter(
        (review) =>
          (review.studentId === student.id || trialIds.has(review.studentId)) &&
          latestLessonLogIds.has(review.lessonLogId),
      )
      .map((review) => {
        const log = lessonLogs.find((entry) => entry.id === review.lessonLogId)
        const schedule = log ? scheduleMap.get(log.scheduleId) : null
        return {
          review,
          log,
          schedule,
          isTrial: student.studentType === 'trial' || trialIds.has(review.studentId),
        }
      })
      .filter(
        (entry): entry is {
          review: LessonLogStudentReview
          log: LessonLogSummary
          schedule: Schedule | null
          isTrial: boolean
        } => Boolean(entry.log),
      )
      .sort((left, right) => {
        const rightDate = `${right.log.lessonDate}-${right.log.revisionNumber}`
        const leftDate = `${left.log.lessonDate}-${left.log.revisionNumber}`
        return rightDate.localeCompare(leftDate)
      })
  }, [
    latestLessonLogIds,
    lessonLogs,
    lessonReviews,
    schedules,
    student.id,
    student.studentType,
    trialStudentIds,
  ])

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

  const pathwayStages = useMemo(
    () =>
      buildPathway(
        latestReviewEntries.map(({ review, log, isTrial }) => ({
          lessonDate: log.lessonDate,
          revisionNumber: log.revisionNumber,
          isTrial,
          scores: {
            logicalThinkingScore: review.logicalThinkingScore,
            codingCreativityScore: review.codingCreativityScore,
            problemSolvingScore: review.problemSolvingScore,
            expressivenessScore: review.expressivenessScore,
            sustainedFocusScore: review.sustainedFocusScore,
          },
          remarks: {
            logicalThinkingRemark: review.logicalThinkingRemark,
            codingCreativityRemark: review.codingCreativityRemark,
            problemSolvingRemark: review.problemSolvingRemark,
            expressivenessRemark: review.expressivenessRemark,
            sustainedFocusRemark: review.sustainedFocusRemark,
          },
        })),
      ),
    [latestReviewEntries],
  )

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

  const currentPackage = packages.find((pkg) => pkg.id === student.packageId) ?? null
  // Classes the student has left, most recent first.
  const earlierClasses = (student.classPeriods ?? [])
    .filter((period) => period.endDate !== null)
    .sort((a, b) => b.endDate!.localeCompare(a.endDate!))

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
              {student.studentType !== 'regular' && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                  {isPreviewStudent ? 'Preview' : 'Trial'}
                </span>
              )}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Student ID #{String(student.id).padStart(3, '0')}
              {isPreviewStudent
                ? ' - preview class contact profile.'
                : ' - recent class reviews and five-metric performance profile.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <PencilSimple size={16} aria-hidden="true" />
                Edit
              </button>
            )}
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
      </div>

      <div data-modal-body className="max-h-[82vh] space-y-6 overflow-y-auto px-6 py-6 sm:px-8">
        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Student Snapshot
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-sm text-slate-500">
                  {isPreviewStudent ? 'Phone Number' : 'Remaining Classes'}
                </div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {isPreviewStudent ? student.phone ?? '-' : student.remainingHours}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-500">Membership Status</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {student.isActive ? 'Active' : 'Deactivated'}
                </div>
              </div>
              {!isPreviewStudent && (
              <div>
                <div className="text-sm text-slate-500">Assigned Teacher</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {student.teacherId
                    ? teacherMap.get(student.teacherId)?.fullName ?? 'Unassigned'
                    : 'Unassigned'}
                </div>
              </div>
              )}
              {!isPreviewStudent && (
              <div>
                <div className="text-sm text-slate-500">Lesson Expiry</div>
                <div className="mt-1 text-lg">
                  <ExpiryCell
                    date={student.lessonExpiryDate}
                    meta={getDateMeta(student.lessonExpiryDate, getTodayString())}
                  />
                </div>
              </div>
              )}
              {!isPreviewStudent && (
              <div>
                <div className="text-sm text-slate-500">Mirai Club Expiry</div>
                <div className="mt-1 text-lg">
                  {currentPackage && !currentPackage.includesFees ? (
                    <span className="text-sm text-slate-400">Not in this package</span>
                  ) : (
                    <ExpiryCell
                      date={student.miraiClubExpiryDate}
                      meta={getDateMeta(student.miraiClubExpiryDate, getTodayString())}
                    />
                  )}
                </div>
              </div>
              )}
              {!isPreviewStudent && (
              <div>
                <div className="text-sm text-slate-500">Main Classroom</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {assignedClassroom?.name ?? 'Unassigned'}
                </div>
              </div>
              )}
              {!isPreviewStudent && assignedClassroom && (
                <ClassStartField student={student} onSave={onSetClassStart} />
              )}
            </div>

            {!isPreviewStudent && earlierClasses.length > 0 && (
              <div className="mt-4 text-sm text-slate-500">
                Earlier:{' '}
                {earlierClasses
                  .map(
                    (period) =>
                      `${classrooms.find((classroom) => classroom.id === period.classroomId)?.name ?? 'A class'} until ${formatDate(period.endDate!)}`,
                  )
                  .join(' · ')}
              </div>
            )}

            {!isPreviewStudent && (
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
            )}
          </div>

          {!isPreviewStudent && (
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
          )}
        </section>

        {student.studentType === 'regular' && (student.packageId || enrollments.length > 0) && (
          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Packages</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Now on{' '}
                  <span className="font-semibold text-[#be185d]">
                    {packages.find((pkg) => pkg.id === student.packageId)?.name ?? 'no package'}
                  </span>
                  . Every sign-up and renewal with a package is listed here.
                </p>
              </div>
              {onChangePackage && enrollments.length > 0 && (
                <button
                  type="button"
                  onClick={onChangePackage}
                  className="shrink-0 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Change Package
                </button>
              )}
            </div>
            <ul className="divide-y divide-slate-200">
              {enrollments.length === 0 && (
                <li className="px-5 py-3 text-sm text-slate-500">No package sign-ups recorded yet.</li>
              )}
              {enrollments.map((enrollment) => (
                <li
                  key={enrollment.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
                >
                  <span className="font-semibold text-slate-900">
                    {packages.find((pkg) => pkg.id === enrollment.packageId)?.name ?? 'Package'}
                  </span>
                  <span className="text-slate-500">
                    {formatDate(enrollment.startDate)} - {formatDate(enrollment.endDate)} ·{' '}
                    {enrollment.classCount} classes
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(makeupPlans.length > 0 || onArrangeMakeup) && (
          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Make-up Records</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Missed classes made up with extra minutes. Records only - classes
                  remaining are not changed.
                </p>
              </div>
              {onArrangeMakeup && (
                <button
                  type="button"
                  onClick={onArrangeMakeup}
                  className="shrink-0 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
                >
                  Arrange Make-up
                </button>
              )}
            </div>
            <div className="space-y-3 p-5">
              {makeupPlans.length === 0 && (
                <div className="text-sm text-slate-500">No make-ups recorded.</div>
              )}
              {makeupPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="text-sm text-slate-600">
                    <div className="font-semibold text-slate-900">
                      Missed {formatDate(plan.missedDate)} · {plan.missedMinutes} min ·{' '}
                      {plan.studentId === null ? 'Whole class' : 'This student'}
                    </div>
                    <div className="mt-1">
                      {plan.sessions
                        .map(
                          (session) =>
                            `${formatDate(session.sessionDate)} +${session.extraMinutes} min`,
                        )
                        .join(', ')}
                    </div>
                    {plan.notes && <div className="mt-1 text-slate-500">{plan.notes}</div>}
                  </div>
                  {onEditMakeup && (
                    <button
                      type="button"
                      onClick={() => onEditMakeup(plan.id)}
                      className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-white"
                    >
                      Edit
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {!isPreviewStudent && (
          <PathwaySection studentName={student.name} stages={pathwayStages} />
        )}

        {!isPreviewStudent && (
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
            {latestReviewEntries.map(({ review, log, schedule, isTrial }) => (
              <div
                key={review.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
                      {schedule?.title ?? 'Unknown Class'}
                      {isTrial && (
                        <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700">
                          Trial Class
                        </span>
                      )}
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
        )}
      </div>
    </ModalShell>
  )
}

// The day the student started in their current class: they are only in the
// class's lessons from then on.
function ClassStartField({
  student,
  onSave,
}: {
  student: Student
  onSave?: (startDate: string | null) => Promise<string | null>
}) {
  const period = getCurrentClassPeriod(student)
  const [draft, setDraft] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Before the class history exists there is nothing to show.
  if (!period) {
    return null
  }

  async function save(startDate: string | null) {
    if (!onSave) {
      return
    }
    setIsSaving(true)
    setError(null)
    const message = await onSave(startDate)
    setIsSaving(false)
    if (message) {
      setError(message)
      return
    }
    setDraft(null)
  }

  return (
    <div>
      <div className="text-sm text-slate-500">In This Class Since</div>
      {draft === null ? (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-lg font-semibold text-slate-900">
            {period.startDate ? formatDate(period.startDate) : 'The class began'}
          </span>
          {onSave && (
            <button
              type="button"
              onClick={() => {
                setError(null)
                setDraft(period.startDate ?? getTodayString())
              }}
              aria-label="Change the day they joined"
              className="rounded-lg p-1 text-slate-500 transition hover:bg-white hover:text-slate-700"
            >
              <PencilSimple size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      ) : (
        <div className="mt-1 space-y-2">
          <input
            type="date"
            aria-label="Joined the class on"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97]"
          />
          <div className="flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              disabled={!draft || isSaving}
              onClick={() => void save(draft)}
              className="rounded-lg bg-[#fc0c97] px-3 py-1.5 font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void save(null)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Since the class began
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => setDraft(null)}
              className="rounded-lg px-3 py-1.5 font-semibold text-slate-500 transition hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
