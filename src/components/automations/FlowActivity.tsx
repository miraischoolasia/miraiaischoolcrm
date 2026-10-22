import { useMemo, useState } from 'react'
import { ArrowsClockwise, CaretDown, CaretRight } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import type { AutomationFlow } from '../../lib/automationFlows'
import {
  buildEnrollments,
  buildTimeline,
  formatWhen,
  timeAgo,
  type Enrollment,
  type EnrollmentStatus,
  type FlowActivity as FlowActivityData,
  type TimelineEntry,
  type Tone,
} from '../../lib/automationLog'

type FlowActivityProps = {
  mode: 'enrollments' | 'logs'
  // The saved flow; null for one that is not saved yet.
  flow: AutomationFlow | null
  activity: FlowActivityData | null
  // The pause switch of the Automations page: nothing is queued or sent while it is on.
  paused: boolean
  isLoading: boolean
  error: string | null
  onReload: () => void
}

const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-emerald-500',
  info: 'bg-sky-500',
  warn: 'bg-amber-500',
  error: 'bg-red-500',
}

const STATUS_CHIP: Record<EnrollmentStatus, string> = {
  sent: 'bg-emerald-100 text-emerald-800',
  done: 'bg-violet-100 text-violet-800',
  waiting: 'bg-sky-100 text-sky-800',
  problem: 'bg-red-100 text-red-700',
  skipped: 'bg-amber-100 text-amber-800',
  not_sent: 'bg-slate-100 text-slate-700',
}

// The two history tabs of a flow, like Go High Level: who got into the flow and how far they got
// (Enrollment history), and every step with the reason it went well or not (Execution logs).
export function FlowActivity({ mode, flow, activity, paused, isLoading, error, onReload }: FlowActivityProps) {
  if (flow === null) {
    return (
      <p className="m-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">
        Save the flow first. Its history appears here once it runs.
      </p>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-5">
      <div className="mx-auto max-w-3xl space-y-4">
        <StatusStrip flow={flow} paused={paused} isLoading={isLoading} onReload={onReload} />
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {activity === null && !error ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : activity !== null ? (
          mode === 'enrollments' ? (
            <EnrollmentList activity={activity} />
          ) : (
            <LogList activity={activity} />
          )
        ) : null}
      </div>
    </div>
  )
}

function StatusStrip({
  flow,
  paused,
  isLoading,
  onReload,
}: {
  flow: AutomationFlow
  paused: boolean
  isLoading: boolean
  onReload: () => void
}) {
  const sendsBySelf = flow.graph.settings?.autoSend === true
  // A source keyword flow is run by the chat webhook the moment a first message comes in, and sends nothing.
  const facts =
    flow.trigger === 'first_message_keyword'
      ? [flow.enabled ? 'Flow is LIVE' : 'Flow is OFF, so it does not run', 'Runs the moment a first message comes in']
      : [
          flow.enabled ? 'Flow is LIVE' : 'Flow is OFF, so it does not run',
          `Last checked ${timeAgo(flow.lastRunAt)} (every minute)`,
          sendsBySelf ? 'Sends by itself' : 'Waits for approval',
        ]
  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
        {facts.map((fact) => (
          <span key={fact}>{fact}</span>
        ))}
        <button
          type="button"
          onClick={onReload}
          disabled={isLoading}
          className="ml-auto flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-60"
        >
          <ArrowsClockwise size={14} aria-hidden="true" />
          {isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {paused && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          All automations are paused, so nothing new is queued or sent until the pause is lifted.
        </p>
      )}
      {flow.lastError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          This flow could not run the last time: {flow.lastError}
        </p>
      )}
    </section>
  )
}

const EMPTY_TEXT =
  'Nothing yet. Each time the flow runs, people whose message is due within about 3 hours appear here, with what happened to them.'

