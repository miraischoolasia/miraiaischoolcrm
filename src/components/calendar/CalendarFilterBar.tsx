import { useEffect, useRef, useState } from 'react'
import { CaretDown, MagnifyingGlass, User } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { CALENDAR_KINDS, defaultCalendarFilter, isFiltered, type CalendarFilter, type CalendarKind, type CalendarTeam } from '../../lib/calendarFilter'

type CalendarFilterBarProps = {
  filter: CalendarFilter
  onChange: (filter: CalendarFilter) => void
  // Teachers and staff to pick from.
  people: { id: number; name: string }[]
  teams: CalendarTeam[]
  // Off for an account that only sees its own things anyway (no team or people to pick).
  canPickPeople: boolean
  // The kinds this page can show (all of them by default); the Timetable and the Planner each have their own.
  kinds?: CalendarKind[]
  // The Planner's switch for putting the classes on it too.
  showClasses?: { on: boolean; onChange: (on: boolean) => void }
}

// Each kind's colour on the calendar cards, so the kind buttons also say what the colours mean.
const KIND_DOT: Record<string, string> = {
  class: 'bg-sky-500',
  trial: 'bg-teal-500',
  makeup: 'bg-orange-500',
  task: 'bg-amber-400',
  meeting: 'bg-indigo-500',
  event: 'bg-purple-500',
  follow_up: 'bg-amber-400',
}

const chip = 'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition'
const chipOn = 'border-[#fc0c97] bg-[#fff1f8] text-[#be185d]'
const chipOff = 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'

// The Calendar's filters, the same for the day list and the month / week / agenda calendar.
export function CalendarFilterBar({ filter, onChange, people, teams, canPickPeople, kinds, showClasses }: CalendarFilterBarProps) {
  const set = (change: Partial<CalendarFilter>) => onChange({ ...filter, ...change })
  const available = kinds ? CALENDAR_KINDS.filter((kind) => kinds.includes(kind.key)) : CALENDAR_KINDS
  const allKinds = filter.kinds.length === available.length

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Calendar filters">
      <button
        type="button"
        aria-pressed={filter.mine}
        onClick={() => set({ mine: !filter.mine })}
        className={cn(chip, filter.mine ? chipOn : chipOff)}
      >
        <User size={13} weight={filter.mine ? 'fill' : 'regular'} aria-hidden="true" />
        Only mine
      </button>

      {canPickPeople && (
        <>
          <select
            aria-label="Filter by team"
            value={filter.teamId ?? ''}
            disabled={filter.mine || teams.length === 0}
            title={teams.length === 0 ? 'No teams yet (Admin > Teams)' : undefined}
            onChange={(event) => set({ teamId: event.target.value ? Number(event.target.value) : null })}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-50"
          >
            <option value="">{teams.length === 0 ? 'No teams yet' : 'All teams'}</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <PeoplePicker people={people} picked={filter.personIds} disabled={filter.mine} onChange={(personIds) => set({ personIds })} />
        </>
      )}

      <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden="true" />

      {/* A phone keeps the kinds on one line that scrolls sideways. */}
      <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-0.5 max-sm:w-full sm:flex-wrap" role="group" aria-label="Kinds shown">
        {available.map((kind) => {
          const on = filter.kinds.includes(kind.key)
          return (
            <button
              key={kind.key}
              type="button"
              aria-pressed={on}
              onClick={() =>
                set({
                  // From "everything", a click shows only that kind; then clicks add or take kinds away.
                  kinds: allKinds ? [kind.key] : on ? filter.kinds.filter((key) => key !== kind.key) : [...filter.kinds, kind.key],
                })
              }
              className={cn(chip, on && !allKinds ? chipOn : chipOff, allKinds && 'text-slate-700')}
            >
              <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', KIND_DOT[kind.key])} />
              {kind.label}
            </button>
          )
        })}
        {!allKinds && (
          <button type="button" onClick={() => set({ kinds: available.map((kind) => kind.key) })} className={cn(chip, chipOff)}>
            All kinds
          </button>
        )}
        {showClasses && (
          <button
            type="button"
            aria-pressed={showClasses.on}
            onClick={() => showClasses.onChange(!showClasses.on)}
            className={cn(chip, showClasses.on ? chipOn : chipOff)}
          >
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-sky-500" />
            Show classes
          </button>
        )}
      </div>

      {isFiltered(filter, available.map((kind) => kind.key)) && (
        <button type="button" onClick={() => onChange(defaultCalendarFilter())} className="text-xs font-semibold text-[#be185d] hover:underline">
          Clear filters
        </button>
      )}
    </div>
  )
}

function PeoplePicker({
  people,
  picked,
  disabled,
  onChange,
}: {
  people: { id: number; name: string }[]
  picked: number[]
  disabled: boolean
  onChange: (ids: number[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const shown = people.filter((person) => person.name.toLowerCase().includes(query.trim().toLowerCase()))
  const label =
    picked.length === 0
      ? 'Everyone'
      : picked.length === 1
        ? people.find((person) => person.id === picked[0])?.name ?? '1 person'
        : `${picked.length} people`

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(chip, picked.length > 0 && !disabled ? chipOn : chipOff, 'disabled:opacity-50')}
      >
        People: {label}
        <CaretDown size={11} aria-hidden="true" />
      </button>
      {open && (
        <div role="dialog" aria-label="Pick people" className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <label className="mb-1 flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1">
            <MagnifyingGlass size={14} className="text-slate-400" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a teacher or staff"
              aria-label="Find a teacher or staff"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <ul className="max-h-64 overflow-y-auto">
            {shown.map((person) => (
              <li key={person.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={picked.includes(person.id)}
                    onChange={(event) => onChange(event.target.checked ? [...picked, person.id] : picked.filter((id) => id !== person.id))}
                    className="h-4 w-4 accent-[#fc0c97]"
                  />
                  {person.name}
                </label>
              </li>
            ))}
            {shown.length === 0 && <li className="px-2 py-2 text-sm text-slate-500">Nobody by that name.</li>}
          </ul>
          {picked.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-lg px-2 py-1 text-left text-xs font-semibold text-[#be185d] hover:bg-[#fff1f8]">
              Everyone
            </button>
          )}
        </div>
      )}
    </div>
  )
}
