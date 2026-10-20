import { useCallback, useEffect, useMemo, useState } from 'react'
import { Star } from '@phosphor-icons/react'
import { formatDate } from '../domain/studentStatus'
import { cn } from '../lib/cn'
import {
  awardPoints,
  fetchStudentPoints,
  levelFor,
  redeemPoints,
  totalPoints,
  undoneIds,
  undoPoints,
  type PointsEntry,
  type RewardLevel,
} from '../lib/rewards'

const kindLabels: Record<PointsEntry['kind'], string> = {
  attendance: 'Attendance',
  award: 'Reward',
  redeem: 'Redeemed',
  adjust: 'Adjustment',
  question: 'Class question',
  checkin: 'Daily check-in',
  task: 'Daily task',
  practice: 'Daily practice',
}

// A student's points: total, level and the way to the next one, and the
// history. With Students edit: give or redeem points outside a lesson.
export function PointsCard({
  studentId,
  levels,
  canManage = false,
}: {
  studentId: number
  levels: RewardLevel[]
  canManage?: boolean
}) {
  const [entries, setEntries] = useState<PointsEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [amount, setAmount] = useState(10)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(() => {
    fetchStudentPoints(studentId)
      .then(setEntries)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to load the points.'))
  }, [studentId])

  useEffect(load, [load])

  const total = useMemo(() => totalPoints(entries ?? []), [entries])
  const undone = useMemo(() => undoneIds(entries ?? []), [entries])
  const { current, next, progress } = levelFor(total, levels)
  const shown = showAll ? (entries ?? []) : (entries ?? []).slice(0, 8)
  const valid = Number.isInteger(amount) && amount >= 1 && amount <= 100000 && reason.trim() !== ''

  async function run(action: Promise<string | null>) {
    setBusy(true)
    setError(null)
    const failure = await action
    setBusy(false)
    if (failure) {
      setError(failure)
      return false
    }
    load()
    return true
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100">
            <Star size={22} weight="fill" className="text-amber-500" aria-hidden="true" />
          </span>
          <div>
            <div className="text-2xl font-bold text-slate-900">
              {entries === null ? '…' : total} <span className="text-sm font-semibold text-slate-500">points</span>
            </div>
            {current && <div className="text-sm font-semibold text-amber-700">{current.name}</div>}
          </div>
        </div>
        {next && (
          <div className="min-w-[10rem] flex-1 sm:max-w-xs">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Next: {next.name}</span>
              <span>{next.minPoints - total} to go</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-amber-400" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {canManage && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <input
            type="number"
            min={1}
            value={amount}
            aria-label="Points"
            onChange={(event) => setAmount(Number(event.target.value))}
            className="w-24 rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
          />
          <input
            type="text"
            value={reason}
            maxLength={120}
            placeholder="What for? (e.g. Sticker pack)"
            aria-label="Reason"
            onChange={(event) => setReason(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={!valid || busy || amount > 100}
            title={amount > 100 ? 'Give at most 100 at a time' : undefined}
            onClick={() =>
              void run(awardPoints({ studentIds: [studentId], points: amount, reason: reason.trim() })).then(
                (ok) => ok && setReason(''),
              )
            }
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Give
          </button>
          <button
            type="button"
            disabled={!valid || busy || amount > total}
            title={amount > total ? 'Not enough points' : undefined}
            onClick={() => void run(redeemPoints(studentId, amount, reason.trim())).then((ok) => ok && setReason(''))}
            className="rounded-xl bg-[#fc0c97] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
          >
            Redeem
          </button>
        </div>
      )}

      {entries !== null && entries.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No points yet. They come with attendance and rewards in class.</p>
      )}

      {shown.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 text-sm">
          {shown.map((entry) => {
            const isUndone = undone.has(entry.id)
            return (
              <li key={entry.id} className={cn('flex items-center justify-between gap-3 py-2', isUndone && 'text-slate-400')}>
                <div className="min-w-0">
                  <div className={cn('truncate font-medium', isUndone ? 'line-through' : 'text-slate-800')}>{entry.reason}</div>
                  <div className="text-xs text-slate-500">
                    {kindLabels[entry.kind]} · {formatDate((entry.lessonDate ?? entry.createdAt).slice(0, 10))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={cn('font-bold', entry.points > 0 ? 'text-emerald-700' : 'text-red-700')}>
                    {entry.points > 0 ? '+' : ''}
                    {entry.points}
                  </span>
                  {(entry.kind === 'award' || entry.kind === 'redeem') && !isUndone && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run(undoPoints(entry.id))}
                      aria-label={`Undo ${entry.reason}`}
                      className="text-xs font-semibold text-slate-500 underline hover:text-slate-800"
                    >
                      Undo
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {(entries?.length ?? 0) > 8 && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="mt-2 text-sm font-semibold text-[#be185d] hover:underline"
        >
          {showAll ? 'Show fewer' : `Show all ${entries?.length}`}
        </button>
      )}
    </section>
  )
}
