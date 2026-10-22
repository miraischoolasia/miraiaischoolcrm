import { Check } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import type { Programme } from '../../lib/programmes'

// What a parent can sign up for: one of Mirai's own courses (HOA class, Holiday Camp) or a flow the school made.
export type Offer = { key: string; label: string; legacy: 'hoa' | 'camp' | null; programme: Programme | null }

// Up to this many entries on the first row they are tabs; more than that and they fold into one drop-down.
export const MAX_TABS = 6

type Entry = { kind: 'offer'; offer: Offer } | { kind: 'group'; label: string; offers: Offer[] }

const categoryOf = (offer: Offer) => offer.programme?.category?.trim() || null

// One entry per offer without a category, and one per category (holding its offers), in the order of the offers.
export function offerEntries(offers: Offer[]): Entry[] {
  const entries: Entry[] = []
  for (const offer of offers) {
    const category = categoryOf(offer)
    if (category === null) {
      entries.push({ kind: 'offer', offer })
      continue
    }
    const group = entries.find(
      (entry): entry is Extract<Entry, { kind: 'group' }> => entry.kind === 'group' && entry.label.toLowerCase() === category.toLowerCase(),
    )
    if (group) {
      group.offers.push(offer)
    } else {
      entries.push({ kind: 'group', label: category, offers: [offer] })
    }
  }
  return entries
}

const tabClass = (active: boolean) =>
  cn(
    'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold',
    active ? 'border-[#fc0c97] bg-[#fff0f9] text-[#be185d]' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
  )

const selectClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-[#fc0c97]'

// The choice of what to sign up for. Every offer is its own tab, named as the school named it, beside the others; an
// offer the school put in a category sits under that category (pick the category, then the offer). A long row slides
// sideways, and past MAX_TABS entries everything folds into one drop-down grouped by category.
export function ProgrammeSwitch({
  offers,
  current,
  followed,
  onChange,
}: {
  offers: Offer[]
  current: string
  // The offers this lead is already being followed up on (they carry a tick).
  followed: ReadonlySet<string>
  onChange: (key: string) => void
}) {
  if (offers.length < 2) {
    return null
  }
  const entries = offerEntries(offers)
  const currentEntry = entries.find((entry) => (entry.kind === 'offer' ? entry.offer.key === current : entry.offers.some((offer) => offer.key === current)))

  if (entries.length > MAX_TABS) {
    return (
      <select
        aria-label="What are they signing up for"
        value={current}
        onChange={(event) => onChange(event.target.value)}
        className={selectClass}
      >
        {entries.map((entry) =>
          entry.kind === 'offer' ? (
            <option key={entry.offer.key} value={entry.offer.key}>
              {entry.offer.label}
              {followed.has(entry.offer.key) ? ' ✓' : ''}
            </option>
          ) : (
            <optgroup key={`group:${entry.label}`} label={entry.label}>
              {entry.offers.map((offer) => (
                <option key={offer.key} value={offer.key}>
                  {offer.label}
                  {followed.has(offer.key) ? ' ✓' : ''}
                </option>
              ))}
            </optgroup>
          ),
        )}
      </select>
    )
  }

  const group = currentEntry?.kind === 'group' ? currentEntry : null
  return (
    <div className="space-y-1.5">
      <div role="group" aria-label="What are they signing up for" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {entries.map((entry) => {
          if (entry.kind === 'offer') {
            const active = entry.offer.key === current
            return (
              <button key={entry.offer.key} type="button" aria-pressed={active} onClick={() => onChange(entry.offer.key)} className={tabClass(active)}>
                {entry.offer.label}
                {followed.has(entry.offer.key) && <Check size={12} weight="bold" aria-label="Already on this lead" />}
              </button>
            )
          }
          const active = currentEntry === entry
          return (
            <button
              key={`group:${entry.label}`}
              type="button"
              aria-pressed={active}
              onClick={() => (active ? undefined : onChange(entry.offers[0].key))}
              className={tabClass(active)}
            >
              {entry.label}
              <span className="text-[10px] font-normal opacity-70">{entry.offers.length}</span>
            </button>
          )
        })}
      </div>
      {group && (
        <div
          {...(group.offers.length > MAX_TABS ? {} : { role: 'group', 'aria-label': `${group.label}: pick one` })}
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
        >
          {group.offers.length > MAX_TABS ? (
            <select
              aria-label={`${group.label}: pick one`}
              value={current}
              onChange={(event) => onChange(event.target.value)}
              className={selectClass}
            >
              {group.offers.map((offer) => (
                <option key={offer.key} value={offer.key}>
                  {offer.label}
                  {followed.has(offer.key) ? ' ✓' : ''}
                </option>
              ))}
            </select>
          ) : (
            group.offers.map((offer) => (
              <button key={offer.key} type="button" aria-pressed={offer.key === current} onClick={() => onChange(offer.key)} className={tabClass(offer.key === current)}>
                {offer.label}
                {followed.has(offer.key) && <Check size={12} weight="bold" aria-label="Already on this lead" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
