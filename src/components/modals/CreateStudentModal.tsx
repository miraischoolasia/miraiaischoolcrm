import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { ageGroupOptions, programLevelOptions } from '../../lib/constants'
import type { Classroom, CreateStudentFormState, Teacher } from '../../types/domain'

type CreateStudentModalProps = {
  activeVisibleClassrooms: Classroom[]
  teacherMap: Map<number, Teacher>
  formState: CreateStudentFormState
  saveError: string | null
  isSaving: boolean
  onClose: () => void
  onSubmit: React.FormEventHandler<HTMLFormElement>
  onFieldChange: (field: keyof CreateStudentFormState, value: string) => void
}

export function CreateStudentModal({
  activeVisibleClassrooms,
  teacherMap,
  formState,
  saveError,
  isSaving,
  onClose,
  onSubmit,
  onFieldChange,
}: CreateStudentModalProps) {
  const selectedClassroom = formState.classroomId
    ? activeVisibleClassrooms.find(
        (classroom) => classroom.id === Number(formState.classroomId),
      )
    : undefined
  const derivedTeacherName = selectedClassroom?.teacherId
    ? teacherMap.get(selectedClassroom.teacherId)?.fullName
    : undefined
  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">
              Student record setup
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              Add Student Record
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Create a new student profile with initial classes and all active expiry dates.
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
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">
              Student Full Name
            </span>
            <input
              type="text"
              value={formState.fullName}
              onChange={(event) =>
                onFieldChange('fullName', event.target.value)
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">
              Student Category
            </span>
            <select
              value={formState.studentType}
              onChange={(event) =>
                onFieldChange(
                  'studentType',
                  event.target.value as CreateStudentFormState['studentType'],
                )
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            >
              <option value="regular">Regular Student</option>
              <option value="trial">Trial Student</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">
              Initial Classes
            </span>
            <input
              type="number"
              min="0"
              step="1"
              value={formState.initialHours}
              onChange={(event) =>
                onFieldChange('initialHours', event.target.value)
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">
              Lesson Expiry Date
            </span>
            <input
              type="date"
              value={formState.lessonExpiryDate}
              onChange={(event) =>
                onFieldChange('lessonExpiryDate', event.target.value)
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">
              Account Fee Expiry Date
            </span>
            <input
              type="date"
              value={formState.accountFeeExpiryDate}
              onChange={(event) =>
                onFieldChange(
                  'accountFeeExpiryDate',
                  event.target.value,
                )
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">
              Mirai Club Expiry Date
            </span>
            <input
              type="date"
              value={formState.miraiClubExpiryDate}
              onChange={(event) =>
                onFieldChange(
                  'miraiClubExpiryDate',
                  event.target.value,
                )
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
          </label>

          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">
              Main Classroom
            </span>
            <select
              value={formState.classroomId}
              onChange={(event) =>
                onFieldChange('classroomId', event.target.value)
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            >
              <option value="">Unassigned for now</option>
              {ageGroupOptions.map((ageGroup) =>
                programLevelOptions
                  .map((programLevel) => {
                    const groupClassrooms = activeVisibleClassrooms.filter(
                      (classroom) =>
                        classroom.ageGroup === ageGroup &&
                        classroom.programLevel === programLevel,
                    )

                    if (groupClassrooms.length === 0) {
                      return null
                    }

                    return (
                      <optgroup
                        key={`${ageGroup}-${programLevel}`}
                        label={`${ageGroup} / ${programLevel}`}
                      >
                        {groupClassrooms.map((classroom) => (
                          <option key={classroom.id} value={classroom.id}>
                            {classroom.name}
                            {classroom.teacherId
                              ? ` - ${teacherMap.get(classroom.teacherId)?.fullName ?? 'Unassigned'}`
                              : ' - Unassigned'}
                          </option>
                        ))}
                      </optgroup>
                    )
                  })
                  .filter(Boolean),
              )}
            </select>
            {activeVisibleClassrooms.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-500">
                No active classroom available yet. Create a classroom first, then assign students into it.
              </div>
            )}
            <p className="text-xs text-slate-500">
              {derivedTeacherName
                ? `Teacher will be set to ${derivedTeacherName}, based on this classroom.`
                : 'Teacher is set automatically once a classroom is selected.'}
            </p>
          </label>

          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">
              Internal Note
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

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving ? 'Creating...' : 'Create Student'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
