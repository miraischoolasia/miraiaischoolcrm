import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { formatDate } from '../../domain/studentStatus'
import type { RenewalFormState, Student } from '../../types/domain'

type StudentRenewalModalProps = {
  student: Student
  todayString: string
  formState: RenewalFormState
  saveError: string | null
  isSaving: boolean
  onClose: () => void
  onSubmit: React.FormEventHandler<HTMLFormElement>
  onFieldChange: (field: keyof RenewalFormState, value: string) => void
}

export function StudentRenewalModal({
  student,
  todayString,
  formState,
  saveError,
  isSaving,
  onClose,
  onSubmit,
  onFieldChange,
}: StudentRenewalModalProps) {
  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="border-b border-slate-200 bg-[#f8fafc] px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">
              Manual renewal panel
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              Renew {student.name}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Renewal now updates the real student record and writes an immutable admin ledger entry.
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
        <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Current Remaining Classes
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">
              {student.remainingHours}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Current Local Date
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">
              {formatDate(todayString)}
            </div>
          </div>
        </div>

        {saveError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {saveError}
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">
              Add Classes
            </span>
            <input
              type="number"
              min="0"
              step="1"
              value={formState.addHours}
              onChange={(event) =>
                onFieldChange('addHours', event.target.value)
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">
              New Lesson Expiry Date
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
              New Account Fee Expiry Date
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
              New Mirai Club Expiry Date
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
              Admin Remark
            </span>
            <textarea
              rows={4}
              value={formState.remark}
              onChange={(event) =>
                onFieldChange('remark', event.target.value)
              }
              placeholder="Explain why this renewal was made. This remark will be written into the admin ledger."
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
            {isSaving ? 'Saving...' : 'Save Renewal'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
