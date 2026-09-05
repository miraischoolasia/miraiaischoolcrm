import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { cn } from '../../lib/cn'
import { getStudentStatus } from '../../domain/studentStatus'
import { ageGroupOptions, programLevelOptions } from '../../lib/constants'
import { weekdayLabels } from '../../lib/schedule'
import type { Classroom, Schedule, ScheduleFormState, Student, Teacher } from '../../types/domain'

type ScheduleModalProps = {
  isCreatingSchedule: boolean
  editingSchedule: Schedule | null
  formState: ScheduleFormState
  saveError: string | null
  isSaving: boolean
  activeVisibleClassrooms: Classroom[]
  scheduleLinkedClassroom: Classroom | null
  scheduleClassroomRoster: Student[]
  teacherMap: Map<number, Teacher>
  assignableTeachers: Teacher[]
  students: Student[]
  todayString: string
  onClose: () => void
  onSubmit: React.FormEventHandler<HTMLFormElement>
  onFieldChange: (field: keyof ScheduleFormState, value: string) => void
  onToggleParticipant: (studentId: string) => void
  onCancelSchedule: () => void
}

export function ScheduleModal({
  isCreatingSchedule,
  editingSchedule,
  formState,
  saveError,
  isSaving,
  activeVisibleClassrooms,
  scheduleLinkedClassroom,
  scheduleClassroomRoster,
  teacherMap,
  assignableTeachers,
  students,
  todayString,
  onClose,
  onSubmit,
  onFieldChange,
  onToggleParticipant,
  onCancelSchedule,
}: ScheduleModalProps) {
  return (
    <ModalShell maxWidth="760" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">
              {isCreatingSchedule
                ? formState.eventType === 'regular'
                  ? 'Create classroom timetable'
                  : 'Create replacement class'
                : 'Edit timetable entry'}
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              {isCreatingSchedule
                ? formState.eventType === 'regular'
                  ? 'New Weekly Timetable'
                  : 'New Replacement Class'
                : editingSchedule?.title ?? 'Schedule'}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {formState.eventType === 'regular'
                ? 'Regular schedules are bound to one classroom. Attendance will always pull the classroom roster.'
                : 'Replacement classes stay separate from My Classroom and use a hand-picked student list.'}
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
        {saveError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {saveError}
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className="inline-flex rounded-full border border-[#ffd1ea] bg-[#fff2f9] px-4 py-2 text-sm font-semibold text-[#be185d]">
              {formState.eventType === 'regular'
                ? 'Regular Classroom Timetable'
                : 'Replacement Class'}
            </div>
          </div>

          {formState.eventType === 'regular' ? (
            <>
              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">
                  Linked Classroom
                </span>
                <select
                  value={formState.classroomId}
                  onChange={(event) =>
                    onFieldChange('classroomId', event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                >
                  <option value="">Select classroom</option>
                  {ageGroupOptions.flatMap((ageGroup) =>
                    programLevelOptions.map((programLevel) => {
                      const groupedClassrooms = activeVisibleClassrooms.filter(
                        (classroom) =>
                          classroom.ageGroup === ageGroup &&
                          classroom.programLevel === programLevel,
                      )

                      if (groupedClassrooms.length === 0) {
                        return null
                      }

                      return (
                        <optgroup
                          key={`${ageGroup}-${programLevel}`}
                          label={`${ageGroup} / ${programLevel}`}
                        >
                          {groupedClassrooms.map((classroom) => (
                            <option key={classroom.id} value={classroom.id}>
                              {classroom.name}
                            </option>
                          ))}
                        </optgroup>
                      )
                    }),
                  )}
                </select>
              </label>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Classroom Name
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">
                      {scheduleLinkedClassroom?.name ?? 'Not selected'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Assigned Teacher
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">
                      {scheduleLinkedClassroom?.teacherId
                        ? teacherMap.get(scheduleLinkedClassroom.teacherId)
                            ?.fullName ?? 'Unknown Teacher'
                        : 'Assign a teacher in classroom first'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Student Roster
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">
                      {scheduleClassroomRoster.length} student
                      {scheduleClassroomRoster.length === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  Repeat Every
                </span>
                <select
                  value={formState.dayOfWeek}
                  onChange={(event) =>
                    onFieldChange('dayOfWeek', event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                >
                  {weekdayLabels.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  Recurrence Start Date
                </span>
                <input
                  type="date"
                  value={formState.startRecur}
                  onChange={(event) =>
                    onFieldChange('startRecur', event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  Recurrence End Date
                </span>
                <input
                  type="date"
                  value={formState.endRecur}
                  onChange={(event) =>
                    onFieldChange('endRecur', event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  Start Time
                </span>
                <input
                  type="time"
                  value={formState.startTime}
                  onChange={(event) =>
                    onFieldChange('startTime', event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  End Time
                </span>
                <input
                  type="time"
                  value={formState.endTime}
                  onChange={(event) =>
                    onFieldChange('endTime', event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                />
              </label>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                <div className="text-sm font-semibold text-slate-900">
                  Classroom Roster Preview
                </div>
                <p className="text-sm text-slate-500">
                  Attendance for regular classes always pulls students from
                  the linked classroom.
                </p>
                <div className="grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {scheduleClassroomRoster.map((student) => {
                    const status = getStudentStatus(student, todayString)
                    return (
                      <div
                        key={student.id}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">
                              {student.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              Classes: {student.remainingHours}
                            </div>
                          </div>
                          {!student.isActive && (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">
                              Deactivated
                            </span>
                          )}
                        </div>
                        {status.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {status.tags.map((tag) => (
                              <span
                                key={`${student.id}-${tag.label}`}
                                className={cn(
                                  'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                                  tag.tone === 'critical'
                                    ? 'bg-red-50 text-red-600'
                                    : 'bg-emerald-50 text-emerald-600',
                                )}
                              >
                                {tag.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {scheduleLinkedClassroom && scheduleClassroomRoster.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-500">
                    This classroom does not have any student assigned yet.
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">
                  Class Title
                </span>
                <input
                  type="text"
                  value={formState.title}
                  onChange={(event) =>
                    onFieldChange('title', event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  Teacher
                </span>
                <select
                  value={formState.teacherId}
                  onChange={(event) =>
                    onFieldChange('teacherId', event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                >
                  <option value="">Select teacher</option>
                  {assignableTeachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.fullName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  Scheduled Date
                </span>
                <input
                  type="date"
                  value={formState.scheduledDate}
                  onChange={(event) =>
                    onFieldChange('scheduledDate', event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  Start Time
                </span>
                <input
                  type="time"
                  value={formState.startTime}
                  onChange={(event) =>
                    onFieldChange('startTime', event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  End Time
                </span>
                <input
                  type="time"
                  value={formState.endTime}
                  onChange={(event) =>
                    onFieldChange('endTime', event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                />
              </label>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                <div className="text-sm font-semibold text-slate-900">
                  Replacement Participants
                </div>
                <p className="text-sm text-slate-500">
                  Only the selected students will appear for this
                  replacement attendance record.
                </p>
                <div className="grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {students.map((student) => {
                    const selected = formState.participantIds.includes(
                      String(student.id),
                    )
                    return (
                      <label
                        key={student.id}
                        className={cn(
                          'flex items-start gap-3 rounded-xl border px-3 py-3 text-sm transition',
                          selected
                            ? 'border-[#fc0c97] bg-[#fff1f8]'
                            : 'border-slate-200 bg-white',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() =>
                            onToggleParticipant(String(student.id))
                          }
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-[#fc0c97] focus:ring-[#fc0c97]"
                        />
                        <div>
                          <div className="font-semibold text-slate-900">
                            {student.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            Classes: {student.remainingHours}
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">
              Notes
            </span>
            <textarea
              rows={4}
              value={formState.notes}
              onChange={(event) =>
                onFieldChange('notes', event.target.value)
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
          </label>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {!isCreatingSchedule && editingSchedule && (
              <button
                type="button"
                onClick={onCancelSchedule}
                disabled={isSaving}
                className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Cancel Schedule
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSaving
                ? 'Saving...'
                : isCreatingSchedule
                  ? formState.eventType === 'regular'
                    ? 'Create Timetable'
                    : 'Create Replacement Class'
                  : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </ModalShell>
  )
}
