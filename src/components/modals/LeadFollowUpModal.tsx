import { useEffect, useState } from 'react'
import { CheckCircle, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { MAX_LEAD_FOLLOW_UPS } from '../../lib/constants'
import type { Lead } from '../../types/domain'

type LeadFollowUpModalProps = {
  lead: Lead
  isSaving: boolean
  saveError: string | null
  onClose: () => void
  onAddFollowUp: (note: string) => void
}

export function LeadFollowUpModal({
  lead,
  isSaving,
  saveError,
  onClose,
  onAddFollowUp,
}: LeadFollowUpModalProps) {
  const [note, setNote] = useState('')
  const followUpCount = lead.followUps.length
  const reachedMax = followUpCount >= MAX_LEAD_FOLLOW_UPS

  useEffect(() => {
    setNote('')
  }, [followUpCount])

  return (
    <ModalShell maxWidth="760" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">
              Follow-up {followUpCount}/{MAX_LEAD_FOLLOW_UPS}
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              {lead.fullName || 'Unnamed Lead'}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Log each follow-up touch so the whole team can see where this lead stands.
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

      <div data-modal-body className="max-h-[82vh] space-y-6 overflow-y-auto px-6 py-6 sm:px-8">
        {saveError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {saveError}
          </div>
        )}

        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-700">Follow-up History</div>
          {followUpCount === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No follow-ups logged yet.
            </div>
          ) : (
            <div className="space-y-2">
              {lead.followUps
                .map((followUp, index) => ({ ...followUp, index }))
                .reverse()
                .map((followUp) => (
                  <div
                    key={followUp.index}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      <CheckCircle size={14} weight="fill" className="text-emerald-500" aria-hidden="true" />
                      Follow-up {followUp.index + 1} &middot;{' '}
                      {new Date(followUp.date).toLocaleDateString('en-MY', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                    {followUp.note && (
                      <p className="mt-1.5 text-sm text-slate-700">{followUp.note}</p>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>

        {reachedMax ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Maximum of {MAX_LEAD_FOLLOW_UPS} follow-ups reached for this lead.
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              onAddFollowUp(note.trim())
            }}
            className="space-y-3 border-t border-slate-200 pt-5"
          >
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">
                Log Follow-up {followUpCount + 1}
              </span>
              <textarea
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="What happened on this follow-up? (optional)"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
              />
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
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
                {isSaving ? 'Saving...' : 'Log Follow-up'}
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalShell>
  )
}
