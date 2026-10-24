import { useState } from 'react'
import { BellRinging, CheckCircle } from '@phosphor-icons/react'
import type { CalendarItem } from '../../lib/calendarItems'
import { cn } from '../../lib/cn'
import { describeFollowUp } from '../../lib/followUps'
import type { QuickReply } from '../../lib/quickReplies'

type Props = {
  item: CalendarItem
  // "2/5" for an automatic follow-up, null for one set by hand.
  stepLabel: string | null
  state: 'late' | 'today' | 'later'
  handlerName?: string | null
  onDone: () => Promise<string | null>
  onChangeDate: (date: string) => Promise<string | null>
  // Quick replies made as templates for this follow-up (QuickReply.followupStep); one is put in the message box.
  templates?: QuickReply[]
  onUseTemplate?: (reply: QuickReply) => void
  now?: Date
}

// Above the chat: the lead's next follow-up ("Follow-up 2/5 · due Tue 25 Oct · Handled by Amy"), ticked done here
// (the next one of the round is already there) or moved to another day (the later ones move with it).
export function FollowUpChatBar({ item, stepLabel, state, handlerName, onDone, onChangeDate, templates = [], onUseTemplate, now }: Props) {
  const [moving, setMoving] = useState(false)
  const [date, setDate] = useState(item.date)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function run(work: () => Promise<string | null>) {
    setBusy(true)
    setProblem(null)
    const result = await work()
    setBusy(false)
    setProblem(result)
    if (!result) setMoving(false)
  }

  return (
    <section
      aria-label="Follow-up"
      className={cn(
        'flex flex-wrap items-center gap-2 border-b px-3 py-1.5 text-xs',
        state === 'late' ? 'border-red-100 bg-red-50/70' : state === 'today' ? 'border-amber-100 bg-amber-50/70' : 'border-slate-100 bg-slate-50',
      )}
    >
      <BellRinging size={14} aria-hidden="true" className={state === 'late' ? 'text-red-600' : 'text-amber-600'} />
      <span className="min-w-0 flex-1 truncate text-slate-700">
        <strong className="font-semibold">{stepLabel ? `Follow-up ${stepLabel}` : 'Follow-up'}</strong>
        {' · '}
        {state === 'late' ? 'overdue, ' : ''}
        {describeFollowUp(item, now ?? new Date())}
        {handlerName ? ` · ${handlerName}` : ''}
      </span>
      {moving ? (
        <span className="flex items-center gap-1">
          <input
            type="date"
            value={date}
            aria-label="New day for this follow-up"
            onChange={(event) => setDate(event.target.value)}
            className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs"
          />
          <button
            type="button"
            disabled={busy || !date || date === item.date}
            onClick={() => void run(() => onChangeDate(date))}
            className="rounded-md bg-[#fc0c97] px-2 py-0.5 font-semibold text-white disabled:opacity-50 min-h-0!"
          >
            Save
          </button>
          <button type="button" onClick={() => setMoving(false)} className="px-1 text-slate-500 hover:underline min-h-0!">
            Cancel
          </button>
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          {onUseTemplate && templates.length === 1 && (
            <button
              type="button"
              onClick={() => onUseTemplate(templates[0])}
              title={`Put "${templates[0].title}" in the message box`}
              className="font-medium text-[#be185d] hover:underline min-h-0!"
            >
              Use template
            </button>
          )}
          {onUseTemplate && templates.length > 1 && (
            <select
              value=""
              aria-label="Use a template"
              onChange={(event) => {
                const picked = templates.find((reply) => reply.id === Number(event.target.value))
                if (picked) onUseTemplate(picked)
              }}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-medium text-[#be185d]"
            >
              <option value="">Use template...</option>
              {templates.map((reply) => (
                <option key={reply.id} value={reply.id}>
                  {reply.title}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => setMoving(true)} className="font-medium text-slate-600 hover:underline min-h-0!">
            Change date
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(onDone)}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-0.5 font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 min-h-0!"
          >
            <CheckCircle size={13} aria-hidden="true" /> Done
          </button>
        </span>
      )}
      {problem && (
        <p role="alert" className="w-full text-red-700">
          {problem}
        </p>
      )}
    </section>
  )
}
