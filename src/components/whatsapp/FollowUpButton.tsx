import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type RefObject } from 'react'
import { createPortal } from 'react-dom'
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

export type FollowUpSummary = { count: number; late: boolean; ready: boolean }

// Given by the message box, whose "+" menu has the Follow up row: the button then shows no bell of its own,
// opens its card each time `asked` goes up, and says how many follow-ups are set (for the row's dot).
// The card is then put on top of the whole page, next to `anchor` (the message box), so no box around
// the chat can cut it off.
export type FollowUpHost = { asked: number; onSummary: (summary: FollowUpSummary) => void; anchor: RefObject<HTMLElement | null> }
export const FollowUpHostContext = createContext<FollowUpHost | null>(null)

const EDGE = 8

// Where the card goes on the screen: just above the message box when it fits there, else just below it,
// else as high as it can be while staying on screen. Never wider or taller than the window; a card that
// is too tall scrolls inside.
export function placeFollowUpCard(
  box: { top: number; bottom: number; left: number },
  card: { width: number; height: number },
  screen: { width: number; height: number },
) {
  const maxHeight = Math.max(0, screen.height - EDGE * 2)
  const shown = Math.min(card.height, maxHeight)
  const above = box.top - EDGE - shown
  const below = box.bottom + EDGE
  const wanted = above >= EDGE ? above : below + shown <= screen.height - EDGE ? below : EDGE
  // The box itself can be scrolled partly off the screen; the card still stays on it.
  const top = Math.max(EDGE, Math.min(wanted, screen.height - EDGE - shown))
  const left = Math.max(EDGE, Math.min(box.left + 12, screen.width - EDGE - card.width))
  return { top, left, maxHeight }
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
  const card = useRef<HTMLDivElement>(null)
  const cardBody = useRef<HTMLDivElement>(null)
  const host = useContext(FollowUpHostContext)
  const [place, setPlace] = useState<CSSProperties | null>(null)

  const mine = useMemo(() => openFollowUps(items, leadId), [items, leadId])
  const choices = useMemo(() => (open ? followUpChoices(now()) : []), [open, now])
  const nameOf = (id: number | null) => people.find((person) => person.id === id)?.name ?? null
  const hasLate = mine.some((entry) => followUpState(entry, now()) === 'late')

  // Closes when something else is pressed, or on Escape.
  useEffect(() => {
    if (!open) {
      return undefined
    }
    function close(event: MouseEvent) {
      const target = event.target as Node
      if (box.current && !box.current.contains(target) && !card.current?.contains(target)) {
        setOpen(false)
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  // The message box's Follow up row was pressed.
  const asked = host?.asked ?? 0
  const lastAsked = useRef(asked)
  useEffect(() => {
    if (asked !== lastAsked.current) {
      lastAsked.current = asked
      openPanel()
    }
  })

  // Finds a place on the screen for the card, again when the window changes size or the page scrolls.
  const anchor = host?.anchor
  useLayoutEffect(() => {
    if (!open || !anchor) {
      setPlace(null)
      return undefined
    }
    function measure() {
      const element = card.current
      const body = cardBody.current
      const near = anchor?.current
      if (!element || !body || !near) {
        return
      }
      // The whole card's height, as if nothing inside had to scroll.
      const height = element.offsetHeight - body.clientHeight + body.scrollHeight
      const spot = placeFollowUpCard(near.getBoundingClientRect(), { width: element.offsetWidth, height }, { width: window.innerWidth, height: window.innerHeight })
      setPlace((current) =>
        current && current.top === spot.top && current.left === spot.left && current.maxHeight === spot.maxHeight ? current : spot,
      )
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, anchor, mine.length, problem, busy])

  const report = host?.onSummary
  useEffect(() => {
    report?.({ count: mine.length, late: hasLate, ready: leadId !== null })
  }, [report, mine.length, hasLate, leadId])

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

  // In the message box the card sits on top of the page (it is measured unseen first); on its own it opens above its bell.
  const inPlace = (shown: ReactElement) => (host ? createPortal(shown, document.body) : shown)

  return (
    <div ref={box} className={host ? undefined : 'relative'}>
      {!host && (
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
      )}

      {open && inPlace(
        <div
          ref={card}
          role="dialog"
          aria-label="Follow up"
          style={host ? (place ?? { top: 0, left: 0, visibility: 'hidden' }) : undefined}
          className={cn(
            // The title and the close button stay put; the rest scrolls when the card is too tall for the window.
            'flex w-[300px] flex-col gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg',
            host ? 'fixed z-50 max-w-[calc(100vw-1rem)]' : 'absolute bottom-full right-0 z-30 mb-2 max-w-[calc(100vw-2rem)]',
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900">Follow up</p>
              <p className="text-xs text-slate-500">Get a reminder to write to {leadName || 'this lead'} again.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100">
              <X size={14} />
            </button>
          </div>

          <div ref={cardBody} className="min-h-0 space-y-3 overflow-y-auto">
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
