import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Rule = { percent: number; lateMinutes: number; dropGraceSeconds: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min))

// Class Settings > Zoom: how much of the lesson a child must be in the Zoom
// meeting for "Fill from Zoom" to mark them there, when a child counts as
// late on the teacher's room list, and how much earlier a dropped connection
// really ended (Zoom only reports it after its own time-out).
export function ZoomAttendanceRule() {
  const [saved, setSaved] = useState<Rule | null>(null)
  const [draft, setDraft] = useState<Rule>({ percent: 50, lateMinutes: 5, dropGraceSeconds: 0 })
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
        const value = (data?.value ?? {}) as { present_percent?: unknown; late_minutes?: unknown; drop_grace_seconds?: unknown }
        const rule = {
          percent: clamp(Number(value.present_percent ?? 50), 1, 100),
          lateMinutes: clamp(Number(value.late_minutes ?? 5), 0, 120),
          dropGraceSeconds: clamp(Number(value.drop_grace_seconds ?? 0), 0, 900),
        }
        setSaved(rule)
        setDraft(rule)
      })
  }, [])

  const change = (patch: Partial<Rule>) => {
    setDone(false)
    setDraft((current) => ({ ...current, ...patch }))
  }

  async function save() {
    if (!supabase || !saved) return
    let saveError = null
    if (draft.percent !== saved.percent) {
      ;({ error: saveError } = await supabase.rpc('set_zoom_attendance', { p_present_percent: draft.percent }))
    }
    if (!saveError && (draft.lateMinutes !== saved.lateMinutes || draft.dropGraceSeconds !== saved.dropGraceSeconds)) {
      ;({ error: saveError } = await supabase.rpc('set_zoom_room_rules', {
        p_drop_grace_seconds: draft.dropGraceSeconds,
        p_late_minutes: draft.lateMinutes,
      }))
    }
    setError(saveError ? saveError.message || 'Failed to save.' : null)
    if (!saveError) {
      setSaved(draft)
      setDone(true)
    }
  }

  if (saved === null) return null
  const unchanged = draft.percent === saved.percent && draft.lateMinutes === saved.lateMinutes && draft.dropGraceSeconds === saved.dropGraceSeconds
  const input = 'w20 rounded-xl border border-slate-200 px-2 py-1'

  return (
    <div className="mt-6 space-y-2 border-t border-slate-200 pt-5">
      <h3 className="text-base font-semibold text-slate-900">Attendance from Zoom</h3>
      <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        A child counts as there after
        <input
          type="number"
          min={1}
          max={100}
          value={draft.percent}
          onChange={(event) => change({ percent: clamp(Number(event.target.value), 1, 100) })}
          className={input}
          aria-label="Percent of the lesson"
        />
        % of the lesson in the meeting.
      </label>
      <p className="text-xs text-slate-500">Used by "Fill from Zoom" in the attendance form; the teacher still checks it.</p>
      <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        Show a child as late when they first join more than
        <input
          type="number"
          min={0}
          max={120}
          value={draft.lateMinutes}
          onChange={(event) => change({ lateMinutes: clamp(Number(event.target.value), 0, 120) })}
          className={input}
          aria-label="Minutes after the start"
        />
        minutes after the start.
      </label>
      <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        When a child's connection drops, they really left
        <input
          type="number"
          min={0}
          max={900}
          value={draft.dropGraceSeconds}
          onChange={(event) => change({ dropGraceSeconds: clamp(Number(event.target.value), 0, 900) })}
          className={input}
          aria-label="Seconds before Zoom reports it"
        />
        seconds before Zoom reports it.
      </label>
      <p className="text-xs text-slate-500">
        Zoom only says "left" a few minutes after a browser tab is closed or Wi-Fi is lost. Those minutes are taken off the child's time.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        {done && unchanged && <span className="text-sm font-semibold text-emerald-700">Saved</span>}
        <button
          type="button"
          disabled={unchanged}
          onClick={() => void save()}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  )
}
