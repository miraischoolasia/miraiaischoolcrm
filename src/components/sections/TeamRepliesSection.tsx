import { useEffect, useMemo, useState } from 'react'
import { cn } from '../../lib/cn'
import type { ChatwootClient } from '../../lib/chatwootClient'
import { useStaffReplyStats } from '../../hooks/useStaffReplyStats'
import {
  buildTeamRepliesReport,
  AUTOMATION_LABEL,
  formatDuration,
  PHONE_LABEL,
  TARGET_SECONDS,
  type StaffRef,
  type StaffReplyRow,
} from '../../lib/staffReplyStats'
import {
  fetchChannelDays,
  fetchChannelToday,
  fetchKeptDays,
  fetchTeamRepliesScope,
  fetchToday,
  teamRepliesErrorMessage,
  type ChannelDays,
  type KeptDays,
} from '../../lib/teamReplyDaysApi'
import { fetchInboxChannels } from '../../lib/inboxChannels'
import { buildChannelReport, channelInfo, channelNames, type ChannelInfo } from '../../lib/channelReplyStats'
import { InboxCopyPanel } from './InboxCopyPanel'
import { TeamRepliesChannels } from './TeamRepliesChannels'
import {
  addDays,
  dailyTrend,
  dayOf,
  daysBetween,
  type ReplierKey,
  type TrendPoint,
} from '../../../supabase/functions/team-replies/logic'

// How fast and how many chats each person answered. Today is worked out on the spot from today's chats;
// any other period adds up the days the team-replies function kept, so it opens at once.

export type TeamRepliesSectionProps = {
  // Everybody who may have answered, those who left included, for the names.
  staff: StaffRef[]
  client: ChatwootClient | null
  // An admin can copy the old chats into the inbox copy and work out the kept days.
  canCopy?: boolean
  // Fixed "now" for tests.
  now?: Date
  // Someone has working hours (My Team > Working hours): count only working time to begin with.
  hoursInUse?: boolean
  // Fixed channel names for tests (otherwise read from My Team's channels and the inbox).
  channels?: Map<number, ChannelInfo>
}

type Mode = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom'

const modes: Array<{ key: Mode; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'Month' },
  { key: 'custom', label: 'Pick dates' },
]

