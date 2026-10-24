import { useMemo, useState } from 'react'
import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { cn } from '../../lib/cn'
import type { Lesson, TargetLesson } from '../../lib/lessonSeats'
import type { LessonSeat } from '../../types/domain'

export type LessonSeatInput = {
  kind: 'change' | 'replacement'
  fromClassroomId: number
  fromDate: string
  toClassroomId: number
  toDate: string
  note: string | null
}

type LessonSeatModalProps = {
  studentName: string
  // Their own coming lessons (Change class) and lessons that have passed (Replacement), with what was recorded.
  upcoming: Lesson[]
  past: { lesson: Lesson; statusLabel: string | null }[]
  // The lessons they could sit in.
  targets: TargetLesson[]
  // The seats they have now (coming ones, and recent ones).
  seats: LessonSeat[]
  classNameOf: (classroomId: number) => string
  teacherNameOf: (teacherId: number) => string
  canEdit: boolean
  // Resolve to an error message, or null when it worked.
  onBook: (input: LessonSeatInput) => Promise<string | null>
  onUndo: (seatId: number) => Promise<string | null>
  onClose: () => void
}

const dayText = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}
const timeText = (lesson: Pick<Lesson, 'startTime' | 'endTime'>) => `${lesson.startTime.slice(0, 5)}-${lesson.endTime.slice(0, 5)}`
const lessonKey = (lesson: Lesson) => `${lesson.classroomId}|${lesson.date}`

const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97]'