function EnrollmentList({ activity }: { activity: FlowActivityData }) {
  const [open, setOpen] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | EnrollmentStatus>('all')
  const enrollments = useMemo(() => buildEnrollments(activity), [activity])
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: enrollments.length }
    for (const item of enrollments) {
      result[item.status] = (result[item.status] ?? 0) + 1
    }
    return result
  }, [enrollments])
  const shown = filter === 'all' ? enrollments : enrollments.filter((item) => item.status === filter)

  return (
    <section className="space-y-3">
      <FilterChips
        value={filter}
        counts={counts}
        options={[
          ['all', 'Everyone'],
          ['sent', 'Sent'],
          ['done', 'Done'],
          ['waiting', 'Waiting'],
          ['problem', 'Needs a look'],
          ['skipped', 'Skipped'],
          ['not_sent', 'Not sent'],
        ]}
        onChange={(value) => setFilter(value as 'all' | EnrollmentStatus)}
      />
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
          {enrollments.length === 0 ? EMPTY_TEXT : 'Nobody in this group.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {shown.map((item) => (
            <EnrollmentRow
              key={item.eventKey}
              item={item}
              isOpen={open === item.eventKey}
              onToggle={() => setOpen(open === item.eventKey ? null : item.eventKey)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function EnrollmentRow({ item, isOpen, onToggle }: { item: Enrollment; isOpen: boolean; onToggle: () => void }) {
  return (
    <li>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left hover:bg-slate-50"
      >
        {isOpen ? <CaretDown size={14} aria-hidden="true" /> : <CaretRight size={14} aria-hidden="true" />}
        <span className="min-w-[140px] flex-1 text-sm font-semibold text-slate-900">{item.person}</span>
        <span className="text-xs text-slate-500">{formatWhen(item.enteredAt)}</span>
        <span className={cn('rounded px-2 py-0.5 text-xs font-bold', STATUS_CHIP[item.status])}>{item.label}</span>
        {item.reason && <span className="w-full pl-[22px] text-xs text-slate-600">{item.reason}</span>}
      </button>
      {isOpen && (
        <ol className="space-y-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
          {item.steps.map((step) => (
            <li key={step.key} className="flex gap-2 text-sm">
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE_DOT[step.tone])} aria-hidden="true" />
              <span className="min-w-0">
                <span className="font-semibold text-slate-900">{step.title}</span>{' '}
                <span className="text-xs text-slate-500">{formatWhen(step.at)}</span>
                {step.detail && <span className="block text-slate-600">{step.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}

function LogList({ activity }: { activity: FlowActivityData }) {
  const [filter, setFilter] = useState<'all' | TimelineEntry['group']>('all')
  const entries = useMemo(() => buildTimeline(activity), [activity])
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: entries.length }
    for (const entry of entries) {
      result[entry.group] = (result[entry.group] ?? 0) + 1
    }
    return result
  }, [entries])
  const shown = filter === 'all' ? entries : entries.filter((entry) => entry.group === filter)

  return (
    <section className="space-y-3">
      <FilterChips
        value={filter}
        counts={counts}
        options={[
          ['all', 'Everything'],
          ['sent', 'Sent or done'],
          ['problem', 'Problems'],
          ['skipped', 'Not sent'],
          ['other', 'In between'],
        ]}
        onChange={(value) => setFilter(value as 'all' | TimelineEntry['group'])}
      />
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
          {entries.length === 0 ? EMPTY_TEXT : 'Nothing in this group.'}
        </p>
      ) : (
        <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {shown.map((entry) => (
            <li key={entry.key} className="flex gap-3 px-3 py-2.5">
              <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', TONE_DOT[entry.tone])} aria-hidden="true" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-slate-900">{entry.title}</span>
                  <span className="text-xs text-slate-500">{formatWhen(entry.at)}</span>
                </p>
                <p className="text-slate-700">{entry.person}</p>
                {entry.detail && <p className="text-slate-600">{entry.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function FilterChips({
  value,
  counts,
  options,
  onChange,
}: {
  value: string
  counts: Record<string, number>
  options: Array<[string, string]>
  onChange: (value: string) => void
}) {
  return (
    <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-semibold',
            value === key
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100',
          )}
        >
          {label} {counts[key] ?? 0}
        </button>
      ))}
    </div>
  )
}
