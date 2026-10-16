import { useMemo, useState } from 'react'
import { searchLeads } from '../../lib/leadSearch'
import type { Lead } from '../../types/domain'

type Props = {
  // What is typed in the phone number field: leads with that number (or that name) are offered.
  query: string
  leads: Lead[]
  // The lead being edited, who cannot be joined with themself; null while the parent is not a lead yet.
  currentLeadId: number | null
  // Runs once a person was picked (and, for an existing lead, once they said yes to joining the two).
  onPick: (lead: Lead) => Promise<string | null>
}

function titleOf(lead: Lead) {
  return lead.fullName || lead.children[0]?.name || 'Unnamed lead'
}

// The phone number field finds leads as it is typed in: a lead that already has the number (or the name) is
// offered right under it. For a parent who is not a lead yet it ties the chat to the lead found; for a lead
// it joins the two leads (the one with a phone number stays).
export function LeadMatches({ query, leads, currentLeadId, onPick }: Props) {
  const [picked, setPicked] = useState<Lead | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const found = useMemo(
    () => searchLeads(leads, query).filter((entry) => entry.id !== currentLeadId),
    [leads, query, currentLeadId],
  )

  async function run(lead: Lead) {
    setBusy(true)
    setError(null)
    const problem = await onPick(lead)
    setBusy(false)
    if (problem) {
      setError(problem)
      return
    }
    setPicked(null)
  }

  function choose(lead: Lead) {
    if (currentLeadId === null) {
      void run(lead)
      return
    }
    // Two leads become one: say so before it happens.
    setPicked(lead)
  }

  return (
    <div className="mt-1.5 text-xs">
      {found.length > 0 && !picked && (
        <p className="font-semibold text-slate-700">Already a lead? Pick them</p>
      )}
      {found.length > 0 && !picked && (
        <ul aria-label="Leads that match" className="mt-1 space-y-1">
          {found.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => choose(entry)}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-left hover:bg-slate-50 disabled:opacity-60"
              >
                <span className="block truncate text-sm text-slate-900">{titleOf(entry)}</span>
                <span className="block truncate text-slate-500">{entry.phone ?? 'No phone number'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked && (
        <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-slate-800">
          <p>
            Join this lead with <strong>{titleOf(picked)}</strong>
            {picked.phone ? ` (${picked.phone})` : ''}? They become one lead. The one with a phone number stays, and
            nothing is lost.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(picked)}
              className="rounded-lg bg-[#fc0c97] px-3 py-1.5 font-semibold text-white hover:bg-[#de0a84] disabled:opacity-60"
            >
              {busy ? 'Joining...' : 'Join them'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPicked(null)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
