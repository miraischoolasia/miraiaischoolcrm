import { useMemo, useState } from 'react'
import { searchLeads } from '../../lib/leadSearch'
import type { Lead } from '../../types/domain'

type Props = {
  leads: Lead[]
  // The lead being edited, who cannot be joined with themself; null while the parent is not a lead yet.
  currentLeadId: number | null
  // Runs once a person was picked (and, for an existing lead, once they said yes to joining the two).
  onPick: (lead: Lead) => Promise<string | null>
}

function titleOf(lead: Lead) {
  return lead.fullName || lead.children[0]?.name || 'Unnamed lead'
}

// "Already a lead? Find them": sits under the phone number. For a parent who is not a lead yet it ties the
// chat to the lead found; for a lead it joins the two leads (the one with a phone number stays).
export function LeadFinder({ leads, currentLeadId, onPick }: Props) {
  const [query, setQuery] = useState('')
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
    setQuery('')
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
      <label className="block">
        <span className="font-semibold text-slate-700">Already a lead? Find them</span>
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setPicked(null)
          }}
          placeholder="Name or phone number"
          className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-[#fc0c97]"
        />
      </label>
      {query.trim() && found.length === 0 && <p className="mt-1 text-slate-500">No lead found.</p>}
      {found.length > 0 && !picked && (
        <ul className="mt-1 space-y-1">
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
