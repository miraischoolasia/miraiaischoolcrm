import { useEffect, useState } from 'react'
import {
  defaultLiveQuestionSettings,
  fetchLiveQuestionSettings,
  saveLiveQuestionSettings,
  type LiveQuestionSettings,
} from '../lib/liveQuestions'

// Class Settings > Live questions: how answers in class score, how many top
// places the children see, and whether the AI suggests marks.
export function LiveQuestionSettingsForm() {
  const [saved, setSaved] = useState<LiveQuestionSettings | null>(null)
  const [draft, setDraft] = useState<LiveQuestionSettings>(defaultLiveQuestionSettings)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetchLiveQuestionSettings()
      .then((settings) => {
        setSaved(settings)
        setDraft(settings)
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to load.'))
  }, [])

  const dirty = saved !== null && JSON.stringify(draft) !== JSON.stringify(saved)

  function change(next: LiveQuestionSettings) {
    setDone(false)
    setDraft(next)
  }

  async function save() {
    const failure = await saveLiveQuestionSettings(draft)
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
        Teachers pop questions from the Question Bank during a lesson (Home &gt; Today &gt; Live class); children answer in the
        student app. The right answer shows only when the teacher presses Show the answer.
      </p>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-800">Points for a right answer</legend>
        <div className="mt-2 space-y-2">
          {(
            [
              ['speed', 'Faster answers get more', 'Full points straight away, down to half at the last second.'],
              ['fixed', 'Same for everyone', 'The question\'s full points, however long it took.'],
            ] as const
          ).map(([value, label, hint]) => (
            <label key={value} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="live-scoring"
                checked={draft.scoring === value}
                onChange={() => change({ ...draft, scoring: value })}
                className="mt-1 accent-[#fc0c97]"
              />
              <span>
                <span className="font-medium text-slate-800">{label}</span>
                <span className="block text-slate-500">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm">
        <span className="font-semibold text-slate-800">Leaderboard in the app</span>
        <span className="block text-slate-500">How many top places children see (0 hides it). Teachers always see everyone.</span>
        <select
          value={draft.leaderboardTop}
          onChange={(event) => change({ ...draft, leaderboardTop: Number(event.target.value) })}
          className="mt-1 rounded-xl border border-slate-200 px-3 py-1.5"
        >
          {Array.from({ length: 11 }, (_, count) => (
            <option key={count} value={count}>
              {count === 0 ? 'Hidden' : `Top ${count}`}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.aiMarking}
          onChange={(event) => change({ ...draft, aiMarking: event.target.checked })}
          className="mt-1 h-4 w-4 accent-[#fc0c97]"
        />
        <span>
          <span className="font-semibold text-slate-800">AI suggests marks</span>
          <span className="block text-slate-500">
            For short answers and screenshots that need the teacher. The AI only suggests; the teacher accepts or changes
            it. No names are sent to the AI.
          </span>
        </span>
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
          disabled={!dirty}
          onClick={() => void save()}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  )
}
