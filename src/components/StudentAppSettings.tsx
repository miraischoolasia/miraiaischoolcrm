import { useEffect, useState } from 'react'
import {
  defaultPortalSettings,
  fetchPortalSettings,
  savePortalSettings,
  type PortalSettings,
  type PortalVisibility,
} from '../lib/portal'
import { PortalConsentSettings } from './PortalConsentSettings'
import { PortalTermsSettings } from './PortalTermsSettings'

const sections: Array<[keyof PortalVisibility, string]> = [
  ['schedule', 'Classes and their Zoom link'],
  ['points', 'Points and level'],
  ['scores', "The teacher's ratings (never the remarks)"],
  ['package', 'Lessons left and expiry'],
  ['report', "The teacher's report (only when a teacher shares it)"],
  ['recordings', 'Class recordings (from Zoom)'],
]

// Class Settings > Student app: the school's name and colour in the app, and
// what a child's login and a parent's login may see.
export function StudentAppSettings() {
  const [saved, setSaved] = useState<PortalSettings | null>(null)
  const [draft, setDraft] = useState<PortalSettings>(defaultPortalSettings)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetchPortalSettings()
      .then((settings) => {
        setSaved(settings)
        setDraft(settings)
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to load.'))
  }, [])

  const dirty = saved !== null && JSON.stringify(draft) !== JSON.stringify(saved)
  const colorOk = /^#[0-9a-fA-F]{6}$/.test(draft.accent_color)

  function change(next: PortalSettings) {
    setDone(false)
    setDraft(next)
  }

  async function save() {
    const failure = await savePortalSettings({ ...draft, school_name: draft.school_name.trim() })
    setError(failure)
    if (!failure) {
      setSaved(draft)
      setDone(true)
    }
  }

  if (saved === null && !error) {
    return <div className="py-8 text-center text-sm text-slate-500">Loading…</div>
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">
        Children and parents sign in to the student app with the logins made on each student's page. Remarks teachers
        write are never shown in the app.
      </p>

      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <label className="space-y-1.5">
          <span className="text-sm font-semibold text-slate-900">School name in the app</span>
          <input
            type="text"
            value={draft.school_name}
            maxLength={60}
            placeholder="e.g. Mirai AI School"
            onChange={(event) => change({ ...draft, school_name: event.target.value })}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-semibold text-slate-900">Colour</span>
          <span className="flex items-center gap-2">
            <input
              type="color"
              value={colorOk ? draft.accent_color : '#fc0c97'}
              aria-label="Colour"
              onChange={(event) => change({ ...draft, accent_color: event.target.value })}
              className="h-9 w-12 rounded border border-slate-200"
            />
            <span className="font-mono text-xs text-slate-500">{draft.accent_color}</span>
          </span>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-2 font-semibold">Shows</th>
              <th className="py-2 text-center font-semibold">Child login</th>
              <th className="py-2 text-center font-semibold">Parent login</th>
            </tr>
          </thead>
          <tbody>
            {sections.map(([key, label]) => (
              <tr key={key} className="border-t border-slate-100">
                <td className="py-2 text-slate-700">{label}</td>
                {(['student_sees', 'parent_sees'] as const).map((viewer) => (
                  <td key={viewer} className="py-2 text-center">
                    <input
                      type="checkbox"
                      checked={draft[viewer][key]}
                      aria-label={`${viewer === 'student_sees' ? 'Child' : 'Parent'} sees ${label}`}
                      onChange={(event) => change({ ...draft, [viewer]: { ...draft[viewer], [key]: event.target.checked } })}
                      className="h-4 w-4 accent-[#fc0c97]"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && (
        <div role="alert" className="text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-3">
        {done && !dirty && <span className="text-sm font-semibold text-emerald-700">Saved</span>}
        <button
          type="button"
          disabled={!dirty || !colorOk}
          onClick={() => void save()}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          Save
        </button>
      </div>

      <PortalTermsSettings />

      <PortalConsentSettings />
    </div>
  )
}
