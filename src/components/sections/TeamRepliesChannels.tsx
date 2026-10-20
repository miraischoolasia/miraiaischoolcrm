import { cn } from '../../lib/cn'
import { channelKindLabels, type ChannelKind } from '../../lib/inboxChannels'
import { formatDuration } from '../../lib/staffReplyStats'
import type { ChannelReport, ChannelSummary } from '../../lib/channelReplyStats'

// Team Replies by channel: one card per channel (what came in, what was cleared, how fast), then who answered
// which channel. The numbers come from the same kept days as the rest of the page.

const kindStyle: Record<ChannelKind, string> = {
  whatsapp: 'bg-emerald-50 text-emerald-700',
  messenger: 'bg-sky-50 text-sky-700',
  instagram: 'bg-fuchsia-50 text-fuchsia-700',
  other: 'bg-slate-100 text-slate-600',
}

const dayLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

function percent(part: number, whole: number) {
  return whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`
}

function Kind({ kind }: { kind: ChannelKind }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em]', kindStyle[kind])}>
      {channelKindLabels[kind]}
    </span>
  )
}

function Figure({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold leading-tight text-slate-900">{value}</dd>
      {hint && <dd className="text-xs text-slate-500">{hint}</dd>}
    </div>
  )
}

function ChannelCard({ channel, manyDays }: { channel: ChannelSummary; manyDays: boolean }) {
  return (
    <article className="min-w-0 rounded-xl border border-slate-200 p-3" aria-label={channel.name}>
      <header className="flex flex-wrap items-center gap-2">
        <h4 className="min-w-0 truncate text-sm font-semibold text-slate-900">{channel.name}</h4>
        <Kind kind={channel.kind} />
      </header>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        <Figure label="Messages in" value={channel.incomingMessages} />
        <Figure label="Chats in" value={channel.incomingChats} />
        <Figure
          label="Answered"
          value={
            <>
              {channel.repliedChats}
              <span className="text-sm font-normal text-slate-500"> of {channel.incomingChats}</span>
            </>
          }
          hint={percent(channel.repliedChats, channel.incomingChats)}
        />
        <Figure label="Marked Done" value={channel.doneChats} />
        <Figure
          label="First answer, average"
          value={formatDuration(channel.firstAverageSeconds)}
          hint={channel.firstAnswers > 0 ? `typical ${formatDuration(channel.firstMedianSeconds)} · ${channel.firstAnswers} chats` : 'no answer to time'}
        />
        <Figure
          label="Reply time, average"
          value={formatDuration(channel.averageSeconds)}
          hint={`typical ${formatDuration(channel.medianSeconds)} · ${channel.replies} replies`}
        />
      </dl>
      {manyDays && channel.days.length > 0 && (
        <details className="mt-3 border-t border-slate-100 pt-2">
          <summary className="cursor-pointer text-xs font-semibold text-[#be185d]">Each day</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[360px] text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th scope="col" className="py-1 pr-2 font-semibold">Day</th>
                  <th scope="col" className="py-1 pr-2 text-right font-semibold">Messages</th>
                  <th scope="col" className="py-1 pr-2 text-right font-semibold">Chats</th>
                  <th scope="col" className="py-1 pr-2 text-right font-semibold">Answered</th>
                  <th scope="col" className="py-1 pr-2 text-right font-semibold">Done</th>
                  <th scope="col" className="py-1 text-right font-semibold">First answer</th>
                </tr>
              </thead>
              <tbody>
                {channel.days.map((entry) => (
                  <tr key={entry.day} className="border-t border-slate-100 text-slate-700">
                    <th scope="row" className="whitespace-nowrap py-1 pr-2 text-left font-medium">
                      {dayLabel.format(new Date(`${entry.day}T00:00:00Z`))}
                    </th>
                    <td className="py-1 pr-2 text-right">{entry.incomingMessages}</td>
                    <td className="py-1 pr-2 text-right">{entry.incomingChats}</td>
                    <td className="py-1 pr-2 text-right">{entry.repliedChats}</td>
                    <td className="py-1 pr-2 text-right">{entry.doneChats}</td>
                    <td className="py-1 text-right">{formatDuration(entry.firstAverageSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </article>
  )
}

export function TeamRepliesChannels({
  report,
  manyDays,
  channelsHidden,
}: {
  report: ChannelReport
  manyDays: boolean
  // Why there are no channel numbers: 'setup' (not in the database yet) or 'scope' (sees only their own rows).
  channelsHidden: 'setup' | 'scope' | null
}) {
  return (
    <>
      <div className="border-t border-slate-200 px-4 py-3">
        <h3 className="text-sm font-bold uppercase tracking-[0.06em] text-slate-500">By channel</h3>
        {report.channels === null ? (
          <p className="mt-2 text-sm text-slate-500">
            {channelsHidden === 'scope'
              ? 'The numbers of each channel are for whoever sees everybody’s Team Replies.'
              : 'The numbers of each channel are not in the database yet. Ask the admin to update the database.'}
          </p>
        ) : report.channels.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No message came in on any channel in this period.</p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {report.channels.map((channel) => (
              <ChannelCard key={channel.inboxId} channel={channel} manyDays={manyDays} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200">
        <h3 className="px-4 pt-3 text-sm font-bold uppercase tracking-[0.06em] text-slate-500">Who answered which channel</h3>
        {report.staff.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-500">Nobody has answered a chat in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-1 w-full min-w-[640px]" aria-label="Who answered which channel">
              <thead>
                <tr className="text-xs font-bold uppercase tracking-[0.06em] text-slate-500">
                  <th scope="col" className="px-3 py-2 text-left">Staff / channel</th>
                  <th scope="col" className="px-3 py-2 text-right">Replies</th>
                  <th scope="col" className="px-3 py-2 text-right">Chats</th>
                  <th scope="col" className="px-3 py-2 text-right">Marked Done</th>
                  <th scope="col" className="px-3 py-2 text-right">Average reply</th>
                  <th scope="col" className="px-3 py-2 text-right">Typical reply</th>
                </tr>
              </thead>
              {report.staff.map((person) => (
                <tbody key={person.key} className="border-t border-slate-200">
                  <tr className="bg-slate-50/70">
                    <th scope="row" className="whitespace-nowrap px-3 py-2 text-left text-sm font-semibold text-slate-900">
                      {person.name}
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {person.total.channels} {person.total.channels === 1 ? 'channel' : 'channels'}
                      </span>
                    </th>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-slate-900">{person.total.replies}</td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-slate-900">{person.total.chats}</td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-slate-900">{person.total.done}</td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-slate-900">{formatDuration(person.total.averageSeconds)}</td>
                    <td className="px-3 py-2 text-right text-sm text-slate-700">{formatDuration(person.total.medianSeconds)}</td>
                  </tr>
                  {person.lines.map((line) => (
                    <tr key={line.inboxId} className="border-t border-slate-100">
                      <th scope="row" className="whitespace-nowrap py-2 pl-7 pr-3 text-left text-sm font-normal text-slate-700">
                        <span className="mr-2">{line.channel}</span>
                        <Kind kind={line.kind} />
                      </th>
                      <td className="px-3 py-2 text-right text-sm text-slate-700">{line.replies}</td>
                      <td className="px-3 py-2 text-right text-sm text-slate-700">{line.chats}</td>
                      <td className="px-3 py-2 text-right text-sm text-slate-700">{line.done}</td>
                      <td className={cn('px-3 py-2 text-right text-sm', line.answers === 0 ? 'text-slate-400' : 'text-slate-700')}>
                        {formatDuration(line.averageSeconds)}
                      </td>
                      <td className={cn('px-3 py-2 text-right text-sm', line.answers === 0 ? 'text-slate-400' : 'text-slate-700')}>
                        {formatDuration(line.medianSeconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </div>

      <p className="border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500">
        A channel is one WhatsApp number, Messenger Page or Instagram account. "Messages in" are the parents'
        messages; "Chats in" the chats a parent wrote in that day. "Answered" is how many of those chats got a
        message from us after the parent's last message of the day, the same day. "Marked Done" is how many chats were
        marked Done that day (written down from the day this was switched on; chats already Done then count once, at their last message);
        a Done counts for whoever sent our last message before it. "First answer" is how long each chat waited for
        our first answer of the day; "Reply time" counts every answer to a waiting parent. Over several days the
        channel numbers add the days together (a chat that writes on two days counts twice); a person's chats count once.
      </p>
    </>
  )
}
