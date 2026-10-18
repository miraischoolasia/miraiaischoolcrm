import { useEffect, useState } from 'react'
import { HandWaving, MagnifyingGlass, NotePencil, X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import type { Room } from '../../lib/zoomRoom'
import type { RewardPreset } from '../../lib/rewards'
import type { StudentBackground } from '../../lib/studentBackground'
import type { ZoomCheck } from '../../lib/zoomChecks'
import { BIG_CLASS, filterGrid, gridCounts, shortName, type GridFilter } from '../../lib/gridFilters'
import { StudentAvatar } from '../StudentAvatar'

export type GridChild = {
  studentId: number
  name: string
  state: 'here' | 'waiting' | 'left' | 'not_yet'
  late: boolean
  dropped: boolean
  // The question now on screen: null when none is out.
  answer: 'right' | 'wrong' | 'pending' | 'none' | null
  points: number
  note: string | null
  picked: boolean
  background: StudentBackground | null
  // When the parent was reminded in this lesson.
  remindedAt: string | null
  // Not in Zoom this long after the start: the parent may be reminded.
  canRemind: boolean
  // Points just given, shown on the tile for a moment.
  flash?: number | null
  // The family's latest Zoom check before class.
  zoomCheck?: ZoomCheck | null
}

// Every child in the lesson as one tile: in Zoom or not, late, the question
// now (answered or not), points this lesson, and a note mark.
export function gridChildren(input: {
  room: Room
  answers: Map<number, 'correct' | 'wrong' | 'pending'> | null
  points: Map<number, number>
  notes: Map<number, string>
  pickedId: number | null
  backgrounds?: Map<number, StudentBackground>
  reminders?: Map<number, string>
  remindFrom?: boolean
  flashes?: Map<number, number>
  zoomChecks?: Map<number, ZoomCheck>
}): GridChild[] {
  const { room, answers, points, notes, pickedId, backgrounds, reminders, remindFrom = false, flashes, zoomChecks } = input
  const make = (child: { studentId: number; name: string; late: boolean; dropped: boolean }, state: GridChild['state']): GridChild => {
    const result = answers?.get(child.studentId)
    return {
      studentId: child.studentId,
      name: child.name,
      state,
      late: child.late,
      dropped: child.dropped,
      answer: answers === null ? null : result === 'correct' ? 'right' : result === 'wrong' ? 'wrong' : result === 'pending' ? 'pending' : 'none',
      points: points.get(child.studentId) ?? 0,
      note: notes.get(child.studentId) ?? null,
      picked: pickedId === child.studentId,
      background: backgrounds?.get(child.studentId) ?? null,
      remindedAt: reminders?.get(child.studentId) ?? null,
      canRemind: remindFrom && (state === 'not_yet' || state === 'left'),
      flash: flashes?.get(child.studentId) ?? null,
      zoomCheck: zoomChecks?.get(child.studentId) ?? null,
    }
  }
  // Children in the waiting room are in none of the other lists.
  const waiting = room.waiting.flatMap((row) =>
    row.studentId === null ? [] : [make({ studentId: row.studentId, name: row.name, late: false, dropped: false }, 'waiting')],
  )
  const waitingIds = new Set(waiting.map((child) => child.studentId))
  return [
    ...room.here.map((child) => make(child, 'here')),
    ...waiting,
    ...room.notYet.filter((child) => !waitingIds.has(child.studentId)).map((child) => make(child, 'not_yet')),
    ...room.left.filter((child) => !waitingIds.has(child.studentId)).map((child) => make(child, 'left')),
  ]
}

const stateText: Record<GridChild['state'], string> = {
  here: 'In Zoom',
  waiting: 'Waiting room',
  left: 'Left',
  not_yet: 'Not here yet',
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })
const dayOf = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })

type GridView = 'classroom' | 'big' | 'small'

const gridViews: { key: GridView; label: string }[] = [
  { key: 'classroom', label: 'Classroom' },
  { key: 'big', label: 'Big' },
  { key: 'small', label: 'Small' },
]

const answerText = { right: 'Right', wrong: 'Wrong', pending: 'To mark', none: 'Not answered' }

