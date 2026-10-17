import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Class Settings > Zoom: how much of the lesson a child must be in the Zoom
// meeting for "Fill from Zoom" to mark them there.
export function ZoomAttendanceRule() {
  const [saved, setSaved] = useState<number | null>(null)
  const [draft, setDraft] = useState(50)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!supabase) return
    void supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'zoom_attendance')
      .maybeSingle()
      .then(({ data }) => {
        const percent = Number((data?.value as { present_percent?: unknown } | null)?.present_percent ?? 50)
        const value = Number.isInteger(percent) && percent >= 1 && percent <= 100 ? percent : 50
        setSaved(value)
        setDraft(value)
      })
  }, [])

  async function save() {
    if (!supabase) return
    const { error: saveError } = await supabase.rpc('set_zoom_attendance', { p_present_percent: draft })
    setError(saveError ? saveError.message || 'Failed to save.' : null)
    if (!saveError) {
      setSaved(draft)
      setDone(true)
    }
  }

  if (saved === null) return null

  return (
    <div className="mt-6 space-y-2 border-t border-slate-200 pt-5">
      <h3 className="text-base font-semibold text-slate-900">Attendance from Zoom</h3>
      <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        A child counts as there after
        <input
          type="number"
          min={1}
          max={100}
          value={draft}
          onChange={(event) => {
            setDone(false)
            setDraft(Math.min(100, Math.max(1, Number(event.target.value) || 1)))
          }}
          className="w-20 rounded-xl border border-slate-200 px-2 py-1"
          aria-label="Percent of the lesson"
        />
        % of the lesson in the meeting.
      </label>
      <p className="text-xs text-slate-500">Used by "Fill from Zoom" in the attendance form; the teacher still checks it.</p>
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
