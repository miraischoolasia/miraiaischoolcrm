import { useEffect, useMemo, useRef, useState } from 'react'
import { BellRinging, Check, Trash, X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import type { CalendarItem, CalendarItemDraft } from '../../lib/calendarItems'
import {
  describeFollowUp,
  followUpChoices,
  followUpDraft,
  followUpError,
  followUpState,
  openFollowUps,
} from '../../lib/followUps'

export type FollowUpPerson = { id: number; name: string }

type FollowUpButtonProps = {
  leadId: number | null
  leadName: string
  // Every calendar item the page knows; this picks the lead's own follow-ups out of them.
  items: CalendarItem[]
  people: FollowUpPerson[]
  // The signed-in person, who is reminded unless another is picked.
  meId: number | null
  // Each resolves to an error message, or null when it worked.
  onSave: (draft: CalendarItemDraft) => Promise<string | null>
  onDone: (id: number) => Promise<string | null>
  onRemove: (id: number) => Promise<string | null>
  // The clock, so a test can say what time it is.
  now?: () => Date
}

const FIELD =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-[#fc0c97]'

// The Follow up button beside the message box: pick a day and a time (the date field opens a calendar) and the
// team is reminded to write to this lead again. A follow-up is a task on the calendar tied to the lead.
export function FollowUpButton({ leadId, leadName, items, people, meId, onSave, onDone, onRemove, now = () => new Date() }: FollowUpButtonProps) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')
  const [assigneeId, setAssigneeId] = useState<number | null>(meId)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)

  const mine = useMemo(() => openFollowUps(items, leadId), [items, leadId])
  const choices = useMemo(() => (open ? followUpChoices(now()) : []), [open, now])
  const nameOf = (id: number | null) => people.find((person) => person.id === id)?.name ?? null
  const hasLate = mine.some((entry) => followUpState(entry, now()) === 'late')

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

  function openPanel() {
    setDate('')
    setTime('')
    setNote('')
    setAssigneeId(meId)
    setProblem(null)
    setOpen(true)
  }

  async function save() {
    const wrong = followUpError(date, time, now())
    if (wrong || leadId === null) {
      setProblem(wrong ?? 'Save this chat as a lead first.')
      return
    }
    setBusy(true)
    setProblem(null)
    const failed = await onSave(followUpDraft({ leadName, date, time, note, assigneeId, leadId }))
    setBusy(false)
    if (failed) {
      setProblem(failed)
      return
    }
    setDate('')
    setTime('')
    setNote('')
  }

  async function act(run: () => Promise<string | null>) {
    setProblem(null)
    const failed = await run()
    if (failed) {
      setProblem(failed)
    }
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        disabled={leadId === null}
        aria-label="Follow up: set a day and time to be reminded"
        title={leadId === null ? 'Save this chat as a lead first, then you can set a follow-up' : 'Follow up: set a day and time to be reminded'}
        aria-expanded={open}
        className={cn(
          'relative rounded-lg border p-1.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40',
          mine.length > 0 ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'border-slate-200 text-slate-600',
        )}
      >
        <BellRinging size={16} />
        {mine.length > 0 && (
          <span
            aria-hidden="true"
            className={cn('absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-white', hasLate ? 'bg-red-500' : 'bg-amber-500')}
          />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Follow up"
          className="absolute bottom-full right-0 z-30 mb-2 w-[300px] max-w-[calc(100vw-2rem)] space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900">Follow up</p>
              <p className="text-xs text-slate-500">Get a reminder to write to {leadName || 'this lead'} again.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100">
              <X size={14} />
            </button>
          </div>

          {mine.length > 0 && (
            <ul className="space-y-1.5" aria-label="Follow-ups set">
              {mine.map((entry) => {
                const state = followUpState(entry, now())
                return (
                  <li
                    key={entry.id}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5',
                      state === 'late' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{describeFollowUp(entry, now())}{state === 'late' ? ' · late' : ''}</span>
                      <span className="block truncate text-xs opacity-80">
                        {nameOf(entry.assigneeId) ?? 'No one'}
                        {entry.notes ? ` · ${entry.notes}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-0.5">
                      <button
                        type="button"
                        onClick={() => void act(() => onDone(entry.id))}
                        aria-label={`Done: ${describeFollowUp(entry, now())}`}
                        title="Done"
                        className="rounded p-1 hover:bg-white/70"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void act(() => onRemove(entry.id))}
                        aria-label={`Remove: ${describeFollowUp(entry, now())}`}
                        title="Remove"
                        className="rounded p-1 hover:bg-white/70"
                      >
                        <Trash size={16} />
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick choices">
              {choices.map((choice) => (
                <button
                  key={choice.key}
                  type="button"
                  onClick={() => {
                    setDate(choice.date)
                    setTime(choice.time)
                    setProblem(null)
                  }}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-medium',
                    date === choice.date && time === choice.time
                      ? 'border-[#fc0c97] bg-pink-50 text-[#be185d]'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50',
                  )}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-[1fr_6.5rem] gap-2">
              <label className="block">
                <span className="text-xs text-slate-600">Day</span>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={FIELD} />
              </label>
              <label className="block">
                <span className="text-xs text-slate-600">Time</span>
                <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className={FIELD} />
              </label>
            </div>
            <label className="block">
              <span className="text-xs text-slate-600">Remind</span>
              <select
                value={assigneeId ?? ''}
                onChange={(event) => setAssigneeId(event.target.value ? Number(event.target.value) : null)}
                className={FIELD}
              >
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.id === meId ? `${person.name} (me)` : person.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">Note (optional)</span>
              <input
                type="text"
                value={note}
                maxLength={200}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. ask about the F4 timetable"
                className={FIELD}
              />
            </label>
          </div>

          {problem && (
            <p role="alert" className="text-xs text-red-600">
              {problem}
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="w-full rounded-lg bg-[#fc0c97] px-3 py-2 text-sm font-semibold text-white hover:bg-[#e00a87] disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Set the reminder'}
          </button>
        </div>
      )}
    </div>
  )
}

// A slim line under the chat's header with the next follow-up, so it is seen without opening the button.
export function FollowUpChip({ leadId, items, now = () => new Date() }: { leadId: number | null; items: CalendarItem[]; now?: () => Date }) {
  const next = openFollowUps(items, leadId)[0]
  if (!next) {
    return null
  }
  const late = followUpState(next, now()) === 'late'
  return (
    <p
      className={cn(
        'flex items-center gap-1.5 border-b px-4 py-1.5 text-xs font-medium',
        late ? 'border-red-100 bg-red-50 text-red-800' : 'border-amber-100 bg-amber-50 text-amber-900',
      )}
    >
      <BellRinging size={14} aria-hidden="true" />
      Follow up: {describeFollowUp(next, now())}
      {late ? ' (late)' : ''}
    </p>
  )
}
