import { useEffect, useState } from 'react'
import { Plus, X } from '@phosphor-icons/react'
import {
  DEFAULT_FOLLOW_UP_SCHEDULE,
  MAX_FOLLOW_UP_STEPS,
  fetchFollowUpSchedule,
  followUpScheduleError,
  saveFollowUpSchedule,
  type FollowUpSchedule,
} from '../lib/followUpSchedule'

const field = 'rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-[#fc0c97]'

// Class Settings: the school's automatic follow-ups (white label). A new lead is followed up on these days after it
// came in, at this time, by the person who handles it; a parent who writes again after the quiet days starts a new
// round (its first follow-up only).
export function FollowUpScheduleSetting() {
  const [saved, setSaved] = useState<FollowUpSchedule | null>(null)
  const [draft, setDraft] = useState<FollowUpSchedule>(DEFAULT_FOLLOW_UP_SCHEDULE)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let live = true
    void fetchFollowUpSchedule().then((schedule) => {
      if (live) {
        setSaved(schedule)
        setDraft(schedule)
      }
    })
    return () => {
      live = false
    }
  }, [])

  const problem = followUpScheduleError(draft)
  const changed = saved !== null && JSON.stringify(saved) !== JSON.stringify(draft)

  async function save() {
    setSaving(true)
    setMessage(null)
    const failure = await saveFollowUpSchedule(draft)
    setSaving(false)
    if (failure) {
      setMessage({ kind: 'error', text: failure })
      return
    }
    setSaved(draft)
    setMessage({ kind: 'ok', text: 'Saved. New leads use it from now on.' })
  }

  const setDay = (index: number, value: string) =>
    setDraft((current) => ({ ...current, days: current.days.map((day, position) => (position === index ? Number(value) : day)) }))

  return (
    <section aria-label="Automatic follow-ups" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Automatic follow-ups</h3>
        <p className="text-sm text-slate-600">
          Every new lead is followed up on these days after it came in, by the person who handles it. Leads that were here
          before are not scheduled. Converted or Lost leads stop.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
        />
        Schedule follow-ups for new leads
      </label>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-slate-700">Days after the lead came in</p>
        <div className="flex flex-wrap items-center gap-2">
          {draft.days.map((day, index) => (
            <span key={index} className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-sm text-slate-700">
              {index + 1}.
              <input
                type="number"
                min={0}
                max={365}
                value={Number.isFinite(day) ? day : ''}
                onChange={(event) => setDay(index, event.target.value)}
                aria-label={`Follow-up ${index + 1}, days after`}
                className={`${field} w-16`}
              />
              {draft.days.length > 1 && (
                <button
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, days: current.days.filter((_, position) => position !== index) }))}
                  aria-label={`Remove follow-up ${index + 1}`}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
          {draft.days.length < MAX_FOLLOW_UP_STEPS && (
            <button
              type="button"
              onClick={() =>
                setDraft((current) => ({ ...current, days: [...current.days, (current.days[current.days.length - 1] ?? 0) + 7] }))
              }
              className="inline-flex items-center gap-1 text-sm font-medium text-[#be185d] hover:underline"
            >
              <Plus size={12} aria-hidden="true" /> Add a follow-up
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          At
          <input
            type="time"
            value={draft.time}
            onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))}
            aria-label="Follow-up time"
            className={field}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          A parent who writes again after
          <input
            type="number"
            min={1}
            max={365}
            value={draft.round2AfterDays}
            onChange={(event) => setDraft((current) => ({ ...current, round2AfterDays: Number(event.target.value) }))}
            aria-label="Quiet days before a new round"
            className={`${field} w-16`}
          />
          quiet days starts a new round
        </label>
      </div>
      {changed && problem && <p className="text-sm text-amber-700">{problem}</p>}
      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'text-sm text-red-700' : 'text-sm text-emerald-700'}>
          {message.text}
        </p>
      )}
      <button
        type="button"
        disabled={!changed || Boolean(problem) || saving}
        onClick={() => void save()}
        className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save follow-ups'}
      </button>
    </section>
  )
}
