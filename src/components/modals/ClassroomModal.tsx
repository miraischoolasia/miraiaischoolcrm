import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { ageGroupOptions, programLevelOptions } from '../../lib/constants'
import type { AgeGroup, Classroom, ClassroomFormState, ProgramLevel, Teacher } from '../../types/domain'

type ClassroomModalProps = {
  isCreating: boolean
  editingClassroom: Classroom | null
  assignableTeachers: Teacher[]
  formState: ClassroomFormState
  saveError: string | null
  isSaving: boolean
  onClose: () => void
  onSubmit: React.FormEventHandler<HTMLFormElement>
  onFieldChange: (
    field: keyof ClassroomFormState,
    value: string | AgeGroup | ProgramLevel,
  ) => void
}

export function ClassroomModal({
  isCreating,
  editingClassroom,
  assignableTeachers,
  formState,
  saveError,
  isSaving,
  onClose,
  onSubmit,
  onFieldChange,
}: ClassroomModalProps) {
  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="border-b border-slate-200 bg-[#f8fafc] px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">
              Classroom setup
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              {isCreating ? 'Add Classroom' : editingClassroom?.name ?? 'Edit Classroom'}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Organize regular teaching by age group, level, assigned
              teacher, and weekly timetable ownership.
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
              Classroom Name
            </span>
            <input
              type="text"
              value={formState.name}
              onChange={(event) =>
                onFieldChange('name', event.target.value)
              }
              placeholder="Example: Tuesday Innovator Group A"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">
              Age Group
            </span>
            <select
              value={formState.ageGroup}
              onChange={(event) =>
                onFieldChange(
                  'ageGroup',
                  event.target.value as AgeGroup,
                )
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            >
              {ageGroupOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">
              Program Level
            </span>
            <select
              value={formState.programLevel}
              onChange={(event) =>
                onFieldChange(
                  'programLevel',
                  event.target.value as ProgramLevel,
                )
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            >
              {programLevelOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">
              Assigned Teacher
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
            {assignableTeachers.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                No teacher account is available yet. Add a teacher first,
                then create the classroom.
              </div>
            )}
          </label>

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
            {isSaving
              ? 'Saving...'
              : isCreating
                ? 'Create Classroom'
                : 'Save Classroom'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
