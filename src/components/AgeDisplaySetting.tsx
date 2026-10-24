import { useState } from 'react'
import { reloadAgeDisplay, useAgeDisplay, type AgeDisplayMode } from '../lib/ageDisplay'
import { supabase } from '../lib/supabase'

// Class Settings > Subjects & ages > Age or grade: whether this school shows a child's age (Mirai) or school grade
// (Year 1-6 / Form 1-5, goes up by itself each 1 January). Changing it only changes what is shown and asked; nothing
// already saved is lost, and a child with no grade yet is shown without one (an age is never turned into a grade).
export function AgeDisplaySetting() {
  const mode = useAgeDisplay()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function choose(next: AgeDisplayMode) {
    if (!supabase || next === mode) {
      return
    }
    setSaving(true)
    setError(null)
    const { error: failure } = await supabase.rpc('set_age_display', { p_mode: next })
    setSaving(false)
    if (failure) {
      setError(failure.message || 'Failed to save.')
      return
    }
    await reloadAgeDisplay()
  }

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-base font-semibold text-slate-900">Age or grade</h3>
      <p className="text-sm text-slate-600">
        How a child is described on Leads, Students and when a trial is booked.
      </p>
      <div role="radiogroup" aria-label="Age or grade" className="flex flex-wrap gap-3">
        {(
          [
            { value: 'age', label: 'Age (9 years old)' },
            { value: 'grade', label: 'School grade (Year 4, Form 2)' },
          ] as const
        ).map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="radio"
              name="age-display"
              checked={mode === option.value}
              disabled={saving}
              onChange={() => void choose(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      {mode === 'grade' && (
        <p className="text-xs text-slate-500">The grade goes up by one every 1 January by itself.</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
