import { useState } from 'react'
import { LinkBreak } from '@phosphor-icons/react'
import { MAX_LEAD_FOLLOW_UPS } from '../../lib/constants'
import { formatDate } from '../../domain/studentStatus'
import type { Lead } from '../../types/domain'
import type { WhatsAppCrm } from './crm'

// Who the chat belongs to, and a way to say it is the wrong lead.
export function LeadHeader({ lead, byPhone, onUnlink }: { lead: Lead; byPhone: boolean; onUnlink: () => void }) {
  const name = lead.fullName || lead.children[0]?.name || lead.phone || 'Unnamed lead'
  return (
    <div className="flex items-start justify-between gap-2 text-xs">
      <div className="min-w-0">
        <p className="text-slate-500">{byPhone ? 'Lead (found by phone number)' : 'Lead'}</p>
        <h4 className="truncate text-sm font-semibold text-slate-900">{name}</h4>
      </div>
      {!byPhone && (
        <button
          type="button"
          onClick={onUnlink}
          title="This is the wrong lead. Unlink this chat."
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50"
        >
          <LinkBreak size={12} aria-hidden="true" />
          Unlink
        </button>
      )}
    </div>
  )
}

// What goes with a lead beyond its details: the follow-ups, the form answers, the full page.
export function LeadExtras({ lead, crm }: { lead: Lead; crm: WhatsAppCrm }) {
  const [note, setNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastFollowUps = lead.followUps.slice(-3).reverse()

  async function logFollowUp() {
    if (!note.trim()) {
      return
    }
    setIsSaving(true)
    setError(null)
    const problem = await crm.onAddFollowUp(lead.id, note.trim())
    setIsSaving(false)
    if (problem) {
      setError(problem)
      return
    }
    setNote('')
  }

  return (
    <section className="space-y-3 text-xs">
      <div>
        <h5 className="font-semibold text-slate-700">
          Follow-ups ({lead.followUps.length}/{MAX_LEAD_FOLLOW_UPS})
        </h5>
        {lastFollowUps.length > 0 ? (
          <ul className="mt-1 space-y-1">
            {lastFollowUps.map((entry, index) => (
              <li key={`${entry.date}-${index}`} className="rounded-md bg-slate-50 px-2 py-1 text-slate-700">
                <span className="text-slate-500">{formatDate(entry.date)}: </span>
                {entry.note}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-slate-500">None yet.</p>
        )}
        {crm.canEditLeads && lead.followUps.length < MAX_LEAD_FOLLOW_UPS && (
          <div className="mt-2 space-y-1.5">
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="What did you follow up on?"
              aria-label="Follow-up note"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-[#fc0c97]"
            />
            {error && <p className="text-red-600">{error}</p>}
            <button
              type="button"
              disabled={isSaving || !note.trim()}
              onClick={() => void logFollowUp()}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Log follow-up'}
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-2">
        {crm.leadIdsWithForms.has(lead.id) && (
          <button
            type="button"
            onClick={() => crm.onOpenFormAnswers(lead.id)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-[#be185d] hover:bg-slate-50"
          >
            Read their form answers
          </button>
        )}
        <button
          type="button"
          onClick={() => crm.onOpenLead(lead.id)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
        >
          Open full lead
        </button>
      </div>
    </section>
  )
}
