import { useMemo, useState } from 'react'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import type { FlowTrigger, NewBlockKind } from '../../lib/automationFlows'

import { pickGroupsFor } from './pickGroups'

type ActionPickerProps = {
  // Where the new step goes, for the heading ("after this message").
  where: string
  // The trigger of the flow, so steps that only fit another trigger are not offered.
  trigger?: FlowTrigger
  onPick: (kind: NewBlockKind) => void
  onClose: () => void
}

// The panel on the right that opens from a "+": search, then pick the step to add.
export function ActionPicker({ where, trigger, onPick, onClose }: ActionPickerProps) {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const all = pickGroupsFor(trigger)
    if (needle === '') {
      return all
    }
    return all.map((group) => ({
      ...group,
      picks: group.picks.filter(
        (pick) => pick.label.toLowerCase().includes(needle) || pick.hint.toLowerCase().includes(needle),
      ),
    })).filter((group) => group.picks.length > 0)
  }, [query, trigger])

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Add a step</h3>
          <p className="text-xs text-slate-500">{where}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <X size={14} aria-hidden="true" />
          Close
        </button>
      </div>
      <label className="relative block">
        <span className="sr-only">Search steps</span>
        <MagnifyingGlass
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          value={query}
          placeholder="Search steps"
          onChange={(event) => setQuery(event.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-[#fc0c97]"
        />
      </label>
      {groups.length === 0 && <p className="text-sm text-slate-500">No step matches “{query.trim()}”.</p>}
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title} className="space-y-1">
          <h4 className="rounded-md bg-[#fff1f8] px-2 py-1 text-xs font-bold uppercase tracking-wide text-[#be185d]">{group.title}</h4>
          <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {group.picks.map((pick) => (
              <li key={pick.kind} className="border-b border-slate-100 last:border-b-0">
                <button
                  type="button"
                  onClick={() => onPick(pick.kind)}
                  className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                >
                  <span className="block text-sm font-semibold text-slate-900">{pick.label}</span>
                  <span className="block text-xs text-slate-500">{pick.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
