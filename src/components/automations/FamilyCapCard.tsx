import { useState } from 'react'
import type { AutoSendSettings } from '../../lib/autoSend'

type FamilyCapCardProps = {
  cap: number
  canEdit: boolean
  onSave: (change: Partial<Omit<AutoSendSettings, 'senderSeenAt'>>) => Promise<string | null>
}

const fieldClass =
  'w-20 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97] disabled:bg-slate-50 disabled:text-slate-500'

// So no family gets too many messages: past the limit a message is skipped and the Execution logs say why.
export function FamilyCapCard({ cap, canEdit, onSave }: FamilyCapCardProps) {
  const [problem, setProblem] = useState<string | null>(null)

  async function save(value: number) {
    setProblem(null)
    const result = await onSave({ familyWeeklyCap: value })
    if (result) {
      setProblem(result)
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <span className="font-semibold text-slate-900">Most automatic messages per family in 7 days</span>
        <input
          type="number"
          aria-label="Most automatic messages per family in 7 days"
          min={0}
          max={50}
          key={cap}
          defaultValue={cap}
          disabled={!canEdit}
          onBlur={(event) => {
            const value = Math.round(Number(event.target.value) || 0)
            if (value !== cap) {
              void save(value)
            }
          }}
          className={fieldClass}
        />
      </label>
      <p className="mt-1 text-xs text-slate-500">
        Counts every flow, also messages waiting for approval. A message past the limit is skipped, and the Execution
        logs say “weekly limit”. 0 = no limit. Messages to your own team are not counted.
      </p>
      {problem && <p className="mt-1 text-sm text-red-700">{problem}</p>}
    </section>
  )
}
