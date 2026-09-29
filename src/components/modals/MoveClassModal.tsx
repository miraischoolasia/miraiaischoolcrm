import { useState } from 'react'
import { ArrowRight, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { formatDate } from '../../domain/studentStatus'

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
  // Trial only: the slots on the target day, first one preselected.
  trialSlotOptions: { scheduleId: number; label: string }[]
}

export type MoveClassInput = {
  startTime: string
  endTime: string
  reason: string | null
  targetScheduleId: number | null
}

type MoveClassModalProps = {
  draft: MoveClassDraft
  isSaving: boolean
  error: string | null
  onClose: () => void
  onConfirm: (input: MoveClassInput) => void
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
}: MoveClassModalProps) {
  const [startTime, setStartTime] = useState(draft.startTime)
  const [endTime, setEndTime] = useState(draft.endTime)
  const [reason, setReason] = useState('')
  const [targetScheduleId, setTargetScheduleId] = useState(
    draft.trialSlotOptions[0]?.scheduleId ?? null,
  )
  const [validationError, setValidationError] = useState<string | null>(null)
  const isTrial = draft.kind === 'trial'

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!isTrial && (!startTime || !endTime || endTime <= startTime)) {
      setValidationError('The class must end after it starts.')
      return
    }

    setValidationError(null)
    onConfirm({
      startTime,
      endTime,
      reason: reason.trim() || null,
      targetScheduleId: isTrial ? targetScheduleId : null,
    })
  }

  const shownError = validationError ?? error

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

        {isTrial ? (
          draft.trialSlotOptions.length > 1 ? (
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Trial slot</span>
              <select
                value={targetScheduleId ?? ''}
                onChange={(event) => setTargetScheduleId(Number(event.target.value))}
                className={inputClassName}
              >
                {draft.trialSlotOptions.map((option) => (
                  <option key={option.scheduleId} value={option.scheduleId}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm text-slate-600">
              Slot: {draft.trialSlotOptions[0]?.label}
            </p>
          )
        ) : (
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
