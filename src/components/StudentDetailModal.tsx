import { useMemo, useState, type ReactNode } from 'react'
import { brand } from '../lib/brand'
import { Copy, PencilSimple, X } from '@phosphor-icons/react'
import {
  formatDate,
  getStudentIssues,
  getStudentStatus,
  getTodayString,
  getWorstFee,
} from '../domain/studentStatus'
import { cn } from '../lib/cn'
import { defaultReviewCriteria, getReviewMetrics, labelWithScale, type ReviewMetric } from '../lib/reviewCriteria'
import {
  attendanceColorStyles,
  defaultAttendanceStatuses,
  getStatusOption,
  sortStatuses,
} from '../lib/attendanceStatuses'
import { buildPathway } from '../lib/pathway'
import { getCurrentClassPeriod, getStudentClassIds } from '../lib/roster'
import { studentLabels, useStudentLabelContext } from '../lib/studentLabel'
import { weekdayLabels } from '../lib/schedule'
import { buildStudentLessons, type StudentLesson } from '../lib/studentLessons'
import { ExpiryCell } from './ExpiryCell'
import { ModalShell } from './ModalShell'
import { PathwaySection } from './PathwaySection'
import { PointsCard } from './PointsCard'
import { AiReportCard } from './AiReportCard'
import { AppLoginsCard } from './AppLoginsCard'
import { StudentProgressCard } from './quality/StudentProgressCard'
import { ExtraClassesField } from './ExtraClassesField'
import { MonthPlansCard } from './MonthPlansCard'
import { StudentVideosTab } from './StudentVideosTab'
import type { RewardLevel } from '../lib/rewards'
import { PerformanceRadarChart } from './PerformanceRadarChart'
import { StudentLessonHistory } from './StudentLessonHistory'
import { WhatsAppLink } from './WhatsAppLink'
import type {
  AttendanceStatus,
  AttendanceStatusOption,
  Classroom,
  LessonLogStudentReview,
  LessonLogSummary,
  MakeupPlan,
  Package,
  ReviewCriterion,
  Schedule,
  Student,
  StudentEnrollment,
  Teacher,
} from '../types/domain'

type TabKey = 'overview' | 'progress' | 'lessons' | 'classes' | 'videos' | 'billing'

type StudentDetailModalProps = {
  // 'overlay' when opened from another window (a class's attendance), so the
  // profile sits above it instead of behind it.
  layer?: 'base' | 'overlay'
  classrooms: Classroom[]
  student: Student
  lessonLogs: LessonLogSummary[]
  lessonReviews: LessonLogStudentReview[]
  // The school's review criteria (switched-off ones still show where a
  // lesson was scored on them).
  reviewCriteria?: ReviewCriterion[]
  // The school's attendance statuses, for their names and colours.
  statusOptions?: AttendanceStatusOption[]
  // Reward levels; with them the Progress tab shows the student's points.
  rewardLevels?: RewardLevel[]
  // Students edit: give and redeem points outside a lesson.
  canManagePoints?: boolean
  // Shows the AI analysis card on the Progress tab.
  showAiReport?: boolean
  // Shows the student app logins on the Overview tab (managed with Students edit).
  showAppLogins?: boolean
  // Shows the month's progress card (and the text for the family) at the top of the Progress tab (the Progress Cards tick).
  showProgressCard?: boolean
  onClose: () => void
  schedules: Schedule[]
  teacherMap: Map<number, Teacher>
  // Trial-type student rows from this student's trial bookings (linked via
  // the lead they were converted from), so the trial reviews show here too.
  trialStudentIds?: number[]
  // This student's attendance, so absent and leave lessons are listed too.
  attendance?: Array<{ lessonLogId: number; status: AttendanceStatus }>
  // The parent's name, from the lead this student came through.
  parentName?: string | null
  // This student's make-up plans plus whole-class ones for their classroom.
  makeupPlans?: MakeupPlan[]
  // The student's weekly classes a make-up can be for (a student can take several).
  makeupClasses?: { id: number; name: string }[]
  onArrangeMakeup?: (classroomId: number) => void
  onEditMakeup?: (planId: number) => void
  // One-day seats in another class's lesson (Change class / Replacement), as text lines; the button opens the booking dialog.
  lessonSeatLines?: string[]
  onOpenLessonSeats?: () => void
  // Left out when the account may not edit students.
  onEdit?: () => void
  onRenew?: () => void
  // Package history, newest first, and the packages to name them.
  enrollments?: StudentEnrollment[]
  packages?: Package[]
  // Fixes a package picked by mistake; left out without Students edit.
  onChangePackage?: () => void
  // Corrects the day the student started in their class (null = since the
  // class began). Resolves to an error message, or null when saved. Left
  // out without Students edit.
  onSetClassStart?: (startDate: string | null) => Promise<string | null>
  // The school has class videos: a Videos tab shows what the student watched
  // and which months are open for them (canEditVideoAccess: open and close them).
  showVideos?: boolean
  canEditVideoAccess?: boolean
  // Adding the student to another class, or taking them out of one.
  onAddClass?: (classroomId: number) => Promise<string | null>
  onRemoveClass?: (classroomId: number) => Promise<string | null>
  // The school's own number for the child, when the school uses student codes.
  studentCode?: string | null
  // The school's extra student fields (Chinese name, kind, consultant, second parent phone).
  extraSummary?: React.ReactNode
  // The student's tags (the same tags the leads use), with the way to add and take off.
  tagsSlot?: React.ReactNode
}

