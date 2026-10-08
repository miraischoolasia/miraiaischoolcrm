import { useState } from 'react'
import { ArrowRight, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { formatDate } from '../../domain/studentStatus'
import { cn } from '../../lib/cn'
import type { TeacherClash } from '../../lib/clash'

export type MoveClassDraft = {
  kind: 'regular' | 'replacement' | 'trial'
  scheduleId: number
  title: string
  fromDate: string
  fromStartTime: string
  toDate: string
  startTime: string
  endTime: string
  // Students of the class, or the children booked on the trial.
  names: string[]
  // Trial only: slots of the same trial classroom already running that day.
  trialSlotOptions: { startTime: string; endTime: string; teacherName: string }[]
}

export type MoveClassInput = {
  startTime: string
  endTime: string
  reason: string | null
}

type MoveClassModalProps = {
  draft: MoveClassDraft
  isSaving: boolean
  error: string | null
  onClose: () => void
  onConfirm: (input: MoveClassInput) => void
  // The teacher's other classes at the chosen time, so the admin sees a clash
  // as they adjust it.
  getClashes?: (startTime: string, endTime: string) => TeacherClash[]
  clashTeacherName?: string
}

const inputClassName =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]'

function formatTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const suffix = hours >= 12 ? 'pm' : 'am'
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')}${suffix}`
}

export function MoveClassModal({
  draft,
  isSaving,
  error,
  onClose,
  onConfirm,
  getClashes,
  clashTeacherName = 'This teacher',
}: MoveClassModalProps) {
  const [startTime, setStartTime] = useState(draft.startTime)
  const [endTime, setEndTime] = useState(draft.endTime)
  const [reason, setReason] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const isTrial = draft.kind === 'trial'

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!startTime || !endTime || endTime <= startTime) {
      setValidationError('The class must end after it starts.')
      return
    }

    setValidationError(null)
    onConfirm({
      startTime,
      endTime,
      reason: reason.trim() || null,
    })
  }

  const shownError = validationError ?? error
  const clashes = getClashes && startTime && endTime ? getClashes(startTime, endTime) : []

  return (
    <ModalShell maxWidth="sm" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">
              {isTrial ? 'Move trial' : 'Move class'}
            </div>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">{draft.title}</h2>
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

      <form data-modal-body onSubmit={handleSubmit} className="space-y-4 px-6 py-6">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <div>
            <div className="text-xs text-slate-500">From</div>
            <div className="font-semibold text-slate-500 line-through">
              {formatDate(draft.fromDate)} {formatTime(draft.fromStartTime)}
            </div>
          </div>
          <ArrowRight size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
          <div>
            <div className="text-xs text-slate-500">To</div>
            <div className="font-semibold text-slate-900">{formatDate(draft.toDate)}</div>
          </div>
        </div>

        {isTrial && draft.trialSlotOptions.length > 0 && (
          <div className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Trial slots that day</span>
            <div className="flex flex-wrap gap-1.5">
              {draft.trialSlotOptions.map((option) => {
                const isPicked = option.startTime === startTime && option.endTime === endTime
                return (
                  <button
                    key={`${option.startTime}-${option.endTime}-${option.teacherName}`}
                    type="button"
                    aria-pressed={isPicked}
                    onClick={() => {
                      setStartTime(option.startTime)
                      setEndTime(option.endTime)
                    }}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-xs font-semibold transition',
                      isPicked
                        ? 'border-[#fc0c97] bg-[#fff0f9] text-[#be185d]'
                        : 'border-slate-200 text-slate-600 hover:border-[#fc0c97]',
                    )}
                  >
                    {formatTime(option.startTime)}-{formatTime(option.endTime)} · {option.teacherName}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-sm font-semibold text-slate-700">Start</span>
            <input
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className={inputClassName}
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-semibold text-slate-700">End</span>
            <input
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className={inputClassName}
            />
          </label>
        </div>

        {isTrial && (
          <p className="text-sm text-slate-600">
            {draft.trialSlotOptions.some(
              (option) => option.startTime === startTime && option.endTime === endTime,
            )
              ? 'Joins the existing trial slot at this time.'
              : 'A one-off trial slot is created at this time.'}
          </p>
        )}

        <p className="text-sm text-slate-600">
          {draft.kind === 'regular' &&
            `${formatDate(draft.fromDate)} will show as cancelled ("Moved"). A replacement class is created for: `}
          {draft.kind === 'replacement' && 'Same class, new date. Students: '}
          {draft.kind === 'trial' && 'Children moving: '}
          <span className="font-semibold text-slate-800">
            {draft.names.length > 0 ? draft.names.join(', ') : 'none'}
          </span>
        </p>

        {draft.kind === 'regular' && (
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-slate-700">Reason (optional)</span>
            <input
              type="text"
              value={reason}
              placeholder="e.g. Teacher on leave"
              onChange={(event) => setReason(event.target.value)}
              className={inputClassName}
            />
          </label>
        )}

        {clashes.length > 0 && (
          <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="font-semibold">
              Time clash: {clashTeacherName} is already teaching at this time
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {clashes.map((clash) => (
                <li key={`${clash.scheduleId}-${clash.when}`}>
                  {clash.title} - {clash.when}
                </li>
              ))}
            </ul>
          </div>
        )}

        {shownError && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {shownError}
          </p>
        )}

        {/* Wrapped: the last child of a modal form becomes the sticky footer. */}
        <div>
          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-60"
          >
            {isSaving ? 'Moving...' : 'Confirm Move'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
