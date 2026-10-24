import { useMemo, useState } from 'react'
import { CheckCircle, ChatCircleText, LockSimple } from '@phosphor-icons/react'
import type { CalendarItem } from '../lib/calendarItems'
import { cn } from '../lib/cn'
import { followUpWorklist, type WorklistRow } from '../lib/followUps'

type Props = {
  items: CalendarItem[]
  meId: number | null
  // An admin (or anyone who sees the whole calendar) sees everybody's follow-ups; the others their own.
  seesAll: boolean
  // Who each follow-up is for (staff names by id), shown when everybody's are listed.
  nameOf?: (teacherId: number | null) => string | null
  // The family's name for a lead, else the follow-up's own title is shown.
  leadNameOf?: (leadId: number) => string | null
  onDone: (ids: number[]) => Promise<string | null>
  // Closes the lead (Lost): its follow-ups left are cancelled by the database.
  onCloseLead?: (leadId: number) => Promise<string | null>
  onOpenChat?: (leadId: number) => void
  now?: Date
}

const SECTIONS = [
  { key: 'late', title: 'Overdue', tone: 'text-red-700 bg-red-50' },
  { key: 'today', title: 'Today', tone: 'text-amber-800 bg-amber-50' },
  { key: 'soon', title: 'Next 7 days', tone: 'text-slate-700 bg-slate-100' },
] as const

const smallButton =
  'inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50'

// Today page: the follow-ups to do, as a work list (the EC system's, without its "complete all when nothing is
// ticked" slip): late, today and the next 7 days; one tick or a ticked group done at once, close the lead, open its chat.
export function FollowUpWorklist({ items, meId, seesAll, nameOf, leadNameOf, onDone, onCloseLead, onOpenChat, now }: Props) {
  const list = useMemo(() => followUpWorklist(items, { meId, seesAll, now: now ?? new Date() }), [items, meId, seesAll, now])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [asking, setAsking] = useState<{ kind: 'done'; ids: number[] } | { kind: 'close'; leadId: number; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const total = list.late.length + list.today.length + list.soon.length

  async function run(work: () => Promise<string | null>) {
    setBusy(true)
    setProblem(null)
    const result = await work()
    setBusy(false)
    setProblem(result)
    if (!result) {
      setAsking(null)
      setPicked(new Set())
    }
  }

  const toggle = (id: number) =>
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const nameFor = (row: WorklistRow) => (row.item.leadId !== null ? leadNameOf?.(row.item.leadId) : null) ?? row.item.title

  return (
    <section aria-label="Follow-ups" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {total === 0
            ? 'No follow-ups for the next 7 days.'
            : `${list.late.length} overdue · ${list.today.length} today · ${list.soon.length} in the next 7 days`}
        </p>
        {picked.size > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setAsking({ kind: 'done', ids: [...picked] })}
            className="rounded-lg bg-[#fc0c97] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#de0a84] disabled:opacity-50"
          >
            Mark {picked.size} done
          </button>
        )}
      </div>
      {asking && (
        <div role="alertdialog" aria-label="Please confirm" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-slate-800">
          <p>
            {asking.kind === 'done'
              ? `Mark ${asking.ids.length} follow-up${asking.ids.length === 1 ? '' : 's'} done?`
              : `Close ${asking.name}? The lead becomes Lost and its follow-ups left are cancelled.`}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  asking.kind === 'done' ? onDone(asking.ids) : onCloseLead ? onCloseLead(asking.leadId) : Promise.resolve(null),
                )
              }
              className="rounded-lg bg-[#fc0c97] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#de0a84] disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Yes'}
            </button>
            <button type="button" disabled={busy} onClick={() => setAsking(null)} className={smallButton}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {problem && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {problem}
        </p>
      )}
      {SECTIONS.map((section) => {
        const rows = list[section.key]
        if (rows.length === 0) {
          return null
        }
        return (
          <div key={section.key} className="overflow-hidden rounded-xl border border-slate-200">
            <h4 className={cn('flex items-center justify-between px-3 py-1.5 text-xs font-semibold', section.tone)}>
              <span>
                {section.title} ({rows.length})
              </span>
              {section.key !== 'soon' && (
                <label className="inline-flex items-center gap-1 font-medium">
                  <input
                    type="checkbox"
                    aria-label={`Pick every ${section.title.toLowerCase()} follow-up`}
                    checked={rows.every((row) => picked.has(row.item.id))}
                    onChange={(event) =>
                      setPicked((current) => {
                        const next = new Set(current)
                        for (const row of rows) {
                          if (event.target.checked) next.add(row.item.id)
                          else next.delete(row.item.id)
                        }
                        return next
                      })
                    }
                    className="h-3.5 w-3.5 accent-[#fc0c97]"
                  />
                  All
                </label>
              )}
            </h4>
            <ul className="divide-y divide-slate-100">
              {rows.map((row) => {
                const leadId = row.item.leadId!
                const name = nameFor(row)
                return (
                  <li key={row.item.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    {section.key !== 'soon' && (
                      <input
                        type="checkbox"
                        aria-label={`Pick ${name}`}
                        checked={picked.has(row.item.id)}
                        onChange={() => toggle(row.item.id)}
                        className="h-4 w-4 shrink-0 accent-[#fc0c97]"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-900">{name}</div>
                      <div className="truncate text-xs text-slate-500">
                        {row.stepLabel ? `Follow-up ${row.stepLabel} · ` : ''}
                        {row.when}
                        {seesAll && nameOf?.(row.item.assigneeId) ? ` · ${nameOf(row.item.assigneeId)}` : ''}
                        {row.item.notes ? ` · ${row.item.notes}` : ''}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {onOpenChat && (
                        <button type="button" onClick={() => onOpenChat(leadId)} className={smallButton}>
                          <ChatCircleText size={14} aria-hidden="true" /> Chat
                        </button>
                      )}
                      {section.key !== 'soon' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void run(() => onDone([row.item.id]))}
                          aria-label={`Mark ${name} done`}
                          className={smallButton}
                        >
                          <CheckCircle size={14} aria-hidden="true" /> Done
                        </button>
                      )}
                      {onCloseLead && section.key !== 'soon' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setAsking({ kind: 'close', leadId, name })}
                          aria-label={`Close ${name}`}
                          className={smallButton}
                        >
                          <LockSimple size={14} aria-hidden="true" /> Close
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
