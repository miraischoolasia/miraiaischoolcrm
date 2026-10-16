import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, MagnifyingGlass, Plus } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { groupProgrammes, searchProgrammes } from '../../lib/programmes'

export type PickerOffer = { key: string; name: string; category: string | null }

type ProgrammePickerProps = {
  offers: PickerOffer[]
  // The programme whose steps are on show.
  current: string
  // The programmes this lead is already being followed up on.
  followed: ReadonlySet<string>
  onChange: (key: string) => void
}

// For a school with many programmes: the ones this lead is on are small tabs, and "Add programme" opens a
// searchable list grouped by category for the rest.
export function ProgrammePicker({ offers, current, followed, onChange }: ProgrammePickerProps) {
  const [added, setAdded] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)

  // Closes when something else is pressed.
  useEffect(() => {
    if (!open) {
      return undefined
    }
    function close(event: MouseEvent) {
      if (box.current && !box.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const shown = useMemo(
    () => offers.filter((offer) => followed.has(offer.key) || added.includes(offer.key) || offer.key === current),
    [offers, followed, added, current],
  )
  const groups = useMemo(() => groupProgrammes(searchProgrammes(offers, query)), [offers, query])

  function pick(key: string) {
    setAdded((list) => (list.includes(key) ? list : [...list, key]))
    onChange(key)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={box} className="relative space-y-2">
      <div role="group" aria-label="What are they signing up for" className="flex flex-wrap items-center gap-1.5">
        {shown.map((offer) => (
          <button
            key={offer.key}
            type="button"
            aria-pressed={current === offer.key}
            onClick={() => onChange(offer.key)}
            className={cn(
              'max-w-full truncate rounded-full border px-3 py-1 text-xs font-semibold',
              current === offer.key
                ? 'border-[#fc0c97] bg-[#fff0f9] text-[#be185d]'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            {offer.name}
          </button>
        ))}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          <Plus size={12} weight="bold" aria-hidden="true" />
          Add programme
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-20 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-500 focus-within:border-[#fc0c97]">
            <MagnifyingGlass size={14} aria-hidden="true" />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a programme or category"
              aria-label="Search programmes"
              className="min-w-0 flex-1 bg-transparent text-slate-900 outline-none placeholder:text-slate-400"
            />
          </label>
          <div className="mt-2 max-h-64 overflow-y-auto">
            {groups.length === 0 && <p className="px-2 py-3 text-xs text-slate-500">No programme matches.</p>}
            {groups.map((group) => (
              <div key={group.label || 'all'} className="mb-1">
                {group.label && (
                  <p className="px-2 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group.label}</p>
                )}
                <ul>
                  {group.programmes.map((offer) => (
                    <li key={offer.key}>
                      <button
                        type="button"
                        onClick={() => pick(offer.key)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-50"
                      >
                        <span className="min-w-0 truncate">{offer.name}</span>
                        {(followed.has(offer.key) || added.includes(offer.key)) && (
                          <Check size={14} className="shrink-0 text-emerald-600" aria-label="Already on this lead" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
