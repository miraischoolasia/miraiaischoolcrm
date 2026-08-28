import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import type { Classroom, StudentDetailsFormState, Teacher } from '../../types/domain'

type EditStudentModalProps = {
  studentName: string
  classrooms: Classroom[]
  teacherMap: Map<number, Teacher>
  formState: StudentDetailsFormState
  saveError: string | null
  isSaving: boolean
  onClose: () => void
  onSubmit: React.FormEventHandler<HTMLFormElement>
  onFieldChange: (field: keyof StudentDetailsFormState, value: string) => void
}

export function EditStudentModal({
  studentName,
  classrooms,
  teacherMap,
  formState,
  saveError,
  isSaving,
  onClose,
  onSubmit,
  onFieldChange,
}: EditStudentModalProps) {
  const selectedClassroom = formState.classroomId
    ? classrooms.find((classroom) => classroom.id === Number(formState.classroomId))
    : undefined
  const derivedTeacherName = selectedClassroom?.teacherId
    ? teacherMap.get(selectedClassroom.teacherId)?.fullName
    : undefined
  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-5">
        <div>
          <div className="text-sm font-medium text-[#be185d]">Student profile</div>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">
            Edit {studentName}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Update basic details or move this student to another classroom.
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

      <form
        data-modal-body
        onSubmit={onSubmit}
        className="max-h-[75vh] space-y-5 overflow-y-auto px-6 py-6"
      >
        {saveError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {saveError}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Full Name</span>
            <input
              value={formState.fullName}
              onChange={(event) => onFieldChange('fullName', event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#fc0c97]"
            />
          </label>

          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Main Classroom</span>
            <select
              value={formState.classroomId}
              onChange={(event) => onFieldChange('classroomId', event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#fc0c97]"
            >
              <option value="">No classroom</option>
              {classrooms
                .filter((classroom) => classroom.status === 'active')
                .map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.ageGroup} / {classroom.programLevel} / {classroom.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Student Category</span>
            <select
              value={formState.studentType}
              onChange={(event) =>
                onFieldChange(
                  'studentType',
                  event.target.value as StudentDetailsFormState['studentType'],
                )
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#fc0c97]"
            >
              <option value="regular">Regular Student</option>
              <option value="trial">Trial Student</option>
            </select>
          </label>

          <div className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Assigned Teacher</span>
            <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700">
              {derivedTeacherName ?? 'No classroom assigned yet'}
            </div>
            <p className="text-xs text-slate-500">
              Teacher is set automatically from the selected classroom above.
            </p>
          </div>

          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Notes</span>
            <textarea
              rows={3}
              value={formState.notes}
              onChange={(event) => onFieldChange('notes', event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#fc0c97]"
            />
          </label>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700">
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className="rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {isSaving ? 'Saving...' : 'Save Details'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
