import { useState } from 'react'
import { CaretDown, Clock } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { STATUS_LABELS, type ChatSchedule, type FlowChoice } from '../../lib/chatSchedules'

const when = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

// What is scheduled for this chat, above the message box: change or cancel one still waiting; the ones done show
// when opened (what went out, what was cancelled and why).
export function ScheduledList({
  schedules,
  flows,
  onEdit,
  onCancel,
}: {
  schedules: ChatSchedule[]
  flows: FlowChoice[]
  onEdit: (schedule: ChatSchedule) => void
  onCancel: (schedule: ChatSchedule) => void
}) {
  const [showDone, setShowDone] = useState(false)
  const waiting = schedules.filter((schedule) => schedule.status === 'scheduled').sort((a, b) => a.runAt.localeCompare(b.runAt))
  const done = schedules.filter((schedule) => schedule.status !== 'scheduled')
  if (schedules.length === 0) {
    return null
  }
  const describe = (schedule: ChatSchedule) =>
    schedule.kind === 'flow'
      ? `Start flow: ${flows.find((flow) => flow.id === schedule.flowId)?.name ?? `#${schedule.flowId}`}`
      : `${schedule.mediaUrl ? '📷 ' : ''}${schedule.message ?? ''}`

  return (
    <div aria-label="Scheduled for this chat" className="border-t border-slate-200 bg-amber-50/40 px-3 py-1.5 text-xs">
      {waiting.map((schedule) => (
        <div key={schedule.id} className="flex items-center gap-2 py-0.5">
          <Clock size={13} aria-hidden="true" className="shrink-0 text-amber-700" />
          <span className="shrink-0 font-semibold text-amber-800">{when.format(new Date(schedule.runAt))}</span>
          <span className="min-w-0 flex-1 truncate text-slate-700" title={describe(schedule)}>
            {describe(schedule)}
          </span>
          {schedule.cancelOnReply && <span className="hidden shrink-0 text-slate-500 sm:inline">· cancels if they reply</span>}
          <button type="button" onClick={() => onEdit(schedule)} className="shrink-0 font-semibold text-[#be185d] hover:underline min-h-0!">
            Change
          </button>
          <button type="button" onClick={() => onCancel(schedule)} className="shrink-0 font-semibold text-slate-600 hover:underline min-h-0!">
            Cancel
          </button>
        </div>
      ))}
      {done.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showDone}
            onClick={() => setShowDone((value) => !value)}
            className="flex items-center gap-1 py-0.5 text-slate-500 hover:text-slate-700 min-h-0!"
          >
            <CaretDown size={11} className={cn('transition', showDone && 'rotate-180')} aria-hidden="true" />
            {done.length} done or cancelled
          </button>
          {showDone &&
            done.map((schedule) => (
              <div key={schedule.id} className="flex items-center gap-2 py-0.5 text-slate-500">
                <span className="shrink-0">{when.format(new Date(schedule.runAt))}</span>
                <span className="min-w-0 flex-1 truncate" title={describe(schedule)}>
                  {describe(schedule)}
                </span>
                <span className="shrink-0 font-medium">{STATUS_LABELS[schedule.status]}</span>
                {schedule.createdByName && <span className="hidden shrink-0 sm:inline">· by {schedule.createdByName}</span>}
              </div>
            ))}
        </>
      )}
    </div>
  )
}
