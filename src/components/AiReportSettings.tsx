import { useEffect, useState } from 'react'
import {
  defaultReportSettings,
  fetchReportSettings,
  saveReportSettings,
  type ReportSettings,
} from '../lib/studentReports'

const sourceLabels: Array<[keyof ReportSettings['sources'], string, string]> = [
  ['reviews', 'Teacher ratings', 'The review criteria scores of each lesson.'],
  ['remarks', "Teacher's notes", 'Remarks on low scores and each lesson remark.'],
  ['attendance', 'Attendance', 'Present, absent, late, ...'],
  ['points', 'Reward points', 'Total points and recent rewards.'],
]

const languages = ['English', '中文', 'Bahasa Melayu']

// Class Settings > AI analysis: what the analysis may read, its language, and
// the school's own guidance.
export function AiReportSettings() {
  const [saved, setSaved] = useState<ReportSettings | null>(null)
  const [draft, setDraft] = useState<ReportSettings>(defaultReportSettings)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetchReportSettings()
      .then((settings) => {
        setSaved(settings)
        setDraft(settings)
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to load.'))
  }, [])

  const dirty = saved !== null && JSON.stringify(draft) !== JSON.stringify(saved)
  const valid = Object.values(draft.sources).some(Boolean) && draft.language.trim() !== ''
  const customLanguage = !languages.includes(draft.language)

  async function save() {
    const failure = await saveReportSettings({ ...draft, language: draft.language.trim() })
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
        The AI analysis on a student's Progress tab reads only what is ticked here. Only the student's first name and
        age leave the CRM.
      </p>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-slate-900">It may read</legend>
        {sourceLabels.map(([key, label, note]) => (
          <label key={key} className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3">
            <input
              type="checkbox"
              checked={draft.sources[key]}
              onChange={(event) => {
                setDone(false)
                setDraft({ ...draft, sources: { ...draft.sources, [key]: event.target.checked } })
              }}
              className="mt-0.5 h-4 w-4 accent-[#fc0c97]"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-900">{label}</span>
              <span className="block text-xs text-slate-500">{note}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="block space-y-1.5">
        <span className="text-sm font-semibold text-slate-900">Language</span>
        <div className="flex flex-wrap gap-2">
          <select
            value={customLanguage ? 'other' : draft.language}
            aria-label="Language"
            onChange={(event) => {
              setDone(false)
              setDraft({ ...draft, language: event.target.value === 'other' ? '' : event.target.value })
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {languages.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
            <option value="other">Other…</option>
          </select>
          {customLanguage && (
            <input
              type="text"
              value={draft.language}
              maxLength={30}
              aria-label="Other language"
              placeholder="e.g. Tamil"
              onChange={(event) => setDraft({ ...draft, language: event.target.value })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          )}
        </div>
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-semibold text-slate-900">The school's guidance (optional)</span>
        <textarea
          rows={3}
          value={draft.instructions}
          maxLength={1000}
          placeholder="e.g. Keep it short. Always mention the child's project. Suggest one thing parents can do at home."
          onChange={(event) => {
            setDone(false)
            setDraft({ ...draft, instructions: event.target.value })
          }}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
      </label>

      {error && (
        <div role="alert" className="text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {done && !dirty && <span className="text-sm font-semibold text-emerald-700">Saved</span>}
        <button
          type="button"
          disabled={!dirty || !valid}
          onClick={() => void save()}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  )
}
