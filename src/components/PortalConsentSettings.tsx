import { useEffect, useState } from 'react'
import {
  consentKinds,
  defaultConsentSettings,
  fetchConsentSettings,
  saveConsentSettings,
  type ConsentSettings,
} from '../lib/portal'

const hints: Record<keyof ConsentSettings, string> = {
  ai_analysis: 'When required, the AI analysis of a child is refused until a parent agrees.',
  class_recording: 'For recorded online classes. When required, teachers see who has not agreed.',
}

// Class Settings > Student app: the school's own consent wording (PDPA) that
// parents answer in the app, and whether each is required.
export function PortalConsentSettings() {
  const [saved, setSaved] = useState<ConsentSettings | null>(null)
  const [draft, setDraft] = useState<ConsentSettings>(defaultConsentSettings)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetchConsentSettings()
      .then((settings) => {
        setSaved(settings)
        setDraft(settings)
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to load.'))
  }, [])

  const dirty = saved !== null && JSON.stringify(draft) !== JSON.stringify(saved)
  const complete = consentKinds.every((kind) => draft[kind].title.trim() && draft[kind].text.trim())

  function change(kind: keyof ConsentSettings, patch: Partial<ConsentSettings[keyof ConsentSettings]>) {
    setDone(false)
    setDraft((current) => ({ ...current, [kind]: { ...current[kind], ...patch } }))
  }

  async function save() {
    const trimmed = Object.fromEntries(
      consentKinds.map((kind) => [kind, { ...draft[kind], title: draft[kind].title.trim(), text: draft[kind].text.trim() }]),
    ) as ConsentSettings
    const failure = await saveConsentSettings(trimmed)
    setError(failure)
    if (!failure) {
      setSaved(trimmed)
      setDraft(trimmed)
      setDone(true)
    }
  }

  return (
    <section aria-labelledby="consent-title" className="space-y-4 border-t border-slate-200 pt-5">
      <div>
        <h3 id="consent-title" className="text-base font-semibold text-slate-900">
          Parents' consent
        </h3>
        <p className="text-sm text-slate-500">
          Parents answer these in the student app (a parent's login only). Each answer is kept with the wording they saw.
        </p>
      </div>

      {saved === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

      {saved !== null &&
        consentKinds.map((kind) => (
          <div key={kind} className="space-y-2 rounded-xl border border-slate-200 p-3">
            <label className="block text-sm">
              <span className="font-semibold text-slate-800">Title</span>
              <input
                value={draft[kind].title}
                maxLength={80}
                onChange={(event) => change(kind, { title: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-1.5"
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold text-slate-800">What the parent agrees to</span>
              <textarea
                value={draft[kind].text}
                maxLength={2000}
                rows={3}
                onChange={(event) => change(kind, { text: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-1.5"
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft[kind].required}
                onChange={(event) => change(kind, { required: event.target.checked })}
                className="mt-1 h-4 w-4 accent-[#fc0c97]"
              />
              <span>
                <span className="font-medium text-slate-800">Required</span>
                <span className="block text-slate-500">{hints[kind]}</span>
              </span>
            </label>
          </div>
        ))}

      {error && (
        <div role="alert" className="text-sm text-red-700">
          {error}
        </div>
      )}
      {saved !== null && (
        <div className="flex items-center justify-end gap-3">
          {done && !dirty && <span className="text-sm font-semibold text-emerald-700">Saved</span>}
          <button
            type="button"
            disabled={!dirty || !complete}
            onClick={() => void save()}
            className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
          >
            Save consent
          </button>
        </div>
      )}
    </section>
  )
}
