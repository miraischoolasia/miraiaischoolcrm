import { useEffect, useState } from 'react'
import { saveRoleNames, useRoleNames } from '../lib/roleNames'

// Class Settings > Class options > Today page names: what this school calls the person who works the leads ("EC") and
// the learning consultant ("LC") on the Today page and in the team table. Only the words change.
export function RoleNamesSetting() {
  const names = useRoleNames()
  const [ec, setEc] = useState(names.ec)
  const [lc, setLc] = useState(names.lc)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    setEc(names.ec)
    setLc(names.lc)
  }, [names.ec, names.lc])

  async function save() {
    setSaving(true)
    setMessage(null)
    const failure = await saveRoleNames({ ec: ec.trim(), lc: lc.trim() })
    setSaving(false)
    setMessage(failure ? { ok: false, text: failure } : { ok: true, text: 'Saved.' })
  }

  const field = 'w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97]'

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-base font-semibold text-slate-900">Today page names</h3>
      <p className="text-sm text-slate-600">
        What you call the person who works the leads, and the one who looks after the students, on the Today page.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <label className="space-y-1 text-sm font-semibold text-slate-700">
          Sales (leads)
          <input value={ec} onChange={(event) => setEc(event.target.value)} maxLength={30} className={`${field} block`} />
        </label>
        <label className="space-y-1 text-sm font-semibold text-slate-700">
          Learning consultant (students)
          <input value={lc} onChange={(event) => setLc(event.target.value)} maxLength={30} className={`${field} block`} />
        </label>
        <button
          type="button"
          disabled={saving || ec.trim() === '' || lc.trim() === ''}
          onClick={() => void save()}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
      {message && <p className={message.ok ? 'text-sm text-emerald-700' : 'text-sm text-red-600'}>{message.text}</p>}
    </div>
  )
}
