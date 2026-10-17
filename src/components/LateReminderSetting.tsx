import { useEffect, useState } from 'react'
import { defaultLateReminder, fetchLateReminderSettings, fillLateReminder, saveLateReminderSettings, type LateReminderSettings } from '../lib/lateReminder'

// Class Settings > Zoom: the WhatsApp message a teacher can send from the
// live class console to the parent of a child who is not in Zoom yet, and
// how long after the start the button shows.
export function LateReminderSetting() {
  const [saved, setSaved] = useState<LateReminderSettings | null>(null)
  const [draft, setDraft] = useState<LateReminderSettings>(defaultLateReminder)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    void fetchLateReminderSettings().then((value) => {
      setSaved(value)
      setDraft(value)
    })
  }, [])

  if (saved === null) return null
  const unchanged = draft.afterMinutes === saved.afterMinutes && draft.text === saved.text

  async function save() {
    const problem = await saveLateReminderSettings(draft)
    setError(problem)
    if (!problem) {
      setSaved(draft)
      setDone(true)
    }
  }

  return (
    <div className="mt-6 space-y-2 border-t border-slate-200 pt-5">
      <h3 className="text-base font-semibold text-slate-900">Reminder to parents of late children</h3>
      <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        Show "Remind the parent" when a child is not in Zoom
        <input
          type="number"
          min={0}
          max={120}
          value={draft.afterMinutes}
          onChange={(event) => {
            setDone(false)
            setDraft({ ...draft, afterMinutes: Math.min(120, Math.max(0, Math.round(Number(event.target.value) || 0))) })
          }}
          className="w-20 rounded-xl border border-slate-200 px-2 py-1"
          aria-label="Minutes after the start"
        />
        minutes after the start.
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Message ({'{child}'} = first name, {'{class}'} = class, {'{time}'} = start time)</span>
        <textarea
          rows={3}
          maxLength={1000}
          value={draft.text}
          onChange={(event) => {
            setDone(false)
            setDraft({ ...draft, text: event.target.value })
          }}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
      </label>
      <p className="text-xs text-slate-500">Example: {fillLateReminder(draft.text, { child: 'Aisyah Tan', className: 'HOA 6-8', time: '10:00 am' })}</p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        {done && unchanged && <span className="text-sm font-semibold text-emerald-700">Saved</span>}
        <button
          type="button"
          disabled={unchanged || draft.text.trim() === ''}
          onClick={() => void save()}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  )
}
