import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  bunnyWebhookUrl,
  deleteRecordingLibrary,
  fetchDeleteZoomAfterUpload,
  fetchRecordingLibraries,
  saveDeleteZoomAfterUpload,
  saveRecordingLibrary,
  setClassroomRecordingLibrary,
  type RecordingLibrary,
} from '../lib/recordings'

type ClassRow = { id: number; name: string; libraryId: number | null }
type Draft = { id: number | null; name: string; libraryId: string; apiKey: string; collectionId: string }

const emptyDraft: Draft = { id: null, name: '', libraryId: '', apiKey: '', collectionId: '' }
const input = 'mt-1 w-full rounded-xl border border-slate-200 px-3 py-1.5 text-sm'

// Class Settings > Recordings: the school's Bunny Stream libraries, which class
// goes to which, and whether Zoom's copy is deleted once Bunny has the video.
export function RecordingsSettings() {
  const [libraries, setLibraries] = useState<RecordingLibrary[] | null>(null)
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [deleteZoom, setDeleteZoom] = useState<boolean | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const webhook = bunnyWebhookUrl()

  const load = useCallback(async () => {
    try {
      const [list, rows, flag] = await Promise.all([
        fetchRecordingLibraries(),
        supabase
          ? supabase.from('classrooms').select('id, name, recording_library_id').eq('status', 'active').order('name')
          : Promise.resolve({ data: [] }),
        fetchDeleteZoomAfterUpload(),
      ])
      setLibraries(list)
      setClasses(
        ((rows.data ?? []) as { id: number; name: string; recording_library_id?: number | null }[]).map((row) => ({
          id: row.id,
          name: row.name,
          libraryId: row.recording_library_id ?? null,
        })),
      )
      setDeleteZoom(flag)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function run(action: Promise<string | null>) {
    setBusy(true)
    setError(null)
    const problem = await action
    setBusy(false)
    if (problem) {
      setError(problem)
      return false
    }
    await load()
    return true
  }

  const draftOk =
    draft !== null && draft.name.trim() && /^\d{1,12}$/.test(draft.libraryId.trim()) && (draft.id !== null || draft.apiKey.trim().length >= 8)

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">
        When Zoom finishes a lesson's cloud recording, Bunny Stream fetches it straight from Zoom into the class's library;
        the student app then plays it from Bunny. Once Bunny has the video ready, Zoom's copy can be deleted so Zoom's
        storage stays free.
      </p>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">Bunny libraries</h3>
          {!draft && (
            <button
              type="button"
              onClick={() => setDraft(emptyDraft)}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Add library
            </button>
          )}
        </div>
        {libraries === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
        {libraries && libraries.length === 0 && !draft && (
          <p className="text-sm text-slate-500">No library yet. Recordings stay on Zoom until one is added and given to a class.</p>
        )}
        {libraries && libraries.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {libraries.map((library) => (
              <li key={library.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="font-semibold text-slate-800">{library.name}</span>
                  <span className="ml-2 text-slate-500">
                    Library {library.libraryId}
                    {library.collectionId ? ` · collection ${library.collectionId}` : ''} · {library.hasKey ? 'key saved' : 'no key'} ·{' '}
                    {library.classes} {library.classes === 1 ? 'class' : 'classes'}
                  </span>
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({ id: library.id, name: library.name, libraryId: library.libraryId, apiKey: '', collectionId: library.collectionId ?? '' })
                    }
                    className="text-xs font-semibold text-slate-600 underline underline-offset-2"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(deleteRecordingLibrary(library.id))}
                    className="text-xs font-semibold text-rose-700 underline underline-offset-2 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {draft && (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <label className="block text-sm">
              <span className="font-semibold text-slate-800">Name</span>
              <input value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={input} />
            </label>
            <label className="block text-sm">
              <span className="font-semibold text-slate-800">Library ID</span>
              <span className="block text-xs text-slate-500">In Bunny: Stream → your library → API.</span>
              <input value={draft.libraryId} inputMode="numeric" onChange={(event) => setDraft({ ...draft, libraryId: event.target.value })} className={input} />
            </label>
            <label className="block text-sm">
              <span className="font-semibold text-slate-800">API key</span>
              <span className="block text-xs text-slate-500">
                {draft.id ? 'Leave empty to keep the saved key.' : 'The library\'s API key. Kept on the server; nobody can read it back.'}
              </span>
              <input
                type="password"
                autoComplete="off"
                value={draft.apiKey}
                onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
                className={input}
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold text-slate-800">Collection ID (optional)</span>
              <input value={draft.collectionId} onChange={(event) => setDraft({ ...draft, collectionId: event.target.value })} className={input} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDraft(null)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !draftOk}
                onClick={() => void run(saveRecordingLibrary(draft)).then((ok) => ok && setDraft(null))}
                className="rounded-xl bg-[#fc0c97] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Save library
              </button>
            </div>
          </div>
        )}
        {webhook && (
          <p className="text-xs text-slate-500">
            In each Bunny library, set the webhook URL to <span className="select-all font-mono text-slate-700">{webhook}</span> so Bunny says when a video is ready.
            Without it, press Check on the lesson.
          </p>
        )}
      </section>

      {deleteZoom !== null && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={deleteZoom}
            disabled={busy}
            onChange={(event) => void run(saveDeleteZoomAfterUpload(event.target.checked))}
            className="mt-1 h-4 w-4 accent-[#fc0c97]"
          />
          <span>
            <span className="font-semibold text-slate-800">Delete Zoom's copy once Bunny has it</span>
            <span className="block text-slate-500">Only after Bunny says the video is processed. Needs the Zoom app's permission to delete recordings.</span>
          </span>
        </label>
      )}

      {libraries && libraries.length > 0 && classes.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-base font-semibold text-slate-900">Which library each class uses</h3>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {classes.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm text-slate-800">{row.name}</span>
                <select
                  value={row.libraryId ?? ''}
                  disabled={busy}
                  onChange={(event) =>
                    void run(setClassroomRecordingLibrary(row.id, event.target.value ? Number(event.target.value) : null))
                  }
                  aria-label={`Bunny library for ${row.name}`}
                  className="rounded-xl border border-slate-200 px-2 py-1 text-sm"
                >
                  <option value="">Keep on Zoom</option>
                  {libraries.map((library) => (
                    <option key={library.id} value={library.id}>
                      {library.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
