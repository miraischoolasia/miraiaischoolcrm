import { useState } from 'react'
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
  loginPassword: string
  onLoginPasswordChange: (value: string) => void
  onProvisionLogin: () => void
  isProvisioningLogin: boolean
  provisionLoginError: string | null
}

export function TeacherModal({
  editingTeacher,
  formState,
  saveError,
  isSaving,
  onClose,
  onSubmit,
  onFieldChange,
  loginPassword,
  onLoginPasswordChange,
  onProvisionLogin,
  isProvisioningLogin,
  provisionLoginError,
}: TeacherModalProps) {
  const [showPassword, setShowPassword] = useState(false)
  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
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

        {editingTeacher && (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-700">Login access</div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {editingTeacher.authUserId
                    ? 'This teacher already has a login. Set a new password to reset it.'
                    : 'This teacher has no login yet. Set an initial password to enable one.'}
                </p>
              </div>
              <span
                className={
                  editingTeacher.authUserId
                    ? 'shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700'
                    : 'shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700'
                }
              >
                {editingTeacher.authUserId ? 'Login enabled' : 'No login'}
              </span>
            </div>

            {provisionLoginError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {provisionLoginError}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type={showPassword ? 'text' : 'password'}
                value={loginPassword}
                onChange={(event) => onLoginPasswordChange(event.target.value)}
                placeholder={
                  editingTeacher.authUserId ? 'New password (min 8 characters)' : 'Initial password (min 8 characters)'
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-white"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
              <button
                type="button"
                onClick={onProvisionLogin}
                disabled={isProvisioningLogin}
                className="shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isProvisioningLogin
                  ? 'Saving...'
                  : editingTeacher.authUserId
                    ? 'Reset password'
                    : 'Set up login'}
              </button>
            </div>
          </div>
        )}

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
