import { useState } from 'react'
import { setProgramLevelFlow, type ProgramLevelOption } from '../lib/programLevels'
import type { Programme } from '../lib/programmes'

// Class Settings > Enrolment flows: which flow each kind of class (class
// level / course type) follows when a parent signs up in the Inbox. A class
// can still name a flow of its own (Edit Class); the flows themselves are
// edited below this list.
export function EnrolFlowsSettings({
  levels,
  programmes,
  onChanged,
}: {
  levels: ProgramLevelOption[]
  programmes: Programme[]
  onChanged: () => Promise<void> | void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shown = levels.filter((level) => level.isActive)
  const flows = programmes.filter((programme) => programme.isActive && programme.legacyKey === null)

  if (shown.some((level) => level.flowId === undefined)) {
    return <p className="text-sm text-slate-500">Flows by kind of class need the database update first.</p>
  }

  async function choose(level: ProgramLevelOption, value: string) {
    setBusy(level.name)
    setError(null)
    const message = await setProgramLevelFlow(level.name, value ? Number(value) : null)
    setBusy(null)
    if (message) {
      setError(message)
      return
    }
    await onChanged()
  }

  return (
    <section className="space-y-2">
      <h3 className="text-base font-semibold text-slate-900">Which flow each kind of class uses</h3>
      <p className="text-sm text-slate-500">
        When the team signs a parent up in the Inbox, they pick the class; its steps come from the flow chosen here for
        its kind. A class can use a different flow (Edit Class).
      </p>
      {flows.length === 0 && <p className="text-sm text-amber-700">Make a flow below first.</p>}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {shown.map((level) => (
          <li key={level.name} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span className="text-sm font-semibold text-slate-800">{level.name}</span>
            <select
              aria-label={`Flow for ${level.name}`}
              value={level.flowId ?? ''}
              disabled={busy !== null || flows.length === 0}
              onChange={(event) => void choose(level, event.target.value)}
              className="rounded-xl border border-slate-200 px-2 py-1 text-sm"
            >
              <option value="">No sign-up flow</option>
              {flows.map((flow) => (
                <option key={flow.id} value={flow.id}>
                  {flow.name}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  )
}
