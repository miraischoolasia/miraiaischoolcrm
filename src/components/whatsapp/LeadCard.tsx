import { useState } from 'react'
import { LinkBreak } from '@phosphor-icons/react'
import { LeadTagChip } from '../LeadTagChip'
import { leadStatusOptions, MAX_LEAD_FOLLOW_UPS } from '../../lib/constants'
import { formatDate } from '../../domain/studentStatus'
import type { Lead, LeadStatus } from '../../types/domain'
import type { WhatsAppCrm } from './crm'

type LeadCardProps = {
  lead: Lead
  crm: WhatsAppCrm
  // Set when nobody tied the chat to this lead; it was found by the phone number.
  byPhone: boolean
  onUnlink: () => void
}

export function LeadCard({ lead, crm, byPhone, onUnlink }: LeadCardProps) {
  const [note, setNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const option = (id: number | null) => crm.leadOptions.find((entry) => entry.id === id)
  const tags = lead.tagIds.flatMap((id) => option(id) ?? [])
  const child = lead.children[0]
  const lastFollowUps = lead.followUps.slice(-3).reverse()
  const name = lead.fullName || child?.name || lead.phone || 'Unnamed lead'

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
      <div className="flex items-start justify-between gap-2">
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

      <label className="block">
        <span className="text-slate-600">Stage</span>
        <select
          value={lead.status}
          disabled={!crm.canEditLeads}
          onChange={(event) => void crm.onChangeLeadStatus(lead.id, event.target.value as LeadStatus)}
          className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-[#fc0c97] disabled:bg-slate-50"
        >
          {leadStatusOptions.map((stage) => (
            <option key={stage.key} value={stage.key}>
              {stage.label}
            </option>
          ))}
        </select>
      </label>

      <dl className="space-y-2">
        {child && (
          <div>
            <dt className="text-slate-500">Child</dt>
            <dd className="text-sm text-slate-900">
              {child.name || 'No name'}, {child.age}
              {lead.children.length > 1 ? ` (+${lead.children.length - 1} more)` : ''}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-slate-500">Source</dt>
          <dd className="text-sm text-slate-900">
            {crm.leadIdsWithForms.has(lead.id) ? (
              <button
                type="button"
                onClick={() => crm.onOpenFormAnswers(lead.id)}
                title="Read what they wrote in the form"
                className="text-left font-medium text-[#c2077a] underline decoration-dotted underline-offset-2 hover:text-[#fc0c97]"
              >
                {option(lead.sourceId)?.label ?? 'Form answers'}
              </button>
            ) : (
              (option(lead.sourceId)?.label ?? 'Not set')
            )}
          </dd>
          {crm.leadIdsWithForms.has(lead.id) && <p className="text-slate-500">Tap it to read their form answers.</p>}
        </div>
        <div>
          <dt className="text-slate-500">Person in charge</dt>
          <dd className="text-sm text-slate-900">{option(lead.picId)?.label ?? 'No one yet'}</dd>
        </div>
        {tags.length > 0 && (
          <div>
            <dt className="text-slate-500">Tags</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <LeadTagChip key={tag.id} tag={tag} />
              ))}
            </dd>
          </div>
        )}
        {lead.notes && (
          <div>
            <dt className="text-slate-500">Notes</dt>
            <dd className="whitespace-pre-wrap break-words text-slate-800">{lead.notes}</dd>
          </div>
        )}
      </dl>

      <div>
        <h5 className="font-semibold text-slate-700">Follow-ups ({lead.followUps.length}/{MAX_LEAD_FOLLOW_UPS})</h5>
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

      <button
        type="button"
        onClick={() => crm.onOpenLead(lead.id)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
      >
        Open full lead
      </button>
    </section>
  )
}
