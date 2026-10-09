import { useState } from 'react'
import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { cn } from '../../lib/cn'
import { formatDate } from '../../domain/studentStatus'
import { performanceMetricDefinitions } from '../../lib/constants'
import { countRatedMetrics, getReviewProgress, isReviewComplete } from '../../lib/attendance'
import { createEmptyAttendanceReviewForm } from '../../lib/mappers'
import { StarRatingInput } from '../StarRatingInput'
import type {
  AttendanceModalState,
  AttendanceReviewFormState,
  AttendanceStatus,
  LessonLogSummary,
  ReviewRemarkField,
  ReviewScoreField,
  Student,
} from '../../types/domain'

type AttendanceModalProps = {
  // Make-up extensions on this class day, e.g. "Whole class +30 min (makes up Sep 23)".
  makeupNotes?: string[]
  attendanceModal: AttendanceModalState
  attendanceExistingLog: LessonLogSummary | null
  attendanceLocked: boolean
  // An admin has switched on late editing: past the 24 hours it stays open.
  lateEditOpen?: boolean
  // A class after today: view the roster only, attendance opens on the day.
  isUpcoming?: boolean
  // Someone who is neither admin nor the class teacher: they can look, but
  // attendance is only ever taken by the class teacher (or admin).
  isViewOnly?: boolean
  // Class teacher of a submitted log, shown so an admin reviewing it knows
  // whose feedback it is.
  teacherName?: string | null
  // Admin only: a way on from the class report to the schedule/bookings.
  adminAction?: { label: string; onClick: () => void }
  isLoadingAttendance: boolean
  attendanceRoster: Student[]
  attendanceStatuses: Record<number, AttendanceStatus>
  attendanceReviews: Record<number, AttendanceReviewFormState>
  // A class-wide note from before each student had their own: shown as
  // read-only history and carried along unchanged on an edit.
  attendanceRemark: string
  attendanceSaveError: string | null
  isSavingAttendance: boolean
  onClose: () => void
  onSubmit: React.FormEventHandler<HTMLFormElement>
  onSetStatus: (studentId: number, status: AttendanceStatus) => void
  onUpdateReviewScore: (
    studentId: number,
    scoreField: ReviewScoreField,
    remarkField: ReviewRemarkField,
    score: number,
  ) => void
  onUpdateReviewRemark: (
    studentId: number,
    remarkField: ReviewRemarkField,
    value: string,
  ) => void
  onUpdateLessonRemark: (studentId: number, value: string) => void
}

