import { useEffect, useRef } from 'react'
import { Plus, Trash, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import {
  MAX_LEAD_CHILDREN,
  leadChildAgeOptions,
  leadStatusOptions,
} from '../../lib/constants'
import { LeadOptionPicker } from '../LeadOptionPicker'
import { LeadTagPicker } from '../LeadTagPicker'
import { WhatsAppLink } from '../WhatsAppLink'
import { formatDateTime } from '../../lib/forms'
import { trafficSourceLabel } from '../../lib/formInsights'
import type {
  Lead,
  LeadChildFormState,
  LeadFormState,
  LeadFormSubmission,
  LeadOption,
  LeadOptionKind,
} from '../../types/domain'

type LeadModalProps = {
  editingLead: Lead | null
  formState: LeadFormState
  saveError: string | null
  isSaving: boolean
  onClose: () => void
  onSubmit: React.FormEventHandler<HTMLFormElement>
  onFieldChange: <K extends keyof LeadFormState>(field: K, value: LeadFormState[K]) => void
  leadOptions: LeadOption[]
  onAddLeadOption: (
    kind: LeadOptionKind,
    label: string,
    color?: string,
  ) => Promise<LeadOption | null>
  // What this lead answered in forms (read-only), newest first.
  formSubmissions?: LeadFormSubmission[]
  isLoadingFormSubmissions?: boolean
  // Scroll to the form answers when the window opens.
  focusFormAnswers?: boolean
  // Leads view-only accounts: every field is shown but nothing can be saved.
  readOnly?: boolean
}

export function LeadModal({
  editingLead,
  formState,
  saveError,
  isSaving,
  onClose,
  onSubmit,
  onFieldChange,
  leadOptions,
  onAddLeadOption,
  formSubmissions = [],
  isLoadingFormSubmissions = false,
  focusFormAnswers = false,
  readOnly = false,
}: LeadModalProps) {
  const formAnswersRef = useRef<HTMLElement>(null)
  const hasFormAnswers = formSubmissions.length > 0

  useEffect(() => {
    if (focusFormAnswers && hasFormAnswers) {
      formAnswersRef.current?.scrollIntoView?.({ block: 'start' })
    }
  }, [focusFormAnswers, hasFormAnswers])

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
    onFieldChange('children', [...formState.children, { name: '', age: '', phone: '' }])
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
              {editingLead
                ? `${readOnly ? 'View' : 'Edit'} ${editingLead.fullName || 'Lead'}`
                : 'Add Lead'}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {readOnly
                ? 'View only - your account cannot change leads.'
                : editingLead
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

        <fieldset disabled={readOnly} className="min-w-0 space-y-6">
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
            <span className="flex items-center gap-1 text-sm font-semibold text-slate-700">
              Phone
              <WhatsAppLink phone={formState.phone} name={formState.fullName} />
            </span>
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

          <LeadOptionPicker
            label="Source"
            options={leadOptions.filter((option) => option.kind === 'source')}
            value={formState.sourceId}
            onChange={(value) => onFieldChange('sourceId', value)}
            onAdd={(label) => onAddLeadOption('source', label)}
          />

          <LeadOptionPicker
            label="PIC"
            options={leadOptions.filter((option) => option.kind === 'pic')}
            value={formState.picId}
            emptyLabel="- Not assigned -"
            onChange={(value) => onFieldChange('picId', value)}
            onAdd={(label) => onAddLeadOption('pic', label)}
          />

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
              <input
                type="text"
                value={child.phone}
                onChange={(event) => updateChild(index, { phone: event.target.value })}
                placeholder="Phone (optional)"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97] sm:w-40"
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

          <div className="border-t border-slate-200 pt-3">
            <LeadTagPicker
              tags={leadOptions.filter((option) => option.kind === 'tag')}
              selectedIds={formState.tagIds}
              onChange={(ids) => onFieldChange('tagIds', ids)}
              onCreate={(label, color) => onAddLeadOption('tag', label, color)}
            />
          </div>
        </div>

        </fieldset>

        {editingLead && (isLoadingFormSubmissions || hasFormAnswers) && (
          <section
            ref={formAnswersRef}
            aria-label="Form answers"
            className="space-y-3 rounded-2xl border border-pink-100 bg-[#fff8fc] p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-700">Form answers</h3>
              {hasFormAnswers && (
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">
                  {formSubmissions.length} {formSubmissions.length === 1 ? 'submission' : 'submissions'}
                </span>
              )}
            </div>
            {isLoadingFormSubmissions && !hasFormAnswers ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : (
              formSubmissions.map((submission) => (
                <article key={submission.id} className="rounded-xl bg-white p-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#be185d]">{submission.formName}</span>
                    <span className="text-slate-500">
                      {formatDateTime(submission.createdAt)}
                      {submission.wasExisting && ' · filled in again'}
                    </span>
                  </div>
                  {submission.tracking && (
                    <p className="mt-1 text-xs text-slate-500">
                      Came from {trafficSourceLabel(submission.tracking)}
                      {submission.tracking.campaign && ` · ${submission.tracking.campaign}`}
                    </p>
                  )}
                  <dl className="mt-2 space-y-2">
                    {submission.answers.map((answer) => (
                      <div key={answer.id}>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {answer.label}
                        </dt>
                        <dd className="whitespace-pre-wrap break-words text-sm text-slate-800">
                          {answer.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))
            )}
          </section>
        )}

        <fieldset disabled={readOnly} className="min-w-0">
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
        </fieldset>

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly && (
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving ? 'Saving...' : editingLead ? 'Save Details' : 'Add Lead'}
          </button>
          )}
        </div>
      </form>
    </ModalShell>
  )
}
