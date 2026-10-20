import { useEffect, useState } from 'react'
import {
  dailySettingsProblem,
  dailyTaskKinds,
  dailyTaskProblem,
  defaultDailySettings,
  fetchDailySettings,
  saveDailySettings,
  saveDailyTask,
  type DailySettings,
  type DailyTask,
  type DailyTaskKind,
} from '../lib/studentDaily'

type Draft = { id: number | null; label: string; kind: DailyTaskKind; target: number; coins: number; is_active: boolean }

const emptyDraft: Draft = { id: null, label: '', kind: 'video', target: 1, coins: 3, is_active: true }

// Class Settings > Student app: the app's daily check-in, the daily task
// list (hide a task instead of deleting it) and daily practice (the choice
// and fill-in questions teachers asked in class, asked again).
export function StudentDailySettings() {
  const [saved, setSaved] = useState<DailySettings | null>(null)
  const [draft, setDraft] = useState<DailySettings>(defaultDailySettings)
  const [tasks, setTasks] = useState<DailyTask[]>([])
  const [editing, setEditing] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const value = await fetchDailySettings()
      setSaved(value.settings)
      setDraft(value.settings)
      setTasks(value.tasks)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const dirty = saved !== null && JSON.stringify(draft) !== JSON.stringify(saved)
  const settingsProblem = dailySettingsProblem(draft)

  function change(next: DailySettings) {
    setDone(false)
    setDraft(next)
  }

  async function saveSettings() {
    setBusy(true)
    const failure = await saveDailySettings(draft)
    setBusy(false)
    setError(failure)
    if (!failure) {
      setSaved(draft)
      setDone(true)
    }
  }

  async function saveTask(task: Draft) {
    const problem = dailyTaskProblem(task)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    const failure = await saveDailyTask(task)
    setBusy(false)
    setError(failure)
    if (!failure) {
      setEditing(null)
      await load()
    }
  }

  const numberInput = (value: number, onChange: (next: number) => void, label: string, max: number) => (
    <input
      type="number"
      min={1}
      max={max}
      value={value}
      aria-label={label}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-sm"
    />
  )

  if (saved === null && !error) {
    return <div className="py-6 text-center text-sm text-slate-500">Loading…</div>
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Daily check-in, tasks and practice</h3>
        <p className="text-sm text-slate-500">
          Coins a child earns each day in the student app. They are points like any other (Students &gt; the child&apos;s points).
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <input type="checkbox" checked={draft.checkin_enabled} onChange={(event) => change({ ...draft, checkin_enabled: event.target.checked })} className="h-4 w-4 accent-[#fc0c97]" />
            Daily check-in
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            Coins for checking in {numberInput(draft.checkin_coins, (next) => change({ ...draft, checkin_coins: next }), 'Coins for checking in', 100)}
          </label>
        </div>
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <input type="checkbox" checked={draft.practice_enabled} onChange={(event) => change({ ...draft, practice_enabled: event.target.checked })} className="h-4 w-4 accent-[#fc0c97]" />
            Daily practice
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            Questions a day {numberInput(draft.practice_per_day, (next) => change({ ...draft, practice_per_day: next }), 'Practice questions a day', 30)}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            Coins for each right answer {numberInput(draft.practice_coins, (next) => change({ ...draft, practice_coins: next }), 'Coins for a right practice answer', 100)}
          </label>
          <p className="text-xs text-slate-500">
            Uses the choice and fill-in questions teachers asked in the child&apos;s lessons (the last 180 days) once they are closed.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <input type="checkbox" checked={draft.tasks_enabled} onChange={(event) => change({ ...draft, tasks_enabled: event.target.checked })} className="h-4 w-4 accent-[#fc0c97]" />
          Daily tasks
        </label>
        <div className="flex items-center justify-end gap-3">
          {settingsProblem && <span className="text-sm text-red-700">{settingsProblem}</span>}
          {done && !dirty && <span className="text-sm font-semibold text-emerald-700">Saved</span>}
          <button
            type="button"
            disabled={!dirty || Boolean(settingsProblem) || busy}
            onClick={() => void saveSettings()}
            className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-2 font-semibold">Task</th>
              <th className="py-2 font-semibold">Counts</th>
              <th className="py-2 font-semibold">Times</th>
              <th className="py-2 font-semibold">Coins</th>
              <th className="py-2 font-semibold">Shown</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className={`border-t border-slate-100 ${task.is_active ? '' : 'text-slate-400'}`}>
                <td className="py-2">{task.label}</td>
                <td className="py-2">{dailyTaskKinds.find((kind) => kind.kind === task.kind)?.label ?? task.kind}</td>
                <td className="py-2">{task.target}</td>
                <td className="py-2">{task.coins}</td>
                <td className="py-2">{task.is_active ? 'Yes' : 'Hidden'}</td>
                <td className="py-2 text-right">
                  <button type="button" className="rounded-lg px-2 py-1 text-sm font-semibold text-[#fc0c97] hover:bg-pink-50" onClick={() => setEditing({ ...task })}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing ? (
        <div className="grid gap-2 rounded-xl border border-pink-100 bg-pink-50/40 p-3 sm:grid-cols-[1fr_1fr_5rem_5rem_auto] sm:items-end">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Task name</span>
            <input type="text" maxLength={60} value={editing.label} onChange={(event) => setEditing({ ...editing, label: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">What it counts</span>
            <select value={editing.kind} onChange={(event) => setEditing({ ...editing, kind: event.target.value as DailyTaskKind })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {dailyTaskKinds.map((kind) => (
                <option key={kind.kind} value={kind.kind}>
                  {kind.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Times</span>
            {numberInput(editing.target, (next) => setEditing({ ...editing, target: next }), 'Times', 20)}
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Coins</span>
            {numberInput(editing.coins, (next) => setEditing({ ...editing, coins: next }), 'Coins', 100)}
          </label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-sm text-slate-700">
              <input type="checkbox" checked={editing.is_active} onChange={(event) => setEditing({ ...editing, is_active: event.target.checked })} className="h-4 w-4 accent-[#fc0c97]" />
              Shown
            </label>
            <button type="button" disabled={busy} onClick={() => void saveTask(editing)} className="rounded-xl bg-[#fc0c97] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Save task
            </button>
            <button type="button" onClick={() => setEditing(null)} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setEditing({ ...emptyDraft })} className="rounded-xl border border-dashed border-pink-300 px-3 py-2 text-sm font-semibold text-[#fc0c97] hover:bg-pink-50">
          + Add a task
        </button>
      )}

      {error && (
        <div role="alert" className="text-sm text-red-700">
          {error}
        </div>
      )}
    </section>
  )
}
