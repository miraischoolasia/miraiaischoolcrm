import { useEffect, useState } from 'react'
import { DAY_LIST_FROM_CLASSES, fetchCalendarLayout, saveCalendarLayout, type CalendarLayout } from '../lib/calendarLayout'

const CHOICES: { value: CalendarLayout; label: string; detail: string }[] = [
  {
    value: 'auto',
    label: 'Automatic',
    detail: `The day list when the busiest weekday has ${DAY_LIST_FROM_CLASSES} or more classes, the month calendar otherwise.`,
  },
  { value: 'classic', label: 'Month calendar', detail: 'Month, week and agenda, with a card for every class.' },
  {
    value: 'day_list',
    label: 'Day list',
    detail: 'A small month with how many classes each day, and the chosen day by start time. Month, week and agenda are still one click away.',
  },
]

// Class Settings > Class options: how the Calendar page shows a day. A school with a few classes a day
// keeps the month calendar; one with dozens a day gets the day list ("Automatic" picks for it).
export function CalendarLayoutSetting({ onSaved }: { onSaved?: (layout: CalendarLayout) => void }) {
  const [saved, setSaved] = useState<CalendarLayout | null>(null)
  const [draft, setDraft] = useState<CalendarLayout>('auto')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    void fetchCalendarLayout().then((value) => {
      setSaved(value)
      setDraft(value)
    })
  }, [])

  if (saved === null) return null

  async function save() {
    const problem = await saveCalendarLayout(draft)
    setError(problem)
    if (!problem) {
      setSaved(draft)
      setDone(true)
      onSaved?.(draft)
    }
  }

  return (
    <div className="mt-6 space-y-2 border-t border-slate-200 pt-5">
      <h3 className="text-base font-semibold text-slate-900">Calendar</h3>
      <p className="text-sm text-slate-500">How the Calendar page shows a day.</p>
      <div role="radiogroup" aria-label="Calendar layout" className="space-y-2">
        {CHOICES.map((choice) => (
          <label key={choice.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm hover:bg-slate-50">
            <input
              type="radio"
              name="calendar-layout"
              value={choice.value}
              checked={draft === choice.value}
              onChange={() => {
                setDone(false)
                setDraft(choice.value)
              }}
              className="mt-1 accent-[#fc0c97]"
            />
            <span>
              <span className="block font-semibold text-slate-800">{choice.label}</span>
              <span className="block text-slate-500">{choice.detail}</span>
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        {done && draft === saved && <span className="text-sm font-semibold text-emerald-700">Saved</span>}
        <button
          type="button"
          disabled={draft === saved}
          onClick={() => void save()}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  )
}
