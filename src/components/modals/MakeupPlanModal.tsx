import { useState } from 'react'
import { Plus, Trash, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { cn } from '../../lib/cn'
import { makeupPresets } from '../../lib/makeup'
import type { MakeupPlan, Student } from '../../types/domain'

export type MakeupPlanInput = {
  planId: number | null
  missedDate: string
  studentId: number | null
  missedMinutes: number
  notes: string | null
  sessions: { sessionDate: string; extraMinutes: number }[]
}

type SessionRow = { sessionDate: string; extraMinutes: string }

type MakeupPlanModalProps = {
  classroomName: string
  roster: Student[]
  plan: MakeupPlan | null
  initialMissedDate: string
  initialStudentId: number | null
  // Recently missed classes, shown as one-click choices for the missed date.
  missedDateOptions?: { date: string; label: string }[]
  // The next normal class days after a date, for the quick presets.
  suggestDates: (afterDate: string, count: number) => string[]
  isSaving: boolean
  error: string | null
  onClose: () => void
  onSave: (input: MakeupPlanInput) => void
  onDelete?: () => void
}

const inputClassName =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]'

export function MakeupPlanModal({
  classroomName,
  roster,
  plan,
  initialMissedDate,
  initialStudentId,
  missedDateOptions = [],
  suggestDates,
  isSaving,
  error,
  onClose,
  onSave,
  onDelete,
}: MakeupPlanModalProps) {
  const [missedDate, setMissedDate] = useState(plan?.missedDate ?? initialMissedDate)
  const [studentId, setStudentId] = useState(
    String(plan ? (plan.studentId ?? '') : (initialStudentId ?? '')),
  )
  const [missedMinutes, setMissedMinutes] = useState(String(plan?.missedMinutes ?? 60))
  const [notes, setNotes] = useState(plan?.notes ?? '')
  const [rows, setRows] = useState<SessionRow[]>(() =>
    plan
      ? plan.sessions.map((session) => ({
          sessionDate: session.sessionDate,
          extraMinutes: String(session.extraMinutes),
        }))
      : suggestDates(initialMissedDate, 2).map((date) => ({
          sessionDate: date,
          extraMinutes: '30',
        })),
  )
  const [validationError, setValidationError] = useState<string | null>(null)
  // Until the admin edits the sessions by hand, they follow the missed date
  // (the next two classes after it), so picking a date is all it takes.
  const [rowsTouched, setRowsTouched] = useState(plan !== null)

  function changeMissedDate(nextDate: string) {
    setMissedDate(nextDate)
    if (!rowsTouched && nextDate) {
      setRows(
        suggestDates(nextDate, 2).map((date) => ({ sessionDate: date, extraMinutes: '30' })),
      )
    }
  }

  const plannedMinutes = rows.reduce(
    (total, row) => total + (Number.parseInt(row.extraMinutes, 10) || 0),
    0,
  )
  const targetMinutes = Number.parseInt(missedMinutes, 10) || 0

  function applyPreset(count: number, minutes: number) {
    setRowsTouched(true)
    setRows(
      suggestDates(missedDate, count).map((date) => ({
        sessionDate: date,
        extraMinutes: String(minutes),
      })),
    )
  }

  function updateRow(index: number, patch: Partial<SessionRow>) {
    setRowsTouched(true)
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    )
  }

  function addRow() {
    setRowsTouched(true)
    const lastDate = rows.at(-1)?.sessionDate || missedDate
    const [nextDate] = suggestDates(lastDate, 1)
    setRows((current) => [...current, { sessionDate: nextDate ?? '', extraMinutes: '30' }])
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!missedDate) {
      setValidationError('Pick the date being made up.')
      return
    }

    if (targetMinutes <= 0) {
      setValidationError('Enter how many minutes need to be made up.')
      return
    }

    if (rows.length === 0) {
      setValidationError('Add at least one make-up session.')
      return
    }

    const sessions = rows.map((row) => ({
      sessionDate: row.sessionDate,
      extraMinutes: Number.parseInt(row.extraMinutes, 10),
    }))

    if (sessions.some((session) => !session.sessionDate || !(session.extraMinutes > 0))) {
      setValidationError('Every session needs a date and extra minutes above 0.')
      return
    }

    setValidationError(null)
    onSave({
      planId: plan?.id ?? null,
      missedDate,
      studentId: studentId ? Number(studentId) : null,
      missedMinutes: targetMinutes,
      notes: notes.trim() || null,
      sessions,
    })
  }

  const shownError = validationError ?? error

  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">Make-up plan</div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">{classroomName}</h2>
            <p className="mt-2 text-sm text-slate-500">
              Make up a missed class by adding minutes to later classes. This is a
              record only: it does not change anyone&apos;s remaining classes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <form data-modal-body onSubmit={handleSubmit} className="space-y-5 px-6 py-6 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Missed class date</span>
              <input
                type="date"
                value={missedDate}
                onChange={(event) => changeMissedDate(event.target.value)}
                className={inputClassName}
              />
            </label>
            {missedDateOptions.length > 0 && (
              <div className="flex flex-wrap gap-1.5" aria-label="Recently missed classes">
                {missedDateOptions.map((option) => (
                  <button
                    key={option.date}
                    type="button"
                    aria-pressed={missedDate === option.date}
                    onClick={() => changeMissedDate(option.date)}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-xs font-semibold transition',
                      missedDate === option.date
                        ? 'border-[#fc0c97] bg-[#fff0f9] text-[#be185d]'
                        : 'border-slate-200 text-slate-600 hover:border-[#fc0c97]',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Minutes to make up</span>
            <input
              type="number"
              min={1}
              max={600}
              value={missedMinutes}
              onChange={(event) => setMissedMinutes(event.target.value)}
              className={inputClassName}
            />
          </label>

          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">For</span>
            <select
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              className={inputClassName}
            >
              <option value="">Whole class</option>
              {roster.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} only
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-700">Make-up sessions</span>
            <div className="flex flex-wrap gap-2">
              {makeupPresets.map((preset) => (
                <button
                  key={`${preset.count}x${preset.minutes}`}
                  type="button"
                  onClick={() => applyPreset(preset.count, preset.minutes)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-[#fc0c97] hover:text-[#be185d]"
                >
                  {preset.count} × {preset.minutes} min
                </button>
              ))}
            </div>
          </div>

          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="date"
                aria-label={`Session ${index + 1} date`}
                value={row.sessionDate}
                onChange={(event) => updateRow(index, { sessionDate: event.target.value })}
                className={inputClassName}
              />
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-sm text-slate-500">+</span>
                <input
                  type="number"
                  min={1}
                  max={600}
                  aria-label={`Session ${index + 1} extra minutes`}
                  value={row.extraMinutes}
                  onChange={(event) => updateRow(index, { extraMinutes: event.target.value })}
                  className="w-20 rounded-xl border border-slate-200 bg-white px-3 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                />
                <span className="text-sm text-slate-500">min</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRowsTouched(true)
                  setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))
                }}
                aria-label={`Remove session ${index + 1}`}
                className="shrink-0 rounded-xl border border-slate-200 p-3 text-slate-500 transition hover:text-red-600"
              >
                <Trash size={16} aria-hidden="true" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1.5 text-sm font-semibold text-[#be185d]"
          >
            <Plus size={16} aria-hidden="true" />
            Add session
          </button>

          <div
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-medium',
              plannedMinutes === targetMinutes
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-800',
            )}
          >
            Planned {plannedMinutes} / {targetMinutes} min
            {plannedMinutes !== targetMinutes && ' - totals differ, you can still save'}
          </div>
          <p className="text-xs text-slate-500">
            Sessions must fall on this class&apos;s weekday. The 29th-31st are allowed
            and show as a separate make-up slot at the usual class time.
          </p>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-700">Notes</span>
          <textarea
            rows={2}
            value={notes}
            placeholder="e.g. Agreed with parent on WhatsApp"
            onChange={(event) => setNotes(event.target.value)}
            className={inputClassName}
          />
        </label>

        {shownError && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {shownError}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={isSaving}
              className="rounded-xl border border-red-200 px-5 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
            >
              Delete Plan
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-60"
          >
            {isSaving ? 'Saving...' : 'Save Make-up Plan'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
