import { useState } from 'react'
import { BellRinging, Check, ChatCircleText } from '@phosphor-icons/react'
import type { CalendarItem } from '../../lib/calendarItems'
import { describeFollowUp, snoozeChoices } from '../../lib/followUps'

type FollowUpRemindersProps = {
  due: CalendarItem[]
  onOpen: (leadId: number) => void
  onDone: (id: number) => Promise<string | null>
  onSnooze: (id: number, until: number) => void
  now?: () => Date
}

// The follow-ups that are due, as cards in the corner of the screen: open the chat, put it off, or tick it off.
export function FollowUpReminders({ due, onOpen, onDone, onSnooze, now = () => new Date() }: FollowUpRemindersProps) {
  const [problem, setProblem] = useState<string | null>(null)
  if (due.length === 0) {
    return null
  }
  const shown = due.slice(0, 3)
  return (
    <div className="fixed bottom-20 right-3 z-[60] flex w-[320px] max-w-[calc(100vw-1.5rem)] flex-col gap-2 lg:bottom-4" role="region" aria-label="Follow-ups due">
      {shown.map((entry) => (
        <div key={entry.id} className="rounded-xl border border-amber-300 bg-white p-3 text-sm shadow-lg">
          <p className="flex items-center gap-1.5 font-semibold text-amber-900">
            <BellRinging size={16} aria-hidden="true" />
            Follow up due
          </p>
          <p className="mt-1 font-medium text-slate-900">{entry.title}</p>
          <p className="text-xs text-slate-500">
            {describeFollowUp(entry, now())}
            {entry.notes ? ` · ${entry.notes}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {entry.leadId !== null && (
              <button
                type="button"
                onClick={() => onOpen(entry.leadId!)}
                className="inline-flex items-center gap-1 rounded-lg bg-[#fc0c97] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#e00a87]"
              >
                <ChatCircleText size={14} aria-hidden="true" />
                Open chat
              </button>
            )}
            <button
              type="button"
              onClick={async () => setProblem(await onDone(entry.id))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Check size={14} aria-hidden="true" />
              Done
            </button>
            <select
              aria-label={`Remind me again: ${entry.title}`}
              value=""
              onChange={(event) => {
                const choice = snoozeChoices(now()).find((option) => option.key === event.target.value)
                if (choice) {
                  onSnooze(entry.id, choice.until)
                }
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
            >
              <option value="">Remind me again…</option>
              {snoozeChoices(now()).map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
      {due.length > shown.length && <p className="text-right text-xs font-medium text-amber-900">+{due.length - shown.length} more follow-ups due</p>}
      {problem && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {problem}
        </p>
      )}
    </div>
  )
}
