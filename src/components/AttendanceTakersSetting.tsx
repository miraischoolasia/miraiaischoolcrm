import { useEffect, useState } from 'react'
import {
  fetchAttendanceTakers,
  saveAttendanceTakerRules,
  type AttendanceTakerRules,
} from '../lib/attendanceTakers'

// Class Settings > Attendance: besides admin and the class teacher, may the
// class's other teachers (assistants) and a day's substitute take attendance?
// Each school chooses; both are on unless switched off.
export function AttendanceTakersSetting({ onSaved }: { onSaved?: (rules: AttendanceTakerRules) => void }) {
  const [rules, setRules] = useState<AttendanceTakerRules | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchAttendanceTakers().then((takers) => {
      if (!cancelled) setRules(takers.rules)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function change(patch: Partial<AttendanceTakerRules>) {
    if (!rules) return
    const next = { ...rules, ...patch }
    setIsSaving(true)
    const failure = await saveAttendanceTakerRules(next)
    setIsSaving(false)
    setError(failure)
    if (!failure) {
      setRules(next)
      onSaved?.(next)
    }
  }

  if (rules === null) return null

  return (
    <div className="mt-6 space-y-2 border-t border-slate-200 pt-5">
      <h3 className="text-base font-semibold text-slate-900">Who takes attendance</h3>
      <p className="text-sm text-slate-500">Admin and the class teacher always can. Also:</p>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={rules.assistants}
          disabled={isSaving}
          onChange={(event) => void change({ assistants: event.target.checked })}
        />
        The class&apos;s other teachers (assistants)
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={rules.substitutes}
          disabled={isSaving}
          onChange={(event) => void change({ substitutes: event.target.checked })}
        />
        A substitute teacher, on the day they cover (set when you open that class day on the calendar)
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