export function StudentGrid({
  items,
  presets,
  onGive,
  onSaveNote,
  onRemind,
  onStar,
}: {
  items: GridChild[]
  presets: RewardPreset[]
  onGive: (studentId: number, presetId: number) => Promise<string | null>
  onSaveNote: (studentId: number, note: string) => Promise<string | null>
  onRemind: (studentId: number) => Promise<string | null>
  // Star of the day: the child on the class screen's stage.
  onStar?: (studentId: number) => void
}) {
  const [openId, setOpenId] = useState<number | null>(null)
  const open = items.find((child) => child.studentId === openId) ?? null
  const big = items.length > BIG_CLASS
  const [filter, setFilter] = useState<GridFilter>(big ? 'attention' : 'all')
  // A class up to BIG_CLASS children starts as a classroom; bigger ones as small tiles.
  const [view, setView] = useState<GridView>(big ? 'small' : 'classroom')
  const [search, setSearch] = useState('')
  // A class that grows past the line (children added) switches once.
  const [wasBig, setWasBig] = useState(big)
  if (big !== wasBig) {
    setWasBig(big)
    setView(big ? 'small' : 'classroom')
    setFilter(big ? 'attention' : 'all')
  }

  const counts = gridCounts(items)
  const shown = filterGrid(items, filter, search)
  const hasQuestion = items.some((child) => child.answer !== null)
  const chips: { key: GridFilter; label: string; show: boolean }[] = [
    { key: 'attention', label: 'Needs you', show: true },
    { key: 'all', label: 'All', show: true },
    { key: 'here', label: 'In Zoom', show: true },
    { key: 'waiting', label: 'Waiting room', show: counts.waiting > 0 },
    { key: 'not_yet', label: 'Not here', show: counts.not_yet > 0 },
    { key: 'left', label: 'Left', show: counts.left > 0 },
    { key: 'not_answered', label: 'Not answered', show: hasQuestion },
    { key: 'to_mark', label: 'To mark', show: counts.to_mark > 0 },
    { key: 'notes', label: 'Notes', show: counts.notes > 0 },
  ]

  const select = (studentId: number) => setOpenId(studentId === openId ? null : studentId)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {chips
          .filter((chip) => chip.show)
          .map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-pressed={filter === chip.key && !search}
              onClick={() => {
                setSearch('')
                setFilter(chip.key)
              }}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-semibold transition',
                filter === chip.key && !search ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {chip.label} {counts[chip.key]}
            </button>
          ))}
        <label className="relative ml-auto min-w-[140px]">
          <MagnifyingGlass size={14} className="absolute left-2 top-2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a child"
            aria-label="Find a child"
            className="w-full rounded-full border border-slate-200 py-1 pl-7 pr-2 text-xs"
          />
        </label>
        <div role="radiogroup" aria-label="How the children are shown" className="flex overflow-hidden rounded-full border border-slate-200">
          {gridViews.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="radio"
              aria-checked={view === entry.key}
              onClick={() => setView(entry.key)}
              className={cn(
                'px-2.5 py-1 text-xs font-semibold transition',
                view === entry.key ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {open && <ChildPanel key={open.studentId} child={open} presets={presets} onGive={onGive} onSaveNote={onSaveNote} onRemind={onRemind} onStar={onStar} onClose={() => setOpenId(null)} />}

      {view === 'classroom' ? (
        <div className="rounded-2xl bg-amber-50/70 p-3">
          <div className="mx-auto mb-3 w-1/2 rounded-lg border border-slate-200 bg-white py-1 text-center text-xs font-semibold text-slate-500">
            Teacher · Board
          </div>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-x-2 gap-y-3">
            {shown.map((child) => (
              <li key={child.studentId}>
                <Seat child={child} open={child.studentId === openId} onSelect={() => select(child.studentId)} />
              </li>
            ))}
          </ul>
        </div>
      ) : view === 'small' ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-1">
          {shown.map((child) => (
            <li key={child.studentId}>
              <button
                type="button"
                onClick={() => select(child.studentId)}
                aria-pressed={child.studentId === openId}
                title={`${child.name} · ${stateText[child.state]}${child.answer ? ` · ${answerText[child.answer]}` : ''} · ${child.points} points`}
                className={cn(
                  'relative flex w-full items-center gap-1 rounded-lg border px-1.5 py-1 text-left text-xs transition hover:brightness-95',
                  tileTone(child),
                  child.picked && 'ring-2 ring-[#fc0c97]',
                  child.studentId === openId && 'ring-2 ring-sky-400',
                )}
              >
                <span className="min-w-0 flex-1 truncate font-semibold">{shortName(child.name)}</span>
                {child.note && <NotePencil size={11} className="shrink-0" aria-label="Has a note" />}
                {child.points > 0 && <span className="shrink-0 text-[11px] font-semibold">{child.points}</span>}
                {child.flash ? <PointsFlash points={child.flash} /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
          {shown.map((child) => (
            <li key={child.studentId}>
              <button
                type="button"
                onClick={() => select(child.studentId)}
                aria-pressed={child.studentId === openId}
                className={cn(
                  'relative w-full rounded-xl border bg-white px-3 py-2 text-left transition hover:bg-slate-50',
                  child.state === 'here' && !child.late && 'border-emerald-300',
                  child.state === 'here' && child.late && 'border-amber-300',
                  child.state === 'waiting' && 'border-amber-300 bg-amber-50',
                  child.state === 'not_yet' && 'border-rose-200',
                  child.state === 'left' && 'border-slate-200 opacity-80',
                  child.picked && 'ring-2 ring-[#fc0c97]',
                  child.studentId === openId && 'ring-2 ring-sky-400',
                )}
              >
                <span className="flex items-center justify-between gap-1">
                  <span className="truncate text-sm font-semibold text-slate-900">{child.name}</span>
                  {child.note && <NotePencil size={14} className="shrink-0 text-sky-600" aria-label="Has a note" />}
                </span>
                <span
                  className={cn(
                    'block text-xs',
                    child.state === 'here' ? (child.late ? 'text-amber-700' : 'text-emerald-700') : child.state === 'waiting' ? 'text-amber-700' : child.state === 'not_yet' ? 'text-rose-700' : 'text-slate-500',
                  )}
                >
                  {stateText[child.state]}
                  {child.state === 'here' && child.late ? ' · late' : ''}
                  {child.state === 'left' && child.dropped ? ' · dropped' : ''}
                  {child.remindedAt ? ` · reminded ${timeOf(child.remindedAt)}` : ''}
                {child.zoomCheck && !child.zoomCheck.ok ? ' · ⚠ Zoom check failed' : ''}
                </span>
                {child.background && (child.background.lowOnLessons || child.background.expiringSoon) && (
                  <span className="block truncate text-[11px] font-semibold text-amber-700">
                    {child.background.lowOnLessons ? `${child.background.lessonsLeft} lessons left` : ''}
                    {child.background.lowOnLessons && child.background.expiringSoon ? ' · ' : ''}
                    {child.background.expiringSoon && child.background.expiresOn ? `ends ${dayOf(child.background.expiresOn)}` : ''}
                  </span>
                )}
                <span className="mt-0.5 flex items-center justify-between text-xs">
                  {child.answer ? (
                    <span
                      className={cn(
                        child.answer === 'right' && 'text-emerald-700',
                        child.answer === 'wrong' && 'text-rose-700',
                        child.answer === 'pending' && 'text-amber-700',
                        child.answer === 'none' && 'text-slate-400',
                      )}
                    >
                      {answerText[child.answer]}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="font-semibold text-amber-600">⭐ {child.points}</span>
                </span>
                {child.flash ? <PointsFlash points={child.flash} /> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No children in this lesson.</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-slate-500">{search ? 'No child by that name.' : filter === 'attention' ? 'Everyone is fine right now.' : 'Nobody here.'}</p>
      ) : null}
      {!search && filter === 'attention' && counts.all > shown.length && (
        <button type="button" onClick={() => setFilter('all')} className="text-xs font-semibold text-slate-600 underline underline-offset-2">
          {counts.all - shown.length} more {counts.all - shown.length === 1 ? 'child is' : 'children are'} fine · show everyone
        </button>
      )}
    </div>
  )
}

// A desk in the classroom view: the child's face ringed in the colour of
// where they are, their desk and short name, and marks above the head
// (right / wrong / to mark, points just given, a note, a failed Zoom check).
function Seat({ child, open, onSelect }: { child: GridChild; open: boolean; onSelect: () => void }) {
  const ring =
    child.state === 'here'
      ? child.late
        ? 'ring-amber-400'
        : 'ring-emerald-500'
      : child.state === 'waiting'
        ? 'ring-amber-400'
        : 'ring-slate-300'
  const mark =
    child.answer === 'right'
      ? { text: '✓', className: 'bg-emerald-100 text-emerald-800' }
      : child.answer === 'wrong'
        ? { text: '✗', className: 'bg-rose-100 text-rose-800' }
        : child.answer === 'pending'
          ? { text: '…', className: 'bg-amber-100 text-amber-800' }
          : null
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={open}
      title={`${child.name} · ${stateText[child.state]}${child.answer ? ` · ${answerText[child.answer]}` : ''} · ${child.points} points`}
      className={cn(
        'relative flex w-full flex-col items-center gap-1 rounded-xl px-1 pb-1 pt-2 transition hover:bg-white/80',
        open && 'bg-white shadow-sm ring-2 ring-sky-400',
        child.picked && 'bg-pink-50 ring-2 ring-[#fc0c97]',
      )}
    >
      <span className={cn('rounded-full ring-[3px] ring-offset-1', ring)}>
        <StudentAvatar id={child.studentId} name={child.name} size={44} dim={child.state === 'not_yet' || child.state === 'left'} />
      </span>
      <span aria-hidden="true" className="h-2 w-16 rounded-sm border border-amber-300 bg-amber-200" />
      <span className="w-full truncate text-center text-xs font-semibold text-slate-800">{shortName(child.name)}</span>
      <span className="flex h-4 items-center gap-1 text-[11px] text-slate-500">
        {child.state === 'waiting' ? 'waiting' : child.state === 'not_yet' ? 'not here' : child.state === 'left' ? 'left' : child.late ? 'late' : ''}
        {child.points > 0 && <span className="font-semibold text-amber-600">⭐{child.points}</span>}
      </span>
      <span className="absolute right-1 top-0 flex gap-0.5">
        {mark && <span className={cn('rounded-full px-1.5 text-[11px] font-bold', mark.className)}>{mark.text}</span>}
        {child.note && <span className="rounded-full bg-violet-100 px-1 text-[11px]" aria-label="Has a note">📝</span>}
        {child.zoomCheck && !child.zoomCheck.ok && <span className="rounded-full bg-amber-100 px-1 text-[11px]" aria-label="Zoom check failed">⚠</span>}
      </span>
      {child.flash ? <PointsFlash points={child.flash} /> : null}
    </button>
  )
}

// "+5" popping on a tile when points are given.
function PointsFlash({ points }: { points: number }) {
  return (
    <span aria-live="polite" className="pointer-events-none absolute -right-1 -top-2 animate-bounce rounded-full bg-amber-400 px-1.5 text-xs font-bold text-white shadow">
      +{points}
    </span>
  )
}

// Small tiles: green = in and right (or no question), grey = in but not
// answered, amber = waiting / late / to mark, red = not here or wrong.
function tileTone(child: GridChild) {
  if (child.state === 'not_yet') return 'border-rose-200 bg-rose-50 text-rose-800'
  if (child.state === 'left') return 'border-slate-200 bg-slate-100 text-slate-500'
  if (child.state === 'waiting' || child.answer === 'pending' || child.late) return 'border-amber-200 bg-amber-50 text-amber-900'
  if (child.answer === 'wrong') return 'border-rose-200 bg-white text-rose-700'
  if (child.answer === 'none') return 'border-slate-200 bg-white text-slate-600'
  return 'border-emerald-200 bg-emerald-50 text-emerald-900'
}

function ChildPanel({
  child,
  presets,
  onGive,
  onSaveNote,
  onRemind,
  onStar,
  onClose,
}: {
  child: GridChild
  presets: RewardPreset[]
  onGive: (studentId: number, presetId: number) => Promise<string | null>
  onSaveNote: (studentId: number, note: string) => Promise<string | null>
  onRemind: (studentId: number) => Promise<string | null>
  onStar?: (studentId: number) => void
  onClose: () => void
}) {
  const [note, setNote] = useState(child.note ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => setNote(child.note ?? ''), [child.note])

  async function give(preset: RewardPreset) {
    setBusy(true)
    const problem = await onGive(child.studentId, preset.id)
    setBusy(false)
    setMessage(problem ?? `+${preset.points} for ${child.name}`)
  }

  async function remind() {
    setBusy(true)
    const problem = await onRemind(child.studentId)
    setBusy(false)
    setMessage(problem ?? 'Reminder sent to the parent')
  }

  async function save() {
    setBusy(true)
    const problem = await onSaveNote(child.studentId, note)
    setBusy(false)
    setMessage(problem ?? 'Note saved')
  }

  return (
    <section aria-label={`${child.name}`} className="rounded-2xl border border-sky-200 bg-sky-50/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <HandWaving size={16} className="text-sky-600" aria-hidden="true" />
          {child.name}
        </h4>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-slate-500 hover:bg-white">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      {child.background && (
        <p className="mt-1 text-xs text-slate-600">
          {child.background.lessonsLeft !== null ? `${child.background.lessonsLeft} lessons left` : ''}
          {child.background.expiresOn ? ` · package ends ${dayOf(child.background.expiresOn)}` : ''}
        </p>
      )}
      <p className="mt-1 text-xs text-slate-600">
        {child.zoomCheck
          ? child.zoomCheck.ok
            ? `Zoom check: worked on ${dayOf(child.zoomCheck.checkedAt.slice(0, 10))}${child.zoomCheck.platform ? ` (${child.zoomCheck.platform})` : ''}`
            : `Zoom check: did NOT work on ${dayOf(child.zoomCheck.checkedAt.slice(0, 10))}${child.zoomCheck.platform ? ` (${child.zoomCheck.platform})` : ''}`
          : 'Zoom check: not done yet'}
      </p>
      {child.background?.lastRemark && (
        <p className="mt-1 line-clamp-4 rounded-lg bg-white px-2 py-1 text-xs text-slate-700" title={child.background.lastRemark}>
          <span className="font-semibold">Last lesson ({dayOf(child.background.lastRemarkDate ?? '')}):</span> {child.background.lastRemark}
        </p>
      )}
      {child.canRemind && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void remind()}
            className="rounded-xl border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
          >
            {child.remindedAt ? 'Remind the parent again' : 'Remind the parent on WhatsApp'}
          </button>
          {child.remindedAt && <span className="text-xs text-slate-500">Reminded at {timeOf(child.remindedAt)}</span>}
        </div>
      )}
      {onStar && (
        <button
          type="button"
          onClick={() => {
            onStar(child.studentId)
            setMessage(`${child.name} is on the class screen's stage`)
          }}
          className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
        >
          ⭐ Star of the day
        </button>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets
          .filter((preset) => preset.isActive)
          .map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={busy}
              onClick={() => void give(preset)}
              className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-amber-50 disabled:opacity-50"
            >
              {preset.emoji ? `${preset.emoji} ` : ''}
              {preset.label} +{preset.points}
            </button>
          ))}
      </div>
      <label className="mt-2 block">
        <span className="text-xs font-semibold text-slate-700">Note (goes into the lesson remark when you take attendance)</span>
        <textarea
          rows={2}
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={`How is ${child.name} doing today?`}
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
      </label>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-600" aria-live="polite">
          {message}
        </span>
        <button
          type="button"
          disabled={busy || note.trim() === (child.note ?? '').trim()}
          onClick={() => void save()}
          className="rounded-xl bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          Save note
        </button>
      </div>
    </section>
  )
}