const NO_IDS: number[] = []
const NO_ATTENDANCE: Array<{ lessonLogId: number; status: AttendanceStatus }> = []
const NO_PLANS: MakeupPlan[] = []
const NO_ENROLLMENTS: StudentEnrollment[] = []
const NO_PACKAGES: Package[] = []

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

function relativeDays(daysUntil: number) {
  if (daysUntil === 0) {
    return 'today'
  }
  return daysUntil > 0 ? `in ${daysUntil} days` : `${Math.abs(daysUntil)} days ago`
}

export function StudentDetailModal({
  layer = 'base',
  classrooms,
  student,
  lessonLogs,
  lessonReviews,
  reviewCriteria = defaultReviewCriteria,
  statusOptions = defaultAttendanceStatuses,
  rewardLevels,
  canManagePoints = false,
  showAiReport = false,
  showAppLogins = false,
  showProgressCard = false,
  onClose,
  schedules,
  teacherMap,
  trialStudentIds = NO_IDS,
  attendance = NO_ATTENDANCE,
  parentName = null,
  makeupPlans = NO_PLANS,
  makeupClasses = NO_MAKEUP_CLASSES,
  showVideos = false,
  canEditVideoAccess = false,
  onArrangeMakeup,
  onEditMakeup,
  lessonSeatLines = NO_SEAT_LINES,
  onOpenLessonSeats,
  onEdit,
  onRenew,
  enrollments = NO_ENROLLMENTS,
  packages = NO_PACKAGES,
  onChangePackage,
  onSetClassStart,
  onAddClass,
  onRemoveClass,
  studentCode = null,
  extraSummary,
  tagsSlot,
}: StudentDetailModalProps) {
  const [tab, setTab] = useState<TabKey>('overview')
  const [copied, setCopied] = useState(false)
  const labelContext = useStudentLabelContext(classrooms, packages)
  const isPreview = student.studentType === 'preview'
  const isBilled = student.studentType === 'regular'
  const todayString = getTodayString()

  const metrics = useMemo(() => {
    const ids = new Set([student.id, ...trialStudentIds])
    return getReviewMetrics(
      reviewCriteria,
      lessonReviews.filter((review) => ids.has(review.studentId)),
    )
  }, [lessonReviews, reviewCriteria, student.id, trialStudentIds])

  const lessons = useMemo(
    () =>
      buildStudentLessons({
        studentId: student.id,
        studentIsTrial: student.studentType === 'trial',
        trialStudentIds,
        lessonLogs,
        lessonReviews,
        attendance,
        schedules,
        metrics,
      }),
    [attendance, lessonLogs, lessonReviews, metrics, schedules, student.id, student.studentType, trialStudentIds],
  )
  const reviewed = useMemo(
    () => lessons.filter((lesson): lesson is StudentLesson & { review: LessonLogStudentReview } => lesson.review !== null),
    [lessons],
  )

  // By criterion id, on the criterion's own scale; 0 when never scored.
  const metricAverages = useMemo(() => {
    const result: Record<number, number> = {}
    for (const metric of metrics) {
      const values = reviewed
        .map((lesson) => lesson.review.scores[metric.id]?.score ?? null)
        .filter((value): value is number => value !== null)
      result[metric.id] =
        values.length > 0
          ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1))
          : 0
    }
    return result
  }, [metrics, reviewed])

  const pathwayStages = useMemo(
    () =>
      buildPathway(
        reviewed.map(({ review, log, isTrial }) => {
          const scores: Record<number, number | null> = {}
          const remarks: Record<number, string | null> = {}
          for (const [id, entry] of Object.entries(review.scores)) {
            scores[Number(id)] = entry.score
            remarks[Number(id)] = entry.remark
          }
          return {
            lessonDate: log.lessonDate,
            revisionNumber: log.revisionNumber,
            isTrial,
            scores,
            remarks,
          }
        }),
        metrics,
      ),
    [metrics, reviewed],
  )

  const assignedClassroom =
    classrooms.find((classroom) => classroom.id === student.classroomId) ?? null
  const classroomSchedules = useMemo(
    () =>
      schedules.filter(
        (schedule) =>
          schedule.status === 'active' &&
          schedule.eventType === 'regular' &&
          schedule.classroomId === student.classroomId,
      ),
    [schedules, student.classroomId],
  )
  const currentPackage = packages.find((pkg) => pkg.id === student.packageId) ?? null
  const feesApply = currentPackage ? currentPackage.includesFees : true
  const status = getStudentStatus({ ...student, feesApply }, todayString)
  // A school that does not give every student a package renews only those who have one.
  // An HOA student is converted to a regular student instead (the same button opens that).
  const isHoa = student.studentType === 'trial'
  const renew = brand.usesPackages || currentPackage || isHoa ? onRenew : undefined
  const issues = getStudentIssues(student, status)
  const worstFee = getWorstFee(status)
  const teacherName = student.teacherId
    ? teacherMap.get(student.teacherId)?.fullName ?? null
    : classroomSchedules[0]
      ? teacherMap.get(classroomSchedules[0].teacherId)?.fullName ?? null
      : null
  // Classes the student has left, most recent first.
  const earlierClasses = (student.classPeriods ?? [])
    .filter((period) => period.endDate !== null)
    .sort((a, b) => b.endDate!.localeCompare(a.endDate!))

  const tabs: Array<{ key: TabKey; label: string }> = isPreview
    ? [{ key: 'overview', label: 'Overview' }]
    : [
        { key: 'overview', label: 'Overview' },
        { key: 'progress', label: 'Progress' },
        { key: 'lessons', label: 'Lessons' },
        // Each class with its attendance, time in Zoom and answers (the lesson reports' records).
        { key: 'classes', label: 'Class history' },
        ...(showVideos ? [{ key: 'videos' as const, label: 'Videos' }] : []),
        ...(isBilled ? [{ key: 'billing' as const, label: 'Billing' }] : []),
      ]

  async function copyPhone() {
    if (!student.phone) {
      return
    }
    try {
      await navigator.clipboard.writeText(student.phone)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // The number stays on screen to select by hand.
    }
  }

  // What the student is called: the category of the class they are in (the school's own name), else their identity.
  const typeLabels = studentLabels(student, labelContext)

  return (
    <ModalShell placement="right" onClose={onClose} layer={layer}>
      <header className="shrink-0 border-b border-slate-200 bg-white px-5 pt-4 sm:px-6">
        <div className="relative flex flex-wrap items-start gap-x-3 gap-y-2">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#fbcfe8] bg-[#fff1f8] text-sm font-bold text-[#be185d]"
          >
            {initials(student.name)}
          </span>
          <div className="min-w-0 flex-1 basis-40 pr-10 sm:pr-0">
            <h2 className="text-xl font-semibold leading-tight text-slate-900">{student.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-slate-500">
              {typeLabels.map((typeLabel) => (
                <span key={typeLabel} className="rounded-full bg-[#fff1f8] px-2.5 py-0.5 text-xs font-semibold text-[#be185d]">
                  {typeLabel}
                </span>
              ))}
              {studentCode ? <span>{studentCode}</span> : <span>#{String(student.id).padStart(3, '0')}</span>}
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', student.isActive ? 'bg-emerald-500' : 'bg-slate-400')} />
                {student.isActive ? 'Active' : 'Deactivated'}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 max-sm:w-full max-sm:justify-start">
            {renew && !isPreview && (
              <button
                type="button"
                onClick={renew}
                className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
              >
                {isHoa ? 'Convert to Regular' : 'Renew'}
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                aria-label="Edit"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <PencilSimple size={16} aria-hidden="true" />
                <span className="max-sm:hidden">Edit</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50 max-sm:absolute max-sm:right-0 max-sm:top-0"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        {(parentName || student.phone || tagsSlot) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-slate-600">
            {(parentName || student.phone) && <span>{[parentName, student.phone].filter(Boolean).join(' \u00B7 ')}</span>}
            {student.phone && (
              <>
                <button
                  type="button"
                  onClick={() => void copyPhone()}
                  aria-label={copied ? 'Copied' : 'Copy phone number'}
                  title={copied ? 'Copied' : 'Copy phone number'}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                >
                  <Copy size={16} aria-hidden="true" />
                </button>
                <WhatsAppLink phone={student.phone} name={student.name} onOpened={onClose} />
              </>
            )}
            {student.phone && tagsSlot && <span aria-hidden="true" className="mx-1 h-5 w-px bg-slate-200 max-sm:hidden" />}
            {tagsSlot}
          </div>
        )}
        {extraSummary && <div className="mt-2">{extraSummary}</div>}

        <div role="tablist" aria-label="Student sections" className="mt-3 flex gap-6 overflow-x-auto">
          {tabs.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={tab === entry.key}
              onClick={() => setTab(entry.key)}
              className={cn(
                'border-b-2 pb-2.5 text-sm font-semibold transition',
                tab === entry.key
                  ? 'border-[#fc0c97] text-[#be185d]'
                  : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </header>

      <div role="tabpanel" className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-white px-5 py-5 sm:px-6">
        {tab === 'overview' && (
          <>
            <AlertBanner
              student={student}
              issueLabel={issues[0]?.label ?? null}
              tone={issues[0]?.tone ?? null}
              lessonDaysUntil={status.lessonExpiry.daysUntil}
              feeName={worstFee?.name ?? null}
              feeDaysUntil={worstFee?.meta.daysUntil ?? 0}
              onRenew={renew}
            />

            {isPreview && (
              <Card title="Contact">
                <dl className="grid grid-cols-[120px_1fr] gap-2 text-sm">
                  <dt className="text-slate-500">Phone</dt>
                  <dd className="font-semibold text-slate-900">{student.phone ?? '-'}</dd>
                  <dt className="text-slate-500">Type</dt>
                  <dd className="font-semibold text-slate-900">Preview class contact</dd>
                </dl>
              </Card>
            )}

            {!isPreview && (
              <div className="grid gap-3 sm:grid-cols-2">
                {isBilled ? (
                  <>
                    {/* No package at a school that does not use them: no classes or end date to show. */}
                    {status.tracksClasses && (
                    <>
                    <Stat label="Classes left">
                      <div className="text-2xl font-semibold text-slate-900">
                        {student.remainingHours}
                        {currentPackage && (
                          <span className="ml-1.5 text-sm font-medium text-slate-500">
                            of {currentPackage.classCount}
                          </span>
                        )}
                      </div>
                      {currentPackage && currentPackage.classCount > 0 && (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className={cn('h-full rounded-full', status.hoursLow ? 'bg-red-600' : 'bg-[#fc0c97]')}
                            style={{
                              width: `${Math.max(4, Math.min(100, Math.round((student.remainingHours / currentPackage.classCount) * 100)))}%`,
                            }}
                          />
                        </div>
                      )}
                    </Stat>
                    <Stat label="Package ends">
                      <div className="text-2xl font-semibold text-slate-900">
                        {formatDate(student.lessonExpiryDate)}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {relativeDays(status.lessonExpiry.daysUntil)}
                        {currentPackage ? ` · ${currentPackage.name}` : ''}
                      </div>
                    </Stat>
                    </>
                    )}
                    {brand.usesFees && (
                    <Stat label="Fees">
                      {!feesApply ? (
                        <>
                          <div className="text-lg font-semibold text-slate-900">No fees</div>
                          <div className="mt-1 text-sm text-slate-500">This package has no fees</div>
                        </>
                      ) : (
                        <>
                          <div
                            className={cn(
                              'text-lg font-semibold',
                              worstFee?.meta.expired ? 'text-red-600' : worstFee ? 'text-amber-600' : 'text-slate-900',
                            )}
                          >
                            {worstFee
                              ? worstFee.meta.expired
                                ? `${worstFee.name} expired`
                                : `${worstFee.name} due ${relativeDays(worstFee.meta.daysUntil)}`
                              : 'Paid'}
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            Account Fee to {formatDate(student.accountFeeExpiryDate)} · {brand.clubName} to{' '}
                            {formatDate(student.miraiClubExpiryDate)}
                          </div>
                        </>
                      )}
                    </Stat>
                    )}
                  </>
                ) : (
                  <Stat label="Type">
                    <div className="text-lg font-semibold text-slate-900">HOA trial class</div>
                    <div className="mt-1 text-sm text-slate-500">Not billed by lesson count</div>
                  </Stat>
                )}
                <Stat label="Class">
                  <div className="text-lg font-semibold text-slate-900">
                    {assignedClassroom?.name ?? 'No regular class yet'}
                  </div>
                  {assignedClassroom && (
                    <div className="mt-1 text-sm text-slate-500">
                      {assignedClassroom.ageGroup} / {assignedClassroom.programLevel}
                    </div>
                  )}
                  {classroomSchedules.length > 0 && (
                    <div className="mt-1 text-sm text-slate-500">
                      {classroomSchedules
                        .map(
                          (schedule) =>
                            `${weekdayLabels[schedule.dayOfWeek ?? 0]} ${schedule.startTime}-${schedule.endTime}`,
                        )
                        .join(' · ')}
                    </div>
                  )}
                  <div className="mt-1 text-sm text-slate-500">Teacher: {teacherName ?? 'Unassigned'}</div>
                  {assignedClassroom && (
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <ClassStartField student={student} onSave={onSetClassStart} />
                    </div>
                  )}
                  {student.studentType === 'regular' && (
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <ExtraClassesField
                        student={student}
                        classrooms={classrooms}
                        onAdd={onAddClass}
                        onRemove={onRemoveClass}
                      />
                    </div>
                  )}
                  {earlierClasses.length > 0 && (
                    <div className="mt-2 text-sm text-slate-500">
                      Earlier:{' '}
                      {earlierClasses
                        .map(
                          (period) =>
                            `${classrooms.find((classroom) => classroom.id === period.classroomId)?.name ?? 'A class'} until ${formatDate(period.endDate!)}`,
                        )
                        .join(' · ')}
                    </div>
                  )}
                </Stat>
              </div>
            )}

            {/* A school that charges by the month: each subject's months. */}
            {!brand.usesPackages && student.studentType === 'regular' && (
              <MonthPlansCard
                studentId={student.id}
                classes={getStudentClassIds(student)
                  .map((id) => classrooms.find((classroom) => classroom.id === id))
                  .filter((classroom): classroom is Classroom => classroom !== undefined)
                  .map((classroom) => ({ id: classroom.id, name: classroom.name }))}
                canEdit={onEdit !== undefined}
                todayString={todayString}
              />
            )}

            {!isPreview && (
              <Card
                title="Recent lessons"
                action={
                  lessons.length > 3 ? (
                    <button
                      type="button"
                      onClick={() => setTab('lessons')}
                      className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      See all
                    </button>
                  ) : undefined
                }
                flush
              >
                {lessons.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-slate-500">No lessons yet.</div>
                )}
                <ul className="divide-y divide-slate-200">
                  {lessons.slice(0, 3).map((lesson) => (
                    <li key={lesson.log.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {formatDate(lesson.log.lessonDate)}
                        </div>
                        <div className="text-xs text-slate-500">{lesson.schedule?.title ?? 'Class'}</div>
                      </div>
                      <AttendanceChip option={getStatusOption(statusOptions, lesson.status)} />
                      <div className="w-10 text-right text-sm font-bold text-slate-900">
                        {lesson.average === null ? '-' : lesson.average.toFixed(1)}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {showAppLogins && !isPreview && (
              <AppLoginsCard studentId={student.id} studentName={student.name} studentPhone={student.phone} canManage={canManagePoints} />
            )}
          </>
        )}

        {tab === 'progress' && !isPreview && (
          <>
            {showProgressCard && (
              <Card title="This month's progress card" note="For the family">
                <StudentProgressCard studentId={student.id} />
              </Card>
            )}
            {rewardLevels && <PointsCard studentId={student.id} levels={rewardLevels} canManage={canManagePoints} />}
            <Card title="Skills profile" note={`Average of ${reviewed.length} reviewed ${reviewed.length === 1 ? 'lesson' : 'lessons'}`}>
              {reviewed.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  No performance reviews have been submitted for this student yet.
                </div>
              ) : (
                <div className="grid items-center gap-4 sm:grid-cols-2">
                  <PerformanceRadarChart averages={metricAverages} metrics={metrics} />
                  <div className="space-y-3">
                    {metrics.map((metric) => (
                      <MetricBar
                        key={metric.id}
                        label={labelWithScale(metric)}
                        value={metricAverages[metric.id] ?? 0}
                        max={metric.maxScore}
                        lowAtOrBelow={metric.remarkRequiredAtOrBelow}
                      />
                    ))}
                  </div>
                </div>
              )}
            </Card>
            <PathwaySection studentName={student.name} stages={pathwayStages} metrics={metrics} />
            {showAiReport && <AiReportCard studentId={student.id} />}
          </>
        )}

        {tab === 'lessons' && !isPreview && (
          <>
            <Card title="Attendance" note="Last 12 lessons">
              {lessons.length === 0 ? (
                <div className="py-4 text-sm text-slate-500">No attendance recorded yet.</div>
              ) : (
                <>
                  <ul className="flex flex-wrap gap-1.5" aria-label="Attendance, oldest to newest">
                    {lessons
                      .slice(0, 12)
                      .reverse()
                      .map((lesson) => (
                        <li
                          key={lesson.log.id}
                          title={`${formatDate(lesson.log.lessonDate)} - ${getStatusOption(statusOptions, lesson.status).label}`}
                          aria-label={`${formatDate(lesson.log.lessonDate)}: ${getStatusOption(statusOptions, lesson.status).label}`}
                          className={cn(
                            'h-5 w-5 rounded-md border',
                            attendanceColorStyles[getStatusOption(statusOptions, lesson.status).color].square,
                          )}
                        />
                      ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                    {sortStatuses(
                      statusOptions.filter(
                        (option) => option.isActive || lessons.some((lesson) => lesson.status === option.key),
                      ),
                    ).map((option) => (
                      <span key={option.key} className="inline-flex items-center gap-1.5">
                        <i className={cn('inline-block h-3 w-3 rounded border', attendanceColorStyles[option.color].square)} />
                        {option.label}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </Card>

            <Card title="Lesson reviews" note="Open a lesson to see every score" flush>
              {lessons.length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-slate-500">
                  No lessons have been recorded for this student yet.
                </div>
              )}
              {lessons.map((lesson) => (
                <LessonRow
                  key={lesson.log.id}
                  lesson={lesson}
                  teacherMap={teacherMap}
                  metrics={metrics}
                  statusOption={getStatusOption(statusOptions, lesson.status)}
                />
              ))}
            </Card>

            {(makeupPlans.length > 0 || (onArrangeMakeup && makeupClasses.length > 0)) && (
              <Card
                title="Make-ups"
                note="Missed classes made up with extra minutes. Records only - classes remaining are not changed."
                action={
                  onArrangeMakeup && makeupClasses.length > 0 ? (
                    <MakeupButton classes={makeupClasses} onArrange={onArrangeMakeup} />
                  ) : undefined
                }
              >
                <div className="space-y-3">
                  {makeupPlans.length === 0 && (
                    <div className="text-sm text-slate-500">No make-ups recorded.</div>
                  )}
                  {makeupPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
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
              </Card>
            )}

            {(lessonSeatLines.length > 0 || onOpenLessonSeats) && (
              <Card
                title="Other lessons"
                note="Change class (before the lesson) or Replacement (after it): the child sits in another class's lesson for one day."
                action={
                  onOpenLessonSeats ? (
                    <button
                      type="button"
                      onClick={onOpenLessonSeats}
                      className="shrink-0 rounded-xl bg-[#fc0c97] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
                    >
                      Change class / Replacement
                    </button>
                  ) : undefined
                }
              >
                <div className="space-y-2">
                  {lessonSeatLines.length === 0 && <div className="text-sm text-slate-500">No other lessons booked.</div>}
                  {lessonSeatLines.map((line) => (
                    <div key={line} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                      {line}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}

        {tab === 'classes' && !isPreview && <StudentLessonHistory studentId={student.id} />}

        {tab === 'videos' && showVideos && (
          <StudentVideosTab
            studentId={student.id}
            classrooms={getStudentClassIds(student)
              .map((id) => classrooms.find((classroom) => classroom.id === id))
              .filter((classroom) => classroom !== undefined)}
            canEdit={canEditVideoAccess}
          />
        )}

        {tab === 'billing' && isBilled && (
          <>
            <Card
              title="Current package"
              action={
                <div className="flex gap-2">
                  {onChangePackage && enrollments.length > 0 && (
                    <button
                      type="button"
                      onClick={onChangePackage}
                      className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Change Package
                    </button>
                  )}
                  {renew && (
                    <button
                      type="button"
                      onClick={renew}
                      className="rounded-xl bg-[#fc0c97] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
                    >
                      Renew
                    </button>
                  )}
                </div>
              }
            >
              <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate-500">Now on</dt>
                <dd className="font-semibold text-slate-900">{currentPackage?.name ?? 'No package'}</dd>
                {status.tracksClasses && (
                  <>
                    <dt className="text-slate-500">Classes</dt>
                    <dd className="font-semibold text-slate-900">
                      {student.remainingHours} left
                      {currentPackage ? ` of ${currentPackage.classCount}` : ''}
                    </dd>
                  </>
                )}
                <dt className="text-slate-500">Teacher</dt>
                <dd className="font-semibold text-slate-900">{teacherName ?? 'Unassigned'}</dd>
              </dl>
            </Card>

            <Card title="Expiry dates" note={!brand.usesFees ? undefined : feesApply ? `Account Fee and ${brand.clubName} are paid once a year` : 'No fees for this package'} flush>
              <ExpiryRow label="Lesson Expiry" date={student.lessonExpiryDate} meta={status.lessonExpiry} />
              {!brand.usesFees ? null : feesApply ? (
                <>
                  <ExpiryRow label="Account Fee Expiry" date={student.accountFeeExpiryDate} meta={status.accountFeeExpiry} />
                  <ExpiryRow label={`${brand.clubName} Expiry`} date={student.miraiClubExpiryDate} meta={status.miraiClubExpiry} />
                </>
              ) : (
                <>
                  <NoFeeRow label="Account Fee Expiry" />
                  <NoFeeRow label={`${brand.clubName} Expiry`} />
                </>
              )}
            </Card>

            <Card title="Package history" note="Every sign-up and renewal with a package, newest first" flush>
              <ul className="divide-y divide-slate-200">
                {enrollments.length === 0 && (
                  <li className="px-4 py-3 text-sm text-slate-500">No package sign-ups recorded yet.</li>
                )}
                {enrollments.map((enrollment) => (
                  <li
                    key={enrollment.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
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
            </Card>
          </>
        )}
      </div>
    </ModalShell>
  )
}

function Card({
  title,
  note,
  action,
  flush = false,
  children,
}: {
  title: string
  note?: string
  action?: ReactNode
  flush?: boolean
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
          {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
        </div>
        {action}
      </div>
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</div>
      {children}
    </div>
  )
}

function AttendanceChip({ option }: { option: AttendanceStatusOption }) {
  return (
    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', attendanceColorStyles[option.color].chip)}>
      {option.label}
    </span>
  )
}

function MetricBar({
  label,
  value,
  max = 5,
  lowAtOrBelow = 2,
}: {
  label: string
  value: number | null
  max?: number
  // Scores at or below this show red (the criterion's remark threshold).
  lowAtOrBelow?: number
}) {
  const low = value !== null && value > 0 && value <= lowAtOrBelow
  return (
    <div className="grid grid-cols-[minmax(0,150px)_1fr_32px] items-center gap-3 text-sm">
      <span className="text-slate-700">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-slate-200">
        <span
          className={cn('block h-full rounded-full', low ? 'bg-red-600' : 'bg-[#fc0c97]')}
          style={{ width: `${(Math.min(value ?? 0, max) / max) * 100}%` }}
        />
      </span>
      <b className="text-right text-slate-900">
        {value === null ? '-' : Number.isInteger(value) ? value : value.toFixed(1)}
      </b>
    </div>
  )
}

function LessonRow({
  lesson,
  teacherMap,
  metrics,
  statusOption,
}: {
  lesson: StudentLesson
  teacherMap: Map<number, Teacher>
  metrics: ReviewMetric[]
  statusOption: AttendanceStatusOption
}) {
  const { log, review, schedule, isTrial, average } = lesson
  return (
    <details className="group border-b border-slate-200 last:border-b-0">
      <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 transition hover:bg-[#fff8fc] group-open:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            {formatDate(log.lessonDate)}
            {isTrial && (
              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
                Trial Class
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500">
            {schedule?.title ?? 'Unknown Class'} · {teacherMap.get(log.teacherId)?.fullName ?? 'Unknown Teacher'}
            {log.revisionNumber > 1 ? ` · Revision ${log.revisionNumber}` : ''}
          </div>
        </div>
        <AttendanceChip option={statusOption} />
        <span className="w-10 text-right text-sm font-bold text-slate-900">
          {average === null ? '-' : average.toFixed(1)}
        </span>
      </summary>
      <div className="space-y-3 bg-slate-50 px-4 pb-4 pt-3">
        {review ? (
          metrics.map((metric) => {
            const entry = review.scores[metric.id]
            const remark = entry?.remark ?? null
            return (
              <div key={metric.id} className="space-y-1">
                <MetricBar
                  label={labelWithScale(metric)}
                  value={entry?.score ?? null}
                  max={metric.maxScore}
                  lowAtOrBelow={metric.remarkRequiredAtOrBelow}
                />
                {remark && <div className="text-xs text-slate-500">Remark: {remark}</div>}
              </div>
            )
          })
        ) : (
          <div className="text-sm text-slate-500">
            {statusOption.label}: no review for this lesson.
          </div>
        )}
        {review?.lessonRemark && (
          <div className="whitespace-pre-wrap text-sm text-slate-600">Lesson Remark: {review.lessonRemark}</div>
        )}
        {log.lessonRemark && (
          <div className="whitespace-pre-wrap text-sm text-slate-500">Class note: {log.lessonRemark}</div>
        )}
      </div>
    </details>
  )
}

function ExpiryRow({
  label,
  date,
  meta,
}: {
  label: string
  date: string
  meta: Parameters<typeof ExpiryCell>[0]['meta']
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 last:border-b-0">
      <span className="text-sm text-slate-500">{label}</span>
      <ExpiryCell date={date} meta={meta} />
    </div>
  )
}

function NoFeeRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 last:border-b-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm text-slate-400">Not in this package</span>
    </div>
  )
}

// What needs doing, in a sentence, with the button to do it.
function AlertBanner({
  student,
  issueLabel,
  tone,
  lessonDaysUntil,
  feeName,
  feeDaysUntil,
  onRenew,
}: {
  student: Student
  issueLabel: string | null
  tone: 'critical' | 'warning' | null
  lessonDaysUntil: number
  feeName: string | null
  feeDaysUntil: number
  onRenew?: () => void
}) {
  if (!issueLabel || !tone) {
    return null
  }

  if (issueLabel === 'Deactivated') {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <b>Deactivated.</b> Stays in the attendance roster until you remove them.
      </div>
    )
  }

  const message =
    issueLabel === 'Package ended' ? (
      <>
        <b>Package ended {Math.abs(lessonDaysUntil)} days ago.</b> Renew to keep them in class.
      </>
    ) : issueLabel === 'No classes left' ? (
      <>
        <b>No classes left.</b> Renew to keep them in class.
      </>
    ) : issueLabel === 'Classes low' ? (
      <>
        <b>
          Only {student.remainingHours} {student.remainingHours === 1 ? 'class' : 'classes'} left.
        </b>{' '}
        Package ends {formatDate(student.lessonExpiryDate)}.
      </>
    ) : issueLabel === 'Fee expired' ? (
      <>
        <b>{feeName} expired.</b> Renew to extend it by a year.
      </>
    ) : (
      <>
        <b>
          {feeName} is due {relativeDays(feeDaysUntil)}.
        </b>{' '}
        It renews with the next package.
      </>
    )

  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm',
        tone === 'critical'
          ? 'border-red-300 bg-red-50 text-red-800'
          : 'border-amber-300 bg-amber-50 text-amber-800',
      )}
    >
      <div>{message}</div>
      {onRenew && (
        <button
          type="button"
          onClick={onRenew}
          className="rounded-xl bg-[#fc0c97] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
        >
          Renew
        </button>
      )}
    </div>
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
          <span className="text-base font-semibold text-slate-900">
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
              className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
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

const NO_MAKEUP_CLASSES: { id: number; name: string }[] = []
const NO_SEAT_LINES: string[] = []

// "Extra minutes"; with several classes, first which class it is for.
function MakeupButton({
  classes,
  onArrange,
}: {
  classes: { id: number; name: string }[]
  onArrange: (classroomId: number) => void
}) {
  const [classroomId, setClassroomId] = useState(classes[0].id)
  const picked = classes.some((entry) => entry.id === classroomId) ? classroomId : classes[0].id
  return (
    <div className="flex shrink-0 items-center gap-2">
      {classes.length > 1 && (
        <select
          aria-label="Make-up for class"
          value={picked}
          onChange={(event) => setClassroomId(Number(event.target.value))}
          className="max-w-[12rem] rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
        >
          {classes.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={() => onArrange(picked)}
        className="rounded-xl bg-[#fc0c97] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
      >
        Extra minutes
      </button>
    </div>
  )
}
