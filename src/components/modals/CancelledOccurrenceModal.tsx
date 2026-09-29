import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { formatDate } from '../../domain/studentStatus'

type CancelledOccurrenceModalProps = {
  classroomName: string
  teacherName: string
  occurrenceDate: string
  cancelReason: string | null
  // Set when this day was dragged to another date: the replacement's date.
  movedToDate?: string | null
  onClose: () => void
  onRestore: () => void
  onAddReplacement: () => void
  // Summary of the whole-class make-up plan for this day, if one exists.
  makeupSummary: string | null
  // Omitted for a trial slot: make-ups are for regular classes only.
  onArrangeMakeup?: () => void
}

export function CancelledOccurrenceModal({
  classroomName,
  teacherName,
  occurrenceDate,
  cancelReason,
  movedToDate = null,
  onClose,
  onRestore,
  onAddReplacement,
  makeupSummary,
  onArrangeMakeup,
}: CancelledOccurrenceModalProps) {
  return (
    <ModalShell maxWidth="sm" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-slate-500">Cancelled class</div>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">{classroomName}</h2>
            <p className="mt-2 text-sm text-slate-500">
              {formatDate(occurrenceDate)} · {teacherName}
            </p>
            {cancelReason && (
              <p className="mt-2 text-sm text-slate-500">Reason: {cancelReason}</p>
            )}
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

      <div className="space-y-3 px-6 py-6">
        {makeupSummary && (
          <div className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-800">
            Make-up planned: {makeupSummary}
          </div>
        )}
        {!movedToDate && onArrangeMakeup && (
        <button
          type="button"
          onClick={onArrangeMakeup}
          className="w-full rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
        >
          {makeupSummary ? 'Edit Make-up Plan' : 'Make Up by Extending Classes'}
        </button>
        )}
        {!movedToDate && (
        <button
          type="button"
          onClick={onAddReplacement}
          className="w-full rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
        >
          Add Replacement Class
        </button>
        )}
        <button
          type="button"
          onClick={onRestore}
          className="w-full rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          {movedToDate ? `Undo Move (back to ${formatDate(occurrenceDate)})` : 'Restore This Day'}
        </button>
      </div>
    </ModalShell>
  )
}
