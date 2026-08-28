import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import type { CreateTeacherFormState, Teacher } from '../../types/domain'

type TeacherModalProps = {
  editingTeacher: Teacher | null
  formState: CreateTeacherFormState
  saveError: string | null
  isSaving: boolean
  onClose: () => void
  onSubmit: React.FormEventHandler<HTMLFormElement>
  onFieldChange: (field: keyof CreateTeacherFormState, value: string) => void
}

export function TeacherModal({
  editingTeacher,
  formState,
  saveError,
  isSaving,
  onClose,
  onSubmit,
  onFieldChange,
}: TeacherModalProps) {
  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="border-b border-slate-200 bg-[#f8fafc] px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">
              {editingTeacher ? 'Teacher profile' : 'Teacher record setup'}
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              {editingTeacher ? `Edit ${editingTeacher.fullName}` : 'Add Teacher'}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {editingTeacher
                ? 'Update this account’s basic details and role.'
                : 'Create a teacher profile for classroom assignment and timetable visibility.'}
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
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">
              Username
            </span>
            <input
              type="text"
              value={formState.username}
              disabled={editingTeacher?.username === 'admin_demo'}
              onChange={(event) =>
                onFieldChange('username', event.target.value)
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-100 disabled:text-slate-500"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">
              Full Name
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
              Email
            </span>
            <input
              type="email"
              value={formState.email}
              onChange={(event) =>
                onFieldChange('email', event.target.value)
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">
              Phone
            </span>
            <input
              type="text"
              value={formState.phone}
              onChange={(event) =>
                onFieldChange('phone', event.target.value)
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
          </label>

          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">
              Role
            </span>
            <select
              value={formState.role}
              disabled={editingTeacher?.username === 'admin_demo'}
              onChange={(event) =>
                onFieldChange(
                  'role',
                  event.target.value as CreateTeacherFormState['role'],
                )
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-100 disabled:text-slate-500"
            >
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
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
              : editingTeacher
                ? 'Save Details'
                : 'Create Teacher'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
