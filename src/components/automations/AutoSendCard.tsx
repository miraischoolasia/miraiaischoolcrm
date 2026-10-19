import { useState } from 'react'
import { CaretDown, CaretUp } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { hourLabel, senderIsFine, senderState, senderWakesAt, type AutoSendSettings } from '../../lib/autoSend'

type AutoSendCardProps = {
  settings: AutoSendSettings
  // Flows that are on and set to send by themselves.
  autoFlows: number
  canEdit: boolean
  loadError: string | null
  onSave: (change: Partial<Omit<AutoSendSettings, 'senderSeenAt'>>) => Promise<string | null>
}

const fieldClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97] disabled:bg-slate-50 disabled:text-slate-500'

const FROM_HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const UNTIL_HOURS = Array.from({ length: 24 }, (_, index) => index + 1)

// The rules that hold for every flow that sends by itself, and the one switch that stops all of them.
export function AutoSendCard({ settings, autoFlows, canEdit, loadError, onSave }: AutoSendCardProps) {
  const [open, setOpen] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const state = senderState(settings.senderSeenAt, Date.now(), settings.senderNextAt ?? null)

  async function save(change: Partial<Omit<AutoSendSettings, 'senderSeenAt'>>) {
    setProblem(null)
    const result = await onSave(change)
    if (result) {
      setProblem(result)
    }
  }

  const summary = settings.paused
    ? 'Paused: nothing is sent by itself'
    : autoFlows === 0
      ? 'No flow sends by itself'
      : autoFlows === 1
        ? '1 flow sends by itself'
        : `${autoFlows} flows send by themselves`

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-slate-900">Sending by itself</span>
        <span className={cn('flex-1 text-xs', settings.paused ? 'font-semibold text-amber-700' : 'text-slate-500')}>
          {summary}
        </span>
        {open ? <CaretUp size={14} aria-hidden="true" /> : <CaretDown size={14} aria-hidden="true" />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-3">
          {loadError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>}
          {autoFlows > 0 && !senderIsFine(state) && !settings.paused && (
            <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {state === 'never'
                ? 'The sender program has not connected yet, so these messages wait in the approval queue.'
                : 'The sender program has not been seen for a few minutes, so these messages wait in the approval queue.'}
            </p>
          )}
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <input
              type="checkbox"
              checked={settings.paused}
              disabled={!canEdit}
              onChange={(event) => void save({ paused: event.target.checked })}
              className="h-4 w-4 accent-[#fc0c97]"
            />
            Pause everything (nothing is sent by itself)
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>Most messages a day</span>
              <input
                type="number"
                min={1}
                max={200}
                key={settings.dailyCap}
                defaultValue={settings.dailyCap}
                disabled={!canEdit}
                onBlur={(event) => {
                  const value = Math.round(Number(event.target.value) || 0)
                  if (value !== settings.dailyCap) {
                    void save({ dailyCap: value })
                  }
                }}
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>Seconds between two messages</span>
              <input
                type="number"
                min={10}
                max={600}
                key={settings.gapSeconds}
                defaultValue={settings.gapSeconds}
                disabled={!canEdit}
                onBlur={(event) => {
                  const value = Math.round(Number(event.target.value) || 0)
                  if (value !== settings.gapSeconds) {
                    void save({ gapSeconds: value })
                  }
                }}
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>Send from</span>
              <select
                value={settings.fromHour}
                disabled={!canEdit}
                onChange={(event) => void save({ fromHour: Number(event.target.value) })}
                className={fieldClass}
              >
                {FROM_HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {hourLabel(hour)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>Until</span>
              <select
                value={settings.untilHour}
                disabled={!canEdit}
                onChange={(event) => void save({ untilHour: Number(event.target.value) })}
                className={fieldClass}
              >
                {UNTIL_HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {hourLabel(hour)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {problem && (
            <p role="alert" className="text-sm text-red-700">
              {problem}
            </p>
          )}
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
            <li>Hours are Kuala Lumpur time. A message that is due at night goes out in the morning.</li>
            <li>Only people who have written to us before get a message by themselves; anyone else waits in the approval queue.</li>
            <li>A parent who writes STOP, or who replies, is not sent the messages that were still waiting.</li>
            <li>
              Sender program:{' '}
              {state === 'online'
                ? 'running'
                : state === 'resting' && settings.senderNextAt
                  ? `running, resting until ${senderWakesAt(settings.senderNextAt)}`
                  : state === 'offline'
                    ? 'not seen for a few minutes'
                    : 'not connected yet'}
              .
            </li>
          </ul>
        </div>
      )}
    </section>
  )
}