// Student > Change class / Replacement. Change class: before the lesson (nothing taken for them there yet), the
// child leaves the old lesson that day and sits in another class's lesson. Replacement: after the lesson, the old
// lesson keeps what was recorded and the child sits in another lesson as a make-up. After a booking the lesson list
// is put away behind "Book another".
export function LessonSeatModal({
  studentName,
  upcoming,
  past,
  targets,
  seats,
  classNameOf,
  teacherNameOf,
  canEdit,
  onBook,
  onUndo,
  onClose,
}: LessonSeatModalProps) {
  const [kind, setKind] = useState<'change' | 'replacement'>('change')
  const [picking, setPicking] = useState(seats.length === 0)
  const [fromKey, setFromKey] = useState('')
  const [toKey, setToKey] = useState('')
  const [search, setSearch] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ownLessons = useMemo(
    () => (kind === 'change' ? upcoming.map((lesson) => ({ lesson, statusLabel: null as string | null })) : past),
    [kind, upcoming, past],
  )
  const from = ownLessons.find((entry) => lessonKey(entry.lesson) === fromKey)?.lesson ?? null
  const query = search.trim().toLowerCase()
  const shownTargets = targets.filter(
    (target) => query === '' || target.className.toLowerCase().includes(query) || dayText(target.date).toLowerCase().includes(query),
  )
  const to = targets.find((target) => lessonKey(target) === toKey) ?? null

  function switchKind(next: 'change' | 'replacement') {
    setKind(next)
    setFromKey('')
    setToKey('')
    setError(null)
  }

  async function book() {
    if (!from || !to) {
      return
    }
    setBusy(true)
    setError(null)
    const failure = await onBook({
      kind,
      fromClassroomId: from.classroomId,
      fromDate: from.date,
      toClassroomId: to.classroomId,
      toDate: to.date,
      note: note.trim() || null,
    })
    setBusy(false)
    if (failure) {
      setError(failure)
      return
    }
    setPicking(false)
    setFromKey('')
    setToKey('')
    setNote('')
    setSearch('')
  }

  async function undo(seatId: number) {
    setBusy(true)
    setError(null)
    const failure = await onUndo(seatId)
    setBusy(false)
    if (failure) {
      setError(failure)
    }
  }

  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-5">
        <div>
          <div className="text-sm font-medium text-[#be185d]">Lessons</div>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Change class or replacement</h2>
          <p className="mt-1 text-sm text-slate-500">{studentName}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-5 px-6 py-5">
        {seats.length > 0 && (
          <section aria-label="Booked lessons" className="space-y-2">
            {seats.map((seat) => (
              <div
                key={seat.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm"
              >
                <div className="text-slate-700">
                  <span className="font-semibold text-slate-900">{seat.kind === 'change' ? 'Change class' : 'Replacement'}</span>
                  {': '}
                  {dayText(seat.fromDate)} {classNameOf(seat.fromClassroomId)} → {dayText(seat.toDate)} {classNameOf(seat.toClassroomId)}
                </div>
                {canEdit && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void undo(seat.id)}
                    className="rounded-lg border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    Undo
                  </button>
                )}
              </div>
            ))}
          </section>
        )}

        {canEdit && !picking && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Book another
          </button>
        )}

        {canEdit && picking && (
          <section aria-label="Book a lesson" className="space-y-4">
            <div role="tablist" className="flex gap-2">
              {(
                [
                  { key: 'change', label: 'Change class' },
                  { key: 'replacement', label: 'Replacement' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={kind === tab.key}
                  onClick={() => switchKind(tab.key)}
                  className={cn(
                    'rounded-xl px-4 py-2 text-sm font-semibold',
                    kind === tab.key ? 'bg-[#fc0c97] text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {kind === 'change'
                ? 'Before the lesson: the child leaves their own lesson that day and sits in another class instead.'
                : 'After the lesson: their own lesson keeps what was recorded, and they sit in another lesson as a make-up.'}
            </p>

            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">{kind === 'change' ? 'Lesson to change' : 'Lesson they missed'}</span>
              <select value={fromKey} onChange={(event) => { setFromKey(event.target.value); setError(null) }} className={field} aria-label="Their lesson">
                <option value="">Choose</option>
                {ownLessons.map(({ lesson, statusLabel }) => (
                  <option key={lessonKey(lesson)} value={lessonKey(lesson)}>
                    {dayText(lesson.date)} {timeText(lesson)} · {lesson.className}
                    {statusLabel ? ` · ${statusLabel}` : ''}
                  </option>
                ))}
              </select>
              {ownLessons.length === 0 && (
                <span className="text-xs text-slate-500">
                  {kind === 'change' ? 'No coming lessons in the next weeks.' : 'No past lessons found.'}
                </span>
              )}
            </label>

            {from && (
              <div className="space-y-2">
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find a class or day"
                  aria-label="Find a lesson"
                  className={field}
                />
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2" role="radiogroup" aria-label="Lesson to sit in">
                  {shownTargets.length === 0 && <div className="px-2 py-3 text-sm text-slate-500">No lessons found.</div>}
                  {shownTargets.map((target) => (
                    <label
                      key={lessonKey(target)}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-50',
                        toKey === lessonKey(target) && 'bg-pink-50',
                      )}
                    >
                      <input
                        type="radio"
                        name="seat-target"
                        aria-label={`${dayText(target.date)} ${timeText(target)} ${target.className}`}
                        checked={toKey === lessonKey(target)}
                        onChange={() => setToKey(lessonKey(target))}
                      />
                      <span className="flex-1 text-slate-700">
                        <span className="font-semibold text-slate-900">{dayText(target.date)}</span> {timeText(target)} · {target.className}
                        <span className="text-slate-500"> · {teacherNameOf(target.teacherId)} · {target.children} {target.children === 1 ? 'child' : 'children'}</span>
                      </span>
                      {target.sameAgeGroup && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Same age group</span>
                      )}
                    </label>
                  ))}
                </div>
                <input
                  type="text"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Note (optional)"
                  aria-label="Note"
                  className={field}
                />
              </div>
            )}

            <button
              type="button"
              disabled={busy || !from || !to}
              onClick={() => void book()}
              className="rounded-xl bg-[#fc0c97] px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {kind === 'change' ? 'Change class' : 'Book replacement'}
            </button>
          </section>
        )}

        {!canEdit && <p className="text-sm text-slate-500">Your account can look at these lessons but not change them.</p>}
        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