function percent(part: number, whole: number) {
  return whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`
}

const dayLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const shortDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const asDate = (day: string) => new Date(`${day}T00:00:00Z`)

// The finished days a period covers (kept days end yesterday; today is never kept).
export function periodDays(mode: Exclude<Mode, 'today'>, today: string, month: string, custom: { from: string; to: string }) {
  const yesterday = addDays(today, -1)
  if (mode === 'yesterday') {
    return { first: yesterday, last: yesterday }
  }
  if (mode === '7d') {
    return { first: addDays(today, -7), last: yesterday }
  }
  if (mode === '30d') {
    return { first: addDays(today, -30), last: yesterday }
  }
  if (mode === 'month') {
    const first = `${month}-01`
    const end = addDays(`${addDays(first, 31).slice(0, 7)}-01`, -1)
    return { first, last: end < yesterday ? end : yesterday }
  }
  const from = custom.from || yesterday
  const to = custom.to || yesterday
  const last = to < yesterday ? to : yesterday
  return { first: from <= last ? from : last, last }
}

const PERIOD_KEY = 'teamReplies.period'
const MODES: Mode[] = ['today', 'yesterday', '7d', '30d', 'month', 'custom']
const DAY = /^\d{4}-\d{2}-\d{2}$/

// The period picked last time (a per-computer convenience: anything odd or missing is ignored).
export function readRememberedPeriod(): { mode: Mode; month: string; custom: { from: string; to: string } } | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(PERIOD_KEY) ?? 'null') as {
      mode?: unknown
      month?: unknown
      custom?: { from?: unknown; to?: unknown }
    } | null
    if (!value || !MODES.includes(value.mode as Mode)) {
      return null
    }
    const month = typeof value.month === 'string' && /^\d{4}-\d{2}$/.test(value.month) ? value.month : null
    const from = typeof value.custom?.from === 'string' && DAY.test(value.custom.from) ? value.custom.from : null
    const to = typeof value.custom?.to === 'string' && DAY.test(value.custom.to) ? value.custom.to : null
    if (!month || !from || !to) {
      return null
    }
    return { mode: value.mode as Mode, month, custom: { from, to } }
  } catch {
    return null
  }
}

function rememberPeriod(period: { mode: Mode; month: string; custom: { from: string; to: string } }) {
  try {
    window.localStorage.setItem(PERIOD_KEY, JSON.stringify(period))
  } catch {
    // Private window or storage off: the page simply starts on Last 7 days next time.
  }
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
      <Cell muted={row.ownedOpen === null}>{row.ownedOpen ?? '—'}</Cell>
      <Cell muted={row.waitingNow === null}>
        {row.waitingNow ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">{row.waitingNow}</span>
        ) : (
          (row.waitingNow ?? '—')
        )}
      </Cell>
    </tr>
  )
}

const CHART_HEIGHT = 96
const BAR_COLOR = '#db2777'

// A bar with its top corners rounded and its foot on the baseline.
function barPath(x: number, width: number, height: number) {
  const r = Math.min(4, width / 2, height)
  const top = CHART_HEIGHT - height
  return `M${x},${CHART_HEIGHT} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${CHART_HEIGHT} Z`
}

// One small bar chart per measure (counts and minutes never share an axis).
function DayBars({
  title,
  points,
  value,
  format,
  hovered,
  onHover,
}: {
  title: string
  points: TrendPoint[]
  value: (point: TrendPoint) => number | null
  format: (point: TrendPoint) => string
  hovered: number | null
  onHover: (index: number | null) => void
}) {
  const values = points.map(value)
  const top = Math.max(1, ...values.map((entry) => entry ?? 0))
  const step = 100 / points.length
  const width = Math.max(1.5, step * 0.62)
  return (
    <figure className="min-w-0 flex-1">
      <figcaption className="flex items-baseline justify-between gap-2 text-xs font-bold uppercase tracking-[0.06em] text-slate-500">
        <span>{title}</span>
        <span className="font-semibold normal-case tracking-normal text-slate-400">max {format({ ...points[0], replies: top, medianSeconds: top })}</span>
      </figcaption>
      <svg
        viewBox={`0 0 100 ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        className="mt-1.5 h-24 w-full overflow-visible"
        role="img"
        aria-label={title}
        onMouseLeave={() => onHover(null)}
      >
        <line x1="0" x2="100" y1={CHART_HEIGHT - 0.5} y2={CHART_HEIGHT - 0.5} stroke="#e2e8f0" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {points.map((point, index) => {
          const amount = values[index]
          const height = amount === null || amount === 0 ? 0 : Math.max(2, (amount / top) * (CHART_HEIGHT - 6))
          const x = index * step + (step - width) / 2
          return (
            <g key={point.day} onMouseEnter={() => onHover(index)}>
              {/* The hover target is the whole column, wider than the bar. */}
              <rect x={index * step} y="0" width={step} height={CHART_HEIGHT} fill={hovered === index ? '#fdf2f8' : 'transparent'} />
              {height > 0 && <path d={barPath(x, width, height)} fill={BAR_COLOR} opacity={hovered === null || hovered === index ? 1 : 0.45} />}
              <title>{`${dayLabel.format(asDate(point.day))}: ${format(point)}`}</title>
            </g>
          )
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>{shortDay.format(asDate(points[0].day))}</span>
        <span>{shortDay.format(asDate(points[points.length - 1].day))}</span>
      </div>
    </figure>
  )
}

function TrendCharts({ points }: { points: TrendPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const point = hovered === null ? null : points[hovered]
  return (
    <div className="border-b border-slate-200 px-4 py-3">
      <p className="min-h-5 text-sm text-slate-600" aria-live="polite">
        {point ? (
          <>
            <strong className="text-slate-900">{dayLabel.format(asDate(point.day))}</strong>: {point.replies} replies, typical
            answer <strong className="text-slate-900">{formatDuration(point.medianSeconds)}</strong>
          </>
        ) : (
          'Point at a day to see its numbers.'
        )}
      </p>
      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:gap-6">
        <DayBars
          title="Replies per day"
          points={points}
          value={(entry) => entry.replies}
          format={(entry) => `${entry.replies} replies`}
          hovered={hovered}
          onHover={setHovered}
        />
        <DayBars
          title="Typical answer per day"
          points={points}
          value={(entry) => entry.medianSeconds}
          format={(entry) => formatDuration(entry.medianSeconds)}
          hovered={hovered}
          onHover={setHovered}
        />
      </div>
      <table className="sr-only">
        <caption>Replies and typical answer per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Replies</th>
            <th scope="col">Typical answer</th>
          </tr>
        </thead>
        <tbody>
          {points.map((entry) => (
            <tr key={entry.day}>
              <th scope="row">{dayLabel.format(asDate(entry.day))}</th>
              <td>{entry.replies}</td>
              <td>{formatDuration(entry.medianSeconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TeamRepliesSection({ staff, client, canCopy = false, now, hoursInUse = false, channels }: TeamRepliesSectionProps) {
  const stats = useStaffReplyStats(client)
  const { load } = stats
  const today = dayOf(Math.floor((now ?? new Date()).getTime() / 1000))
  // The period picked last time on this computer comes back when the page opens again.
  const remembered = useMemo(() => readRememberedPeriod(), [])
  const [mode, setMode] = useState<Mode>(remembered?.mode ?? '7d')
  const [month, setMonth] = useState(remembered?.month ?? today.slice(0, 7))
  const [custom, setCustom] = useState(remembered?.custom ?? { from: addDays(today, -14), to: addDays(today, -1) })
  useEffect(() => {
    rememberPeriod({ mode, month, custom })
  }, [mode, month, custom])
  const [kept, setKept] = useState<{ key: string; days: KeptDays; channels: ChannelDays; channelsFailed: boolean } | null>(null)
  // One channel (Chatwoot inbox) or all of them; one person (or the automation, or the phone) or everybody.
  const [inboxFilter, setInboxFilter] = useState<number | null>(null)
  const [staffFilter, setStaffFilter] = useState<ReplierKey | null>(null)
  // The channels' names: the school's own (My Team) first, then the inbox's.
  const [names, setNames] = useState<Map<number, ChannelInfo>>(channels ?? new Map())
  useEffect(() => {
    if (channels) {
      return
    }
    let cancelled = false
    const saved = fetchInboxChannels().catch(() => [])
    const inboxes = (async () => {
      try {
        return (await client?.listInboxes()) ?? []
      } catch {
        return []
      }
    })()
    void Promise.all([saved, inboxes]).then(([mine, theirs]) => {
      if (!cancelled) {
        setNames(channelNames(mine, theirs))
      }
    })
    return () => {
      cancelled = true
    }
  }, [client, channels])
  const [keptError, setKeptError] = useState<string | null>(null)
  const [isLoadingKept, setIsLoadingKept] = useState(false)
  // Bumped after "Copy old chats", so the numbers are read again.
  const [reloads, setReloads] = useState(0)
  // Count only the time the person who answered was working (My Team > Working hours). On by itself once
  // anyone has working hours; until then both ways give the same numbers.
  const [workingTime, setWorkingTime] = useState(hoursInUse)
  useEffect(() => {
    if (hoursInUse) setWorkingTime(true)
  }, [hoursInUse])

  const period = mode === 'today' ? null : periodDays(mode, today, month, custom)
  const periodKey = period ? `${period.first}|${period.last}` : 'today'
  const loadKey = `${periodKey}#${reloads}#${workingTime ? 'work' : 'clock'}`

  // Who owns the open chats and who is waiting: read when the page opens, and again when asked.
  useEffect(() => {
    void load()
  }, [load])

  // Today is worked out on the spot from the inbox copy; any other period adds up the kept days.
  useEffect(() => {
    const [key] = loadKey.split('#')
    let cancelled = false
    setIsLoadingKept(true)
    setKeptError(null)
    const byWork = loadKey.endsWith('#work')
    const read =
      key === 'today'
        ? (byWork ? fetchToday(true) : fetchToday()).then((rows) => ({ rows, doneDays: new Set<string>() }))
        : byWork
          ? fetchKeptDays(key.split('|')[0], key.split('|')[1], true)
          : fetchKeptDays(key.split('|')[0], key.split('|')[1])
    // The channel numbers come beside the people's; when they cannot be read the rest of the page still shows.
    const readChannels = (async (): Promise<{ channels: ChannelDays; failed: boolean }> => {
      try {
        // Someone who sees only their own rows gets no whole-team channel numbers (the database says the same).
        if ((await fetchTeamRepliesScope()) !== 'all') {
          return { channels: null, failed: false }
        }
        const rows =
          key === 'today' ? await fetchChannelToday(byWork) : await fetchChannelDays(key.split('|')[0], key.split('|')[1], byWork)
        return { channels: rows, failed: rows === null }
      } catch {
        return { channels: null, failed: true }
      }
    })()
    Promise.all([read, readChannels])
      .then(([days, channelDays]) => {
        if (!cancelled) {
          setKept({ key: loadKey, days, channels: channelDays.channels, channelsFailed: channelDays.failed })
        }
      })
      .catch((failure) => {
        if (!cancelled) {
          setKeptError(teamRepliesErrorMessage(failure))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingKept(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [loadKey])

  const current = kept && kept.key === loadKey ? kept : null
  const allDayRows = current ? current.days.rows : null
  // The channel and the person picked narrow the whole page: the totals, the chart, the people's rows and the
  // open chats (the channel cards stay the whole team's).
  const dayRows = useMemo(
    () =>
      allDayRows && (inboxFilter !== null || staffFilter !== null)
        ? allDayRows.filter(
            (row) => (inboxFilter === null || (row.inboxId ?? 0) === inboxFilter) && (staffFilter === null || row.replier === staffFilter),
          )
        : allDayRows,
    [allDayRows, inboxFilter, staffFilter],
  )
  const allLive = stats.data?.live ?? null
  const live = useMemo(
    () => (allLive && inboxFilter !== null ? allLive.filter((chat) => (chat.inboxId ?? 0) === inboxFilter) : allLive),
    [allLive, inboxFilter],
  )
  const report = useMemo(
    () =>
      dayRows
        ? buildTeamRepliesReport({
            dayRows,
            staff,
            live,
            nowSeconds: Math.floor((stats.data?.loadedAt ?? Date.now()) / 1000),
          })
        : null,
    [dayRows, staff, live, stats.data?.loadedAt],
  )
  const staffRows = report ? (staffFilter === null ? report.rows : report.rows.filter((row) => row.key === staffFilter)) : []
  const channelReport = useMemo(
    () =>
      current
        ? buildChannelReport({
            channelRows: current.channels,
            dayRows: current.days.rows,
            names,
            staff,
            inboxFilter,
            staffFilter,
          })
        : null,
    [current, names, staff, inboxFilter, staffFilter],
  )
  // Every channel and every person seen in this period, for the filters (the one picked stays listed).
  const channelChoices = useMemo(() => {
    const ids = new Set<number>()
    current?.days.rows.forEach((row) => ids.add(row.inboxId ?? 0))
    current?.channels?.forEach((row) => ids.add(row.inboxId))
    names.forEach((_, id) => ids.add(id))
    if (inboxFilter !== null) ids.add(inboxFilter)
    return [...ids].map((id) => channelInfo(names, id)).sort((a, b) => a.name.localeCompare(b.name))
  }, [current, names, inboxFilter])
  const staffChoices = useMemo(() => {
    const seen = new Map<ReplierKey, string>()
    const named = new Map(staff.map((member) => [member.id, member.name]))
    for (const row of current?.days.rows ?? []) {
      seen.set(
        row.replier,
        row.replier === 'automation'
          ? AUTOMATION_LABEL
          : row.replier === 'phone'
            ? PHONE_LABEL
            : (named.get(row.staffId ?? -1) ?? `Staff #${row.staffId}`),
      )
    }
    if (staffFilter !== null && !seen.has(staffFilter)) {
      const id = staffFilter.startsWith('staff:') ? Number(staffFilter.slice(6)) : -1
      seen.set(staffFilter, named.get(id) ?? staffFilter)
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [current, staff, staffFilter])

  const days = period ? daysBetween(period.first, period.last) : []
  const missing = period && kept && kept.key === loadKey ? days.filter((day) => !kept.days.doneDays.has(day)).length : 0
  // No chart of empty days: before the days are worked out it would only be two blank boxes.
  const trend = period && dayRows && dayRows.length > 0 && days.length > 1 ? dailyTrend(dayRows, days) : null
  const isLoading = isLoadingKept
  const error = keptError
  const yesterday = addDays(today, -1)

  return (
    // w-full: with mx-auto alone the page took the width of its table (830px) and was cut off on a phone.
    <section aria-labelledby="team-replies-title" className="mx-auto w-full min-w-0 max-w-[1600px] space-y-4">
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 id="team-replies-title" className="text-lg font-semibold text-slate-900">
              Team replies
            </h2>
            <p className="text-sm text-slate-500">
              How fast and how many chats each person answered, counted from the CRM's copy of the inbox. Each day is
              kept the night after (Malaysia time); today is worked out when you pick it.
            </p>
          </div>
          <label
            className="flex items-center gap-2 self-center text-sm font-semibold text-slate-600"
            title="Waits count only while the person who answered was working (My Team > Working hours). Time off is left out."
          >
            <input
              type="checkbox"
              checked={workingTime}
              onChange={(event) => setWorkingTime(event.target.checked)}
              className="h-4 w-4 accent-[#fc0c97]"
            />
            Only working hours
          </label>
          <div role="group" aria-label="Period" className="flex flex-wrap gap-1.5">
            {modes.map((entry) => (
              <button
                key={entry.key}
                type="button"
                aria-pressed={mode === entry.key}
                onClick={() => setMode(entry.key)}
                className={cn(
                  'rounded-xl border px-3 py-1.5 text-sm font-semibold transition',
                  mode === entry.key
                    ? 'border-[#fbcfe8] bg-[#fff1f8] text-[#be185d]'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        {(mode === 'month' || mode === 'custom') && (
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
            {mode === 'month' ? (
              <label className="flex items-center gap-2">
                Month
                <input
                  type="month"
                  value={month}
                  max={today.slice(0, 7)}
                  onChange={(event) => event.target.value && setMonth(event.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-900"
                />
              </label>
            ) : (
              <>
                <label className="flex items-center gap-2">
                  From
                  <input
                    type="date"
                    value={custom.from}
                    max={yesterday}
                    onChange={(event) => event.target.value && setCustom((value) => ({ ...value, from: event.target.value }))}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-900"
                  />
                </label>
                <label className="flex items-center gap-2">
                  To
                  <input
                    type="date"
                    value={custom.to}
                    max={yesterday}
                    onChange={(event) => event.target.value && setCustom((value) => ({ ...value, to: event.target.value }))}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-900"
                  />
                </label>
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
          <label className="flex min-w-0 items-center gap-2">
            Channel
            <select
              value={inboxFilter === null ? '' : String(inboxFilter)}
              onChange={(event) => setInboxFilter(event.target.value === '' ? null : Number(event.target.value))}
              className="min-w-0 max-w-[14rem] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900"
            >
              <option value="">All channels</option>
              {channelChoices.map((choice) => (
                <option key={choice.inboxId} value={choice.inboxId}>
                  {choice.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 items-center gap-2">
            Staff
            <select
              value={staffFilter ?? ''}
              onChange={(event) => setStaffFilter(event.target.value === '' ? null : (event.target.value as ReplierKey))}
              className="min-w-0 max-w-[14rem] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900"
            >
              <option value="">Everybody</option>
              {staffChoices.map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
          <span>
            {mode === 'today'
              ? `Today, ${dayLabel.format(asDate(today))}`
              : mode === 'yesterday' && period
                ? `Yesterday, ${dayLabel.format(asDate(period.first))}`
                : period && period.first <= period.last
                ? mode === 'month'
                  ? `${monthLabel.format(asDate(`${month}-01`))}: ${shortDay.format(asDate(period.first))} – ${shortDay.format(asDate(period.last))}`
                  : `${shortDay.format(asDate(period.first))} – ${shortDay.format(asDate(period.last))} (${days.length} days, up to yesterday)`
                : 'No finished day in this period yet.'}
          </span>
          {missing > 0 && (
            <span className="font-semibold text-amber-700">
              {missing === days.length ? 'None of these days has been worked out yet.' : `${missing} of ${days.length} days not worked out yet.`}
            </span>
          )}
        </div>

        {isLoading && (
          <p className="px-4 py-4 text-sm text-slate-500" role="status">
            {mode === 'today' ? "Working out today…" : 'Adding up the days…'}
          </p>
        )}
        {error && !isLoading && <p className="px-4 py-4 text-sm text-red-700">{error}</p>}

        {report && !isLoading && (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
              <span>
                <strong className="text-slate-900">{report.totals.replies}</strong> replies in{' '}
                <strong className="text-slate-900">{report.totals.chats}</strong> chats
              </span>
              <span>
                Typical first answer <strong className="text-slate-900">{formatDuration(report.totals.medianSeconds)}</strong>
              </span>
              <span>
                <strong className="text-slate-900">{percent(report.totals.withinTarget, report.totals.answers)}</strong> answered
                within {TARGET_SECONDS / 60} min
              </span>
              {report.waiting && (
                <span>
                  Waiting now <strong className="text-slate-900">{report.waiting.total}</strong>
                  {report.waiting.overTarget > 0 && (
                    <>
                      {' '}
                      (<strong className="text-amber-700">
                        {report.waiting.overTarget} over {TARGET_SECONDS / 60} min
                      </strong>
                      , longest {formatDuration(report.waiting.longestSeconds)})
                    </>
                  )}
                </span>
              )}
            </div>
            {trend && <TrendCharts points={trend} />}
            {staffRows.length === 0 ? (
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
                    {staffRows.map((row) => (
                      <StaffLine key={row.key} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {channelReport && (
              <TeamRepliesChannels
                report={channelReport}
                manyDays={mode !== 'today' && days.length > 1}
                channelsHidden={current?.channels ? null : current?.channelsFailed ? 'setup' : 'scope'}
              />
            )}
          </>
        )}

        <p className="border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500">
          "Typical answer" is the middle one, so a reply sent the next morning does not spoil it; over several days it is the
          middle of every answer, not of each day's. A message sent from the CRM counts for the person who sent it;
          one sent by itself by an automation shows as "Automation"; one typed on the phone as "Sent from the phone".
          "Open chats" and "Waiting now" are right now
          {stats.data
            ? ` (read ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(stats.data.loadedAt).toLowerCase()})`
            : ''}
          .{' '}
          <button
            type="button"
            disabled={stats.isLoading}
            onClick={() => {
              void load()
              setReloads((count) => count + 1)
            }}
            className="font-semibold text-[#be185d] underline-offset-2 hover:underline disabled:opacity-50"
          >
            {stats.isLoading ? 'Reading…' : 'Read again'}
          </button>
        </p>
      </div>
      {canCopy && <InboxCopyPanel client={client} onFinished={() => setReloads((count) => count + 1)} />}
    </section>
  )
}
