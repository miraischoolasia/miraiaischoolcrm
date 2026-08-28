import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { cn } from '../../lib/cn'
import { formatDate } from '../../domain/studentStatus'
import { performanceMetricDefinitions } from '../../lib/constants'
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
  attendanceModal: AttendanceModalState
  attendanceExistingLog: LessonLogSummary | null
  attendanceLocked: boolean
  isLoadingAttendance: boolean
  attendanceRoster: Student[]
  attendanceStatuses: Record<number, AttendanceStatus>
  attendanceReviews: Record<number, AttendanceReviewFormState>
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
  onRemarkChange: (value: string) => void
}

export function AttendanceModal({
  attendanceModal,
  attendanceExistingLog,
  attendanceLocked,
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
  onRemarkChange,
}: AttendanceModalProps) {
  return (
    <ModalShell maxWidth="760" onClose={onClose}>
      <div className="border-b border-slate-200 bg-[#f8fafc] px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">
              Attendance Submission
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              {attendanceModal.title}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {formatDate(attendanceModal.occurrenceDate)} -{' '}
              {attendanceExistingLog
                ? attendanceLocked
                  ? 'Locked after 24 hours'
                  : `Editing revision ${attendanceExistingLog.revisionNumber} within 24 hours`
                : 'New lesson attendance submission'}
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
            <div className="space-y-3">
              {attendanceRoster.map((student) => {
                const currentStatus =
                  attendanceStatuses[student.id] ?? 'present'
                const reviewForm =
                  attendanceReviews[student.id] ??
                  createEmptyAttendanceReviewForm()

                return (
                  <div
                    key={student.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-1">
                          <div
                            className="text-base font-semibold text-slate-900"
                          >
                            {student.name}
                          </div>
                          <div className="text-sm text-slate-500">
                            Student ID #{String(student.id).padStart(3, '0')}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
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
                                onClick={() => onSetStatus(student.id, value)}
                                className={cn(
                                  'rounded-xl border px-4 py-2 text-sm font-semibold transition',
                                  active &&
                                    value === 'present' &&
                                    'border-emerald-200 bg-emerald-50 text-emerald-700',
                                  active &&
                                    value === 'absent' &&
                                    'border-slate-300 bg-slate-100 text-slate-700',
                                  active &&
                                    value === 'leave' &&
                                    'border-amber-200 bg-amber-50 text-amber-700',
                                  !active &&
                                    'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                                  attendanceLocked && 'cursor-not-allowed opacity-70',
                                )}
                              >
                                {label}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {currentStatus === 'present' && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="mb-3 text-sm font-semibold text-slate-900">
                            Student Performance Review
                          </div>
                          <div className="grid gap-3 lg:grid-cols-2">
                            {performanceMetricDefinitions.map((metric) => {
                              const score = reviewForm[metric.scoreField]
                              const needsRemark =
                                score !== null && score <= 2

                              return (
                                <div
                                  key={`${student.id}-${metric.key}`}
                                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                                >
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="text-sm font-semibold text-slate-900">
                                      {metric.label}
                                    </div>
                                    <StarRatingInput
                                      value={score}
                                      disabled={attendanceLocked}
                                      onChange={(nextScore) =>
                                        onUpdateReviewScore(
                                          student.id,
                                          metric.scoreField,
                                          metric.remarkField,
                                          nextScore,
                                        )
                                      }
                                    />
                                  </div>

                                  {needsRemark && (
                                    <div className="mt-3 space-y-2">
                                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">
                                        Remark Required for 1-2 Stars
                                      </div>
                                      <textarea
                                        rows={3}
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
                          </div>
                        </div>
                      )}
                    </div>
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

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">
                Lesson Remark
              </span>
              <textarea
                rows={5}
                value={attendanceRemark}
                disabled={attendanceLocked}
                onChange={(event) => onRemarkChange(event.target.value)}
                placeholder="Write the lesson progress, homework, or any important classroom note here."
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-50"
              />
            </label>
          </>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
          {!attendanceLocked && attendanceRoster.length > 0 && (
            <button
              type="submit"
              disabled={isSavingAttendance || isLoadingAttendance}
              className="rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSavingAttendance ? 'Submitting...' : 'Submit Attendance'}
            </button>
          )}
        </div>
      </form>
    </ModalShell>
  )
}
