import { useState } from 'react'
import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { cn } from '../../lib/cn'
import {
  CALENDAR_ITEM_KINDS,
  draftOfItem,
  emptyItemDraft,
  type CalendarItem,
  type CalendarItemDraft,
  type CalendarItemKind,
} from '../../lib/calendarItems'

type CalendarItemModalProps = {
  // The item being changed; null for a new one.
  item: CalendarItem | null
  // The day a new item starts on.
  defaultDate: string
  teachers: { id: number; fullName: string }[]
  // False for someone who may only tick off a task given to them.
  canEdit: boolean
  onClose: () => void
  // Each resolves to an error message, or null when it worked.
  onSave: (draft: CalendarItemDraft) => Promise<string | null>
  onDelete?: () => Promise<string | null>
  onToggleDone?: (isDone: boolean) => Promise<string | null>
}

const FIELD =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-50'

// A task, a Zoom meeting or an event on the calendar: add one, change one, tick a task off, or remove it.
export function CalendarItemModal({
  item,
  defaultDate,
  teachers,
  canEdit,
  onClose,
  onSave,
  onDelete,
  onToggleDone,
}: CalendarItemModalProps) {
  const [draft, setDraft] = useState<CalendarItemDraft>(() => (item ? draftOfItem(item) : emptyItemDraft(defaultDate)))
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const set = <K extends keyof CalendarItemDraft>(key: K, value: CalendarItemDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))
  const allDay = draft.startTime === ''

  async function run(action: () => Promise<string | null>, closeAfter = true) {
    setIsBusy(true)
    setError(null)
    const problem = await action()
    setIsBusy(false)
    if (problem) {
      setError(problem)
      return
    }
    if (closeAfter) {
      onClose()
    }
  }

  return (
    <ModalShell onClose={onClose} maxWidth="sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
        <h2 className="text-xl font-semibold text-slate-900">
          {item ? (canEdit ? 'Change this item' : item.title) : 'Add to the calendar'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
        >
          <X size={16} />
        </button>
      </div>

      <div data-modal-body className="max-h-[65vh] space-y-4 overflow-y-auto px-6 py-5">
        <div role="group" aria-label="What to add" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {CALENDAR_ITEM_KINDS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              disabled={!canEdit}
              aria-pressed={draft.kind === entry.key}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  kind: entry.key as CalendarItemKind,
                  // A meeting happens at a time, so it starts with one instead of "all day".
                  startTime: entry.key === 'meeting' && current.startTime === '' ? '10:00' : current.startTime,
                }))
              }
              className={cn(
                'rounded-lg px-2 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed',
                draft.kind === entry.key ? 'bg-white text-[#be185d] shadow-sm' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <p className="-mt-2 text-xs text-slate-500">{CALENDAR_ITEM_KINDS.find((entry) => entry.key === draft.kind)?.hint}</p>

        <label className="block text-sm font-medium text-slate-700">
          Title
          <input
            value={draft.title}
            disabled={!canEdit}
            onChange={(event) => set('title', event.target.value)}
            maxLength={160}
            placeholder={
              draft.kind === 'task' ? 'Call Mrs Tan about the trial' : draft.kind === 'meeting' ? 'Parent meeting' : 'Centre closed'
            }
            className={cn(FIELD, 'mt-1')}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block text-sm font-medium text-slate-700 sm:col-span-1">
            Day
            <input
              type="date"
              value={draft.date}
              disabled={!canEdit}
              onChange={(event) => set('date', event.target.value)}
              className={cn(FIELD, 'mt-1')}
            />
          </label>
          {draft.kind !== 'meeting' && (
            <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={allDay}
                disabled={!canEdit}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, startTime: event.target.checked ? '' : '09:00', endTime: '' }))
                }
                className="h-4 w-4 accent-[#fc0c97]"
              />
              All day
            </label>
          )}
          {!allDay && (
            <>
              <label className="block text-sm font-medium text-slate-700">
                From
                <input
                  type="time"
                  value={draft.startTime}
                  disabled={!canEdit}
                  onChange={(event) => set('startTime', event.target.value)}
                  className={cn(FIELD, 'mt-1')}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                To (optional)
                <input
                  type="time"
                  value={draft.endTime}
                  disabled={!canEdit}
                  onChange={(event) => set('endTime', event.target.value)}
                  className={cn(FIELD, 'mt-1')}
                />
              </label>
            </>
          )}
        </div>

        {draft.kind === 'meeting' && (
          <label className="block text-sm font-medium text-slate-700">
            Zoom link
            <input
              value={draft.zoomLink}
              disabled={!canEdit}
              onChange={(event) => set('zoomLink', event.target.value)}
              placeholder="https://zoom.us/j/..."
              className={cn(FIELD, 'mt-1')}
            />
          </label>
        )}

        {draft.kind !== 'event' && (
          <label className="block text-sm font-medium text-slate-700">
            {draft.kind === 'task' ? 'Given to' : 'Who joins'}
            <select
              value={draft.assigneeId ?? ''}
              disabled={!canEdit}
              onChange={(event) => set('assigneeId', event.target.value ? Number(event.target.value) : null)}
              className={cn(FIELD, 'mt-1')}
            >
              <option value="">Nobody in particular</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.fullName}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block text-sm font-medium text-slate-700">
          Notes
          <textarea
            value={draft.notes}
            disabled={!canEdit}
            onChange={(event) => set('notes', event.target.value)}
            rows={3}
            maxLength={2000}
            className={cn(FIELD, 'mt-1')}
          />
        </label>

        {item && draft.kind === 'task' && onToggleDone && (
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={item.isDone}
              disabled={isBusy}
              onChange={(event) => void run(() => onToggleDone(event.target.checked), false)}
              className="h-4 w-4 accent-[#fc0c97]"
            />
            Done
          </label>
        )}

        {item?.kind === 'meeting' && item.zoomLink && (
          <a
            href={item.zoomLink}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-sm font-semibold text-[#be185d] underline"
          >
            Open the Zoom link
          </a>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white px-6 py-3">
        <div>
          {item && canEdit && onDelete && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void run(onDelete)}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
            >
              Delete
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {canEdit ? 'Cancel' : 'Close'}
          </button>
          {canEdit && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void run(() => onSave(draft))}
              className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-60"
            >
              {isBusy ? 'Saving...' : item ? 'Save' : 'Add'}
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  )
}
