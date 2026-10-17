import { useEffect, useState } from 'react'
import { fetchPortalTerms, savePortalTerms, type PortalTerms } from '../lib/portal'

// Class Settings > Student app: the terms a parent agrees to at their first
// sign-in (with the consent questions below). New wording asks every parent again.
export function PortalTermsSettings() {
  const [saved, setSaved] = useState<PortalTerms | null>(null)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetchPortalTerms()
      .then((terms) => {
        setSaved(terms)
        setTitle(terms.title)
        setText(terms.text)
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to load.'))
  }, [])

  const textChanged = saved !== null && text.trim() !== saved.text
  const dirty = saved !== null && (title.trim() !== saved.title || textChanged)

  async function save() {
    const result = await savePortalTerms(title.trim(), text.trim())
    setError(result.error)
    if (!result.error && result.version !== null) {
      setSaved({ title: title.trim(), text: text.trim(), version: result.version })
      setDone(true)
    }
  }

  return (
    <section aria-labelledby="terms-title" className="space-y-3 border-t border-slate-200 pt-5">
      <div>
        <h3 id="terms-title" className="text-base font-semibold text-slate-900">
          Terms at the first sign-in
        </h3>
        <p className="text-sm text-slate-500">
          A parent reads these and answers the consent questions below before the app opens.
          {saved && saved.version > 0 ? ` Version ${saved.version}.` : ''}
        </p>
      </div>
      {saved === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {saved !== null && (
        <>
          <label className="block text-sm">
            <span className="font-semibold text-slate-800">Title</span>
            <input
              value={title}
              maxLength={80}
              onChange={(event) => {
                setDone(false)
                setTitle(event.target.value)
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-slate-800">Terms</span>
            <textarea
              value={text}
              maxLength={8000}
              rows={6}
              onChange={(event) => {
                setDone(false)
                setText(event.target.value)
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-1.5"
            />
          </label>
          {textChanged && saved.version > 0 && (
            <p className="text-sm text-amber-700">Saving new wording asks every parent to agree again at their next sign-in.</p>
          )}
        </>
      )}
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
            disabled={!dirty || !title.trim() || !text.trim()}
            onClick={() => void save()}
            className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
          >
            Save terms
          </button>
        </div>
      )}
    </section>
  )
}
