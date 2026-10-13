import { useMemo } from 'react'
import { cn } from '../../lib/cn'
import type { StatsLoad, StatsRange } from '../../hooks/useStaffReplyStats'
import {
  buildStaffReplyReport,
  formatDuration,
  TARGET_SECONDS,
  type StaffRef,
  type StaffReplyRow,
} from '../../lib/staffReplyStats'

export type TeamRepliesCardProps = {
  staff: StaffRef[]
  data: StatsLoad | null
  isLoading: boolean
  progress: { done: number; total: number } | null
  error: string | null
  onLoad: (range: StatsRange) => void
}

const ranges: Array<{ key: StatsRange; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
]

function percent(part: number, whole: number) {
  return whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`
}

function Cell({ children, muted, strong }: { children: React.ReactNode; muted?: boolean; strong?: boolean }) {
  return (
    <td className={cn('whitespace-nowrap px-3 py-2.5 text-right text-sm', muted ? 'text-slate-400' : 'text-slate-700', strong && 'font-semibold text-slate-900')}>
      {children}
    </td>
  )
}

function StaffLine({ row }: { row: StaffReplyRow }) {
  const quiet = row.key === 'nobody'
  return (
    <tr className="border-t border-slate-200">
      <th scope="row" className="whitespace-nowrap px-3 py-2.5 text-left text-sm font-semibold text-slate-900">
        {row.name}
      </th>
      <Cell muted={quiet}>{quiet ? '—' : row.replies}</Cell>
      <Cell muted={quiet}>{quiet ? '—' : row.chats}</Cell>
      <Cell strong muted={row.answers === 0}>
        {formatDuration(row.medianSeconds)}
      </Cell>
      <Cell muted={row.answers === 0}>{formatDuration(row.averageSeconds)}</Cell>
      <Cell muted={row.answers === 0}>{percent(row.withinTarget, row.answers)}</Cell>
      <Cell muted={row.answers === 0}>{formatDuration(row.slowestSeconds)}</Cell>
      <Cell>{row.ownedOpen}</Cell>
      <Cell>
        {row.waitingNow > 0 ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">{row.waitingNow}</span>
        ) : (
          0
        )}
      </Cell>
    </tr>
  )
}

export function TeamRepliesCard({ staff, data, isLoading, progress, error, onLoad }: TeamRepliesCardProps) {
  const report = useMemo(
    () =>
      data
        ? buildStaffReplyReport({
            chats: data.chats,
            staff,
            from: data.from,
            to: data.to,
            nowSeconds: Math.floor(data.loadedAt / 1000),
          })
        : null,
    [data, staff],
  )

  return (
    <section aria-labelledby="admin-team-replies-title" className="rounded-2xl border border-slate-200 bg-white xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h3 id="admin-team-replies-title" className="text-lg font-semibold text-slate-900">
            Team replies
          </h3>
          <p className="text-sm text-slate-500">
            How fast and how many WhatsApp chats each person answered. Read from the inbox when you ask.
          </p>
        </div>
        <div role="group" aria-label="Period" className="flex flex-wrap gap-1.5">
          {ranges.map((range) => (
            <button
              key={range.key}
              type="button"
              disabled={isLoading}
              aria-pressed={data?.range === range.key}
              onClick={() => onLoad(range.key)}
              className={cn(
                'rounded-xl border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-60',
                data?.range === range.key
                  ? 'border-[#fbcfe8] bg-[#fff1f8] text-[#be185d]'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <p className="px-4 py-4 text-sm text-slate-500" role="status">
          {progress
            ? `Reading chats… ${progress.done} of ${progress.total}`
            : 'Finding the chats…'}
        </p>
      )}
      {error && !isLoading && <p className="px-4 py-4 text-sm text-red-700">{error}</p>}
      {!data && !isLoading && !error && (
        <p className="px-4 py-4 text-sm text-slate-500">Pick a period to see the numbers.</p>
      )}

      {report && !isLoading && (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
            <span>
              <strong className="text-slate-900">{report.totals.replies}</strong> replies in{' '}
              <strong className="text-slate-900">{report.totals.chats}</strong> chats
            </span>
            <span>
              Typical first answer{' '}
              <strong className="text-slate-900">{formatDuration(report.totals.medianSeconds)}</strong>
            </span>
            <span>
              <strong className="text-slate-900">{percent(report.totals.withinTarget, report.totals.answers)}</strong>{' '}
              answered within {TARGET_SECONDS / 60} min
            </span>
            <span>
              Waiting now <strong className="text-slate-900">{report.waiting.total}</strong>
              {report.waiting.overTarget > 0 && (
                <>
                  {' '}
                  (<strong className="text-amber-700">{report.waiting.overTarget} over {TARGET_SECONDS / 60} min</strong>,
                  longest {formatDuration(report.waiting.longestSeconds)})
                </>
              )}
            </span>
          </div>
          {report.rows.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">Nobody has answered a chat in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="text-xs font-bold uppercase tracking-[0.06em] text-slate-500">
                    <th scope="col" className="px-3 py-2 text-left">Staff</th>
                    <th scope="col" className="px-3 py-2 text-right">Replies</th>
                    <th scope="col" className="px-3 py-2 text-right">Chats handled</th>
                    <th scope="col" className="px-3 py-2 text-right">Typical answer</th>
                    <th scope="col" className="px-3 py-2 text-right">Average</th>
                    <th scope="col" className="px-3 py-2 text-right">Within {TARGET_SECONDS / 60} min</th>
                    <th scope="col" className="px-3 py-2 text-right">Slowest</th>
                    <th scope="col" className="px-3 py-2 text-right">Open chats</th>
                    <th scope="col" className="px-3 py-2 text-right">Waiting now</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <StaffLine key={row.key} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500">
            "Typical answer" is the middle one, so a reply sent the next morning does not spoil it. A message
            sent from the CRM counts for the person who sent it, including an approved automation message;
            one typed on the phone shows as "Sent from the phone". Read{' '}
            {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(data!.loadedAt).toLowerCase()}.
          </p>
        </>
      )}
    </section>
  )
}
