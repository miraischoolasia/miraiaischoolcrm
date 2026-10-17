import { useCallback, useEffect, useMemo, useState } from 'react'
import { Star } from '@phosphor-icons/react'
import { cn } from '../lib/cn'
import {
  awardPoints,
  fetchLessonPoints,
  pointsByStudent,
  undoneIds,
  undoPoints,
  type PointsEntry,
  type RewardPreset,
} from '../lib/rewards'

type GivePointsBarProps = {
  scheduleId: number
  lessonDate: string
  // The students who were in class.
  students: Array<{ id: number; name: string }>
  presets: RewardPreset[]
  // Told after points are given or undone.
  onChanged?: () => void
}

// Give points in a lesson: pick a reward (or type your own), pick who gets it
// (everyone in class by default), give. Points are saved at once, apart from
// the attendance, and each award can be undone from the list below.
export function GivePointsBar({ scheduleId, lessonDate, students, presets, onChanged }: GivePointsBarProps) {
  const [entries, setEntries] = useState<PointsEntry[]>([])
  const [presetId, setPresetId] = useState<number | 'custom' | null>(null)
  const [customPoints, setCustomPoints] = useState(5)
  const [customReason, setCustomReason] = useState('')
  // null = everyone in class.
  const [chosenIds, setChosenIds] = useState<number[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchLessonPoints(scheduleId, lessonDate)
      .then(setEntries)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to load the points.'))
  }, [lessonDate, scheduleId])

  useEffect(load, [load])

  const shownPresets = presets.filter((preset) => preset.isActive)
  const studentIds = students.map((student) => student.id)
  const targetIds = (chosenIds ?? studentIds).filter((id) => studentIds.includes(id))
  const preset = typeof presetId === 'number' ? shownPresets.find((entry) => entry.id === presetId) ?? null : null
  const points = presetId === 'custom' ? customPoints : (preset?.points ?? 0)
  const canGive =
    !busy &&
    targetIds.length > 0 &&
    (preset !== null ||
      (presetId === 'custom' && Number.isInteger(customPoints) && customPoints >= 1 && customPoints <= 100 && customReason.trim() !== ''))

  const totals = useMemo(() => pointsByStudent(entries), [entries])
  const undone = useMemo(() => undoneIds(entries), [entries])
  const nameById = new Map(students.map((student) => [student.id, student.name]))
  const awards = entries.filter((entry) => entry.kind === 'award' && !undone.has(entry.id))

  function toggle(id: number) {
    const current = chosenIds ?? studentIds
    setChosenIds(current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id])
  }

  async function give() {
    setBusy(true)
    setError(null)
    const failure = await awardPoints({
      studentIds: targetIds,
      presetId: preset?.id ?? null,
      points: presetId === 'custom' ? customPoints : null,
      reason: presetId === 'custom' ? customReason.trim() : null,
      scheduleId,
      lessonDate,
    })
    setBusy(false)
    if (failure) {
      setError(failure)
      return
    }
    setDone(`Gave ${points} ${points === 1 ? 'point' : 'points'} to ${targetIds.length} ${targetIds.length === 1 ? 'student' : 'students'}.`)
    setPresetId(null)
    setCustomReason('')
    setChosenIds(null)
    load()
    onChanged?.()
  }

  async function undo(entry: PointsEntry) {
    setError(null)
    const failure = await undoPoints(entry.id)
    if (failure) {
      setError(failure)
      return
    }
    setDone(null)
    load()
    onChanged?.()
  }

  if (students.length === 0) {
    return null
  }

  return (
    <section aria-label="Give points" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Star size={16} weight="fill" className="text-amber-500" aria-hidden="true" />
        Give points
      </div>

      <div className="flex flex-wrap gap-2">
        {shownPresets.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={presetId === entry.id}
            onClick={() => setPresetId(presetId === entry.id ? null : entry.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm font-semibold transition',
              presetId === entry.id
                ? 'border-amber-500 bg-amber-400 text-white'
                : 'border-amber-200 bg-white text-slate-700 hover:bg-amber-50',
            )}
          >
            {entry.emoji ? `${entry.emoji} ` : ''}
            {entry.label} +{entry.points}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={presetId === 'custom'}
          onClick={() => setPresetId(presetId === 'custom' ? null : 'custom')}
          className={cn(
            'rounded-full border px-3 py-1 text-sm font-semibold transition',
            presetId === 'custom'
              ? 'border-amber-500 bg-amber-400 text-white'
              : 'border-dashed border-amber-300 bg-white text-slate-600 hover:bg-amber-50',
          )}
        >
          Other…
        </button>
      </div>

      {presetId === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            max={100}
            value={customPoints}
            aria-label="Points to give"
            onChange={(event) => setCustomPoints(Number(event.target.value))}
            className="w-20 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm"
          />
          <input
            type="text"
            value={customReason}
            maxLength={120}
            placeholder="What for?"
            aria-label="What the points are for"
            onChange={(event) => setCustomReason(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">To:</span>
        <button
          type="button"
          aria-pressed={chosenIds === null}
          onClick={() => setChosenIds(null)}
          className={cn(
            'rounded-full border px-3 py-1 font-semibold transition',
            chosenIds === null ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-600',
          )}
        >
          Everyone ({students.length})
        </button>
        {students.map((student) => {
          const picked = targetIds.includes(student.id)
          return (
            <button
              key={student.id}
              type="button"
              aria-pressed={chosenIds !== null && picked}
              onClick={() => toggle(student.id)}
              className={cn(
                'rounded-full border px-3 py-1 transition',
                chosenIds !== null && picked
                  ? 'border-slate-800 bg-slate-100 font-semibold text-slate-900'
                  : 'border-slate-200 bg-white text-slate-600',
              )}
            >
              {student.name}
              {(totals.get(student.id) ?? 0) !== 0 && (
                <span className="ml-1 text-xs font-bold text-amber-600">⭐{totals.get(student.id)}</span>
              )}
            </button>
          )
        })}
        <button
          type="button"
          disabled={!canGive}
          onClick={() => void give()}
          className="ml-auto rounded-xl bg-[#fc0c97] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          {canGive ? `Give +${points} to ${targetIds.length}` : 'Give'}
        </button>
      </div>

      {error && (
        <div role="alert" className="text-sm text-red-700">
          {error}
        </div>
      )}
      {done && !error && <div className="text-sm font-semibold text-emerald-700">{done}</div>}

      {awards.length > 0 && (
        <ul className="space-y-1 border-t border-amber-200 pt-2 text-sm text-slate-600">
          {awards.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-2">
              <span>
                {nameById.get(entry.studentId) ?? 'Student'}: {entry.reason} +{entry.points}
              </span>
              <button
                type="button"
                onClick={() => void undo(entry)}
                aria-label={`Undo ${entry.reason} for ${nameById.get(entry.studentId) ?? 'student'}`}
                className="text-xs font-semibold text-slate-500 underline hover:text-slate-800"
              >
                Undo
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
