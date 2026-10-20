import { useEffect, useState } from 'react'
import {
  DAY_LIST_FROM_CLASSES,
  fetchCalendarLayout,
  fetchMonthWeekly,
  saveCalendarLayout,
  saveMonthWeekly,
  type CalendarLayout,
} from '../lib/calendarLayout'

const CHOICES: { value: CalendarLayout; label: string; detail: string }[] = [
  {
    value: 'auto',
    label: 'Automatic',
    detail: `The day list when the busiest weekday has ${DAY_LIST_FROM_CLASSES} or more classes, the month calendar otherwise.`,
  },
  { value: 'classic', label: 'Month calendar', detail: 'Month, week and agenda. The month shows the special class days, and the weekly classes too when ticked below.' },
  {
    value: 'day_list',
    label: 'Day list',
    detail: 'A small month with how many classes each day, and the chosen day by start time. Month, week and agenda are still one click away.',
  },
]

type Choice = { layout: CalendarLayout; monthWeekly: boolean }

// Class Settings > Class options: how the Calendar page shows a day. A school with a few classes a day
// keeps the month calendar; one with dozens a day gets the day list ("Automatic" picks for it). And whether the
// month calendar shows each weekly class beside the cancelled, replacement and extra classes.
export function CalendarLayoutSetting({ onSaved }: { onSaved?: (layout: CalendarLayout, monthWeekly: boolean) => void }) {
  const [saved, setSaved] = useState<Choice | null>(null)
  const [draft, setDraft] = useState<Choice>({ layout: 'auto', monthWeekly: false })
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    void Promise.all([fetchCalendarLayout(), fetchMonthWeekly()]).then(([layout, monthWeekly]) => {
      setSaved({ layout, monthWeekly })
      setDraft({ layout, monthWeekly })
    })
  }, [])

  if (saved === null) return null
  const changed = draft.layout !== saved.layout || draft.monthWeekly !== saved.monthWeekly
  const change = (next: Partial<Choice>) => {
    setDone(false)
    setDraft({ ...draft, ...next })
  }

  async function save() {
    const problem =
      (draft.layout !== saved!.layout ? await saveCalendarLayout(draft.layout) : null) ??
      (draft.monthWeekly !== saved!.monthWeekly ? await saveMonthWeekly(draft.monthWeekly) : null)
    setError(problem)
    if (!problem) {
      setSaved(draft)
      setDone(true)
      onSaved?.(draft.layout, draft.monthWeekly)
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
              checked={draft.layout === choice.value}
              onChange={() => change({ layout: choice.value })}
              className="mt-1 accent-[#fc0c97]"
            />
            <span>
              <span className="block font-semibold text-slate-800">{choice.label}</span>
              <span className="block text-slate-500">{choice.detail}</span>
            </span>
          </label>
        ))}
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm hover:bg-slate-50">
        <input
          type="checkbox"
          checked={draft.monthWeekly}
          onChange={(event) => change({ monthWeekly: event.target.checked })}
          className="mt-1 h-4 w-4 accent-[#fc0c97]"
        />
        <span>
          <span className="block font-semibold text-slate-800">Show weekly classes on the month calendar</span>
          <span className="block text-slate-500">
            The month always shows cancelled days, replacement and extra classes and booked trials. With this on, each
            weekly class shows there too, in a lighter colour. Week and the day list are the same either way.
          </span>
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        {done && !changed && <span className="text-sm font-semibold text-emerald-700">Saved</span>}
        <button
          type="button"
          disabled={!changed}
          onClick={() => void save()}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  )
}