export function AttendanceModal({
  attendanceModal,
  attendanceExistingLog,
  attendanceLocked,
  lateEditOpen = false,
  isUpcoming = false,
  isViewOnly = false,
  teacherName = null,
  adminAction,
  isLoadingAttendance,
  attendanceRoster,
  attendanceStatuses,
  attendanceReviews,
  attendanceRemark,
  attendanceSaveError,
  isSavingAttendance,
  onClose,
  onSubmit,
  onSetStatus,
  onUpdateReviewScore,
  onUpdateReviewRemark,
  onUpdateLessonRemark,
  makeupNotes = [],
}: AttendanceModalProps) {
  // Nothing has been submitted that this viewer could look at: roster only.
  const isRosterOnly = isUpcoming || (isViewOnly && !attendanceExistingLog)

  const rosterIds = attendanceRoster.map((student) => student.id)
  const progress = getReviewProgress(rosterIds, attendanceStatuses, attendanceReviews)
  // A new submission opens one student's review at a time, starting with the
  // first one still to review. A submitted report opens every review, as it
  // is there to be read, and each can be closed on its own.
  const isReport = attendanceExistingLog !== null
  const [chosenOpenIds, setChosenOpenIds] = useState<number[] | undefined>(undefined)
  const openIds = chosenOpenIds ?? (isReport ? progress.presentIds : progress.pendingIds.slice(0, 1))
  function toggleReview(studentId: number) {
    const isOpen = openIds.includes(studentId)
    if (isReport) {
      setChosenOpenIds(isOpen ? openIds.filter((id) => id !== studentId) : [...openIds, studentId])
    } else {
      setChosenOpenIds(isOpen ? [] : [studentId])
    }
  }
  function focusReview(studentId: number) {
    if (!isReport) {
      setChosenOpenIds([studentId])
    }
  }
  const pendingNames = progress.pendingIds.map(
    (id) => attendanceRoster.find((student) => student.id === id)?.name.split(' ')[0] ?? '',
  )
  const canSubmit = !attendanceLocked && attendanceRoster.length > 0

  return (
    <ModalShell maxWidth="760" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">
              {isUpcoming
                ? 'Upcoming Class'
                : attendanceExistingLog
                  ? 'Attendance & Reviews'
                  : isViewOnly
                    ? 'Class Roster'
                    : 'Attendance Submission'}
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              {attendanceModal.title}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {formatDate(attendanceModal.occurrenceDate)} -{' '}
              {isUpcoming
                ? 'View only - attendance and reviews open on the day of the class'
                : isViewOnly
                ? attendanceExistingLog
                  ? 'View only'
                  : 'View only - attendance is taken by the class teacher'
                : attendanceExistingLog
                ? attendanceLocked
                  ? 'Locked after 24 hours'
                  : lateEditOpen
                    ? `Editing revision ${attendanceExistingLog.revisionNumber} (late editing is on)`
                    : `Editing revision ${attendanceExistingLog.revisionNumber} within 24 hours`
                : 'New lesson attendance submission'}
            </p>
            {attendanceExistingLog && (
              <p className="mt-1 text-sm text-slate-500">
                {teacherName ? `Teacher: ${teacherName} · ` : ''}Submitted{' '}
                {new Date(attendanceExistingLog.submittedAt).toLocaleString('en-MY', {
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            )}
            {makeupNotes.length > 0 && (
              <div className="mt-3 space-y-1 rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-800">
                {makeupNotes.map((note) => (
                  <div key={note}>{note}</div>
                ))}
              </div>
            )}
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

      <form
        data-modal-body
        onSubmit={onSubmit}
        className="max-h-[82vh] space-y-6 overflow-y-auto px-6 py-6 sm:px-8"
      >
        {attendanceSaveError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {attendanceSaveError}
          </div>
        )}

        {isLoadingAttendance ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-16 text-center text-sm text-slate-500">
            Loading attendance roster...
          </div>
        ) : (
          <>
            {canSubmit && !isRosterOnly && (
              <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Reviewed {progress.doneIds.length} of {progress.presentIds.length} present students
                  </div>
                  <div className="text-xs text-slate-500">
                    {progress.awayCount > 0
                      ? `${progress.awayCount} absent or on leave, no review needed`
                      : 'Rate each present student, one at a time.'}
                  </div>
                </div>
                <div
                  className="h-2 min-w-32 flex-1 overflow-hidden rounded-full bg-slate-200"
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full bg-[#fc0c97] transition-all"
                    style={{
                      width: `${progress.presentIds.length === 0 ? 100 : (progress.doneIds.length / progress.presentIds.length) * 100}%`,
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    for (const student of attendanceRoster) {
                      onSetStatus(student.id, 'present')
                    }
                  }}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Mark all present
                </button>
              </div>
            )}

            <div className="space-y-3">
              {attendanceRoster.map((student) => {
                const currentStatus =
                  attendanceStatuses[student.id] ?? 'present'
                const reviewForm =
                  attendanceReviews[student.id] ??
                  createEmptyAttendanceReviewForm()
                const isOpen = !isRosterOnly && currentStatus === 'present' && openIds.includes(student.id)
                const ratedCount = countRatedMetrics(reviewForm)
                const complete = isReviewComplete(reviewForm)
                const nextPendingId = progress.pendingIds.find((id) => id !== student.id) ?? null

                return (
                  <div
                    key={student.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span
                        aria-hidden="true"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#fbcfe8] bg-[#fff1f8] text-xs font-bold text-[#be185d]"
                      >
                        {student.name
                          .split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((word) => word[0])
                          .join('')
                          .toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-slate-900">{student.name}</div>
                        <div className="text-sm text-slate-500">
                          {[
                            student.age !== null ? `${student.age} yrs old` : null,
                            student.phone,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'No contact info'}
                        </div>
                      </div>

                      {!isRosterOnly && (
                        <div
                          role="group"
                          aria-label={`Attendance for ${student.name}`}
                          className="ml-auto inline-flex overflow-hidden rounded-xl border border-slate-200"
                        >
                          {([
                            ['present', 'Present'],
                            ['absent', 'Absent'],
                            ['leave', 'Leave'],
                          ] as const).map(([value, label]) => {
                            const active = currentStatus === value

                            return (
                              <button
                                key={value}
                                type="button"
                                disabled={attendanceLocked}
                                aria-pressed={active}
                                onClick={() => {
                                  onSetStatus(student.id, value)
                                  if (value !== 'present' && openIds.includes(student.id)) {
                                    setChosenOpenIds(openIds.filter((id) => id !== student.id))
                                  }
                                }}
                                className={cn(
                                  'border-r border-slate-200 px-4 py-1.5 text-sm font-semibold transition last:border-r-0',
                                  active && value === 'present' && 'bg-emerald-50 text-emerald-700',
                                  active && value === 'absent' && 'bg-slate-100 text-slate-800',
                                  active && value === 'leave' && 'bg-amber-50 text-amber-700',
                                  !active && 'bg-white text-slate-500 hover:bg-slate-50',
                                  attendanceLocked && 'cursor-not-allowed opacity-70',
                                )}
                              >
                                {label}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {!isRosterOnly && currentStatus === 'present' && (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => toggleReview(student.id)}
                        className="flex w-full items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-left transition hover:bg-[#fff8fc]"
                      >
                        <span className="text-sm font-semibold text-slate-900">
                          Student Performance Review
                        </span>
                        <span className="flex items-center gap-3">
                          {complete ? (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                              ✓ Reviewed
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                              {ratedCount === 0
                                ? 'Not reviewed'
                                : `${ratedCount} of 5 rated${ratedCount === 5 ? ' · remark needed' : ''}`}
                            </span>
                          )}
                          <span className="text-xs font-semibold text-slate-500">
                            {isOpen ? 'Hide' : attendanceLocked ? 'View' : 'Rate'}
                          </span>
                        </span>
                      </button>
                    )}

                    {isOpen && (
                      <div className="space-y-3 border-t border-slate-200 p-4">
                        {performanceMetricDefinitions.map((metric) => {
                          const score = reviewForm[metric.scoreField]
                          const needsRemark = score !== null && score <= 2

                          return (
                            <div key={`${student.id}-${metric.key}`}>
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-sm font-medium text-slate-800">{metric.label}</div>
                                <StarRatingInput
                                  value={score}
                                  disabled={attendanceLocked}
                                  onChange={(nextScore) => {
                                    focusReview(student.id)
                                    onUpdateReviewScore(
                                      student.id,
                                      metric.scoreField,
                                      metric.remarkField,
                                      nextScore,
                                    )
                                  }}
                                />
                              </div>

                              {needsRemark && (
                                <div className="mt-2 space-y-1.5">
                                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-red-600">
                                    Remark Required for 1-2 Stars
                                  </div>
                                  <textarea
                                    rows={2}
                                    value={reviewForm[metric.remarkField]}
                                    disabled={attendanceLocked}
                                    onChange={(event) =>
                                      onUpdateReviewRemark(
                                        student.id,
                                        metric.remarkField,
                                        event.target.value,
                                      )
                                    }
                                    placeholder="Explain the low score for this metric."
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-50"
                                  />
                                </div>
                              )}
                            </div>
                          )
                        })}

                        <label className="block space-y-1.5">
                          <span className="text-sm font-semibold text-slate-900">Lesson Remark</span>
                          <textarea
                            rows={2}
                            value={reviewForm.lessonRemark}
                            disabled={attendanceLocked}
                            onChange={(event) =>
                              onUpdateLessonRemark(student.id, event.target.value)
                            }
                            placeholder={`Lesson progress, homework, or any note for ${student.name}.`}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-50"
                          />
                        </label>

                        {complete && nextPendingId !== null && !attendanceLocked && (
                          <button
                            type="button"
                            onClick={() => setChosenOpenIds([nextPendingId])}
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            Next student
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {attendanceRoster.length === 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                  No students are assigned to this class yet. Admin must edit
                  the schedule and add participants first.
                </div>
              )}
            </div>

            {!isRosterOnly && attendanceRemark && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Class note (written before each student had their own)
                </div>
                <div className="mt-1 whitespace-pre-wrap">{attendanceRemark}</div>
              </div>
            )}
          </>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
          {adminAction && (
            <button
              type="button"
              onClick={adminAction.onClick}
              className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:mr-auto"
            >
              {adminAction.label}
            </button>
          )}
          {canSubmit && !isRosterOnly && !isLoadingAttendance && (
            <p
              id="attendance-submit-hint"
              className={cn(
                'text-sm sm:mr-auto',
                pendingNames.length > 0 ? 'text-slate-500' : 'font-medium text-emerald-700',
              )}
            >
              {pendingNames.length > 0
                ? `Still to review: ${pendingNames.join(', ')}`
                : 'All set. Ready to submit.'}
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
          {canSubmit && (
            <button
              type="submit"
              aria-describedby="attendance-submit-hint"
              disabled={
                isSavingAttendance ||
                isLoadingAttendance ||
                (!isRosterOnly && progress.pendingIds.length > 0)
              }
              className="rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingAttendance ? 'Submitting...' : 'Submit Attendance'}
            </button>
          )}
        </div>
      </form>
    </ModalShell>
  )
}
