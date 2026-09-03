import { Plus, Trash, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import {
  MAX_LEAD_CHILDREN,
  leadChildAgeOptions,
  leadSourceOptions,
  leadStatusOptions,
} from '../../lib/constants'
import type { Lead, LeadChildFormState, LeadFormState } from '../../types/domain'

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
  function updateChild(index: number, patch: Partial<LeadChildFormState>) {
    onFieldChange(
      'children',
      formState.children.map((child, childIndex) =>
        childIndex === index ? { ...child, ...patch } : child,
      ),
    )
  }

  function addChild() {
    if (formState.children.length >= MAX_LEAD_CHILDREN) {
      return
    }
    onFieldChange('children', [...formState.children, { name: '', age: '' }])
  }

  function removeChild(index: number) {
    onFieldChange(
      'children',
      formState.children.filter((_, childIndex) => childIndex !== index),
    )
  }

  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">
              {editingLead ? 'Lead profile' : 'New lead'}
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              {editingLead ? `Edit ${editingLead.fullName || 'Lead'}` : 'Add Lead'}
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
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">
              Parent / Contact Name{' '}
              <span className="font-normal text-slate-400">(optional)</span>
            </span>
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
            <span className="text-sm font-semibold text-slate-700">Date Added</span>
            <input
              type="date"
              value={formState.addedDate}
              onChange={(event) => onFieldChange('addedDate', event.target.value)}
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

        </div>

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-700">Children</div>
              <p className="text-xs text-slate-500">
                Add each child's age (up to {MAX_LEAD_CHILDREN}) so the right classroom can be
                offered.
              </p>
            </div>
            <button
              type="button"
              onClick={addChild}
              disabled={formState.children.length >= MAX_LEAD_CHILDREN}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={14} aria-hidden="true" />
              Add Child
            </button>
          </div>

          {formState.children.length === 0 && (
            <p className="text-sm text-slate-400">No children added yet.</p>
          )}

          {formState.children.map((child, index) => (
            <div
              key={index}
              className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center"
            >
              <input
                type="text"
                value={child.name}
                onChange={(event) => updateChild(index, { name: event.target.value })}
                placeholder={`Child ${index + 1} name (optional)`}
                className="w-full flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97]"
              />
              <select
                value={child.age}
                onChange={(event) => updateChild(index, { age: event.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97] sm:w-32"
              >
                <option value="">Age</option>
                {leadChildAgeOptions.map((age) => (
                  <option key={age} value={age}>
                    {age} years old
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeChild(index)}
                aria-label="Remove child"
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
              >
                <Trash size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-700">Notes</span>
          <textarea
            rows={4}
            value={formState.notes}
            onChange={(event) => onFieldChange('notes', event.target.value)}
            placeholder="Conversation notes, trial preferences, budget concerns, etc."
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
          />
        </label>

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
