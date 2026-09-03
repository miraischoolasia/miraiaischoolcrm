import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { ageGroupOptions, leadSourceOptions, leadStatusOptions } from '../../lib/constants'
import type { Lead, LeadFormState } from '../../types/domain'

type LeadModalProps = {
  editingLead: Lead | null
  formState: LeadFormState
  saveError: string | null
  isSaving: boolean
  onClose: () => void
  onSubmit: React.FormEventHandler<HTMLFormElement>
  onFieldChange: <K extends keyof LeadFormState>(field: K, value: LeadFormState[K]) => void
}

export function LeadModal({
  editingLead,
  formState,
  saveError,
  isSaving,
  onClose,
  onSubmit,
  onFieldChange,
}: LeadModalProps) {
  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">
              {editingLead ? 'Lead profile' : 'New lead'}
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              {editingLead ? `Edit ${editingLead.fullName}` : 'Add Lead'}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {editingLead
                ? 'Update contact details, pipeline stage, and follow-up notes.'
                : 'Capture a new prospective student inquiry.'}
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
            <span className="text-sm font-semibold text-slate-700">Full Name</span>
            <input
              type="text"
              value={formState.fullName}
              onChange={(event) => onFieldChange('fullName', event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Phone</span>
            <input
              type="text"
              value={formState.phone}
              onChange={(event) => onFieldChange('phone', event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Email</span>
            <input
              type="email"
              value={formState.email}
              onChange={(event) => onFieldChange('email', event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Source</span>
            <select
              value={formState.source}
              onChange={(event) =>
                onFieldChange('source', event.target.value as LeadFormState['source'])
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            >
              {leadSourceOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Stage</span>
            <select
              value={formState.status}
              onChange={(event) =>
                onFieldChange('status', event.target.value as LeadFormState['status'])
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            >
              {leadStatusOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">
              Interested Age Group
            </span>
            <select
              value={formState.interestedAgeGroup}
              onChange={(event) =>
                onFieldChange(
                  'interestedAgeGroup',
                  event.target.value as LeadFormState['interestedAgeGroup'],
                )
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            >
              <option value="">Not specified</option>
              {ageGroupOptions.map((ageGroup) => (
                <option key={ageGroup} value={ageGroup}>
                  {ageGroup}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">
              Follow-up Date
            </span>
            <input
              type="date"
              value={formState.followUpDate}
              onChange={(event) => onFieldChange('followUpDate', event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
          </label>

          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Notes</span>
            <textarea
              rows={4}
              value={formState.notes}
              onChange={(event) => onFieldChange('notes', event.target.value)}
              placeholder="Conversation notes, trial preferences, budget concerns, etc."
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
            {isSaving ? 'Saving...' : editingLead ? 'Save Details' : 'Add Lead'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
