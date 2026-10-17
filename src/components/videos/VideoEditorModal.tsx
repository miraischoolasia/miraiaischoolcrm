import { useState } from 'react'
import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { getTodayString } from '../../domain/studentStatus'
import { uploadClassVideo, updateClassVideo, type ClassVideo, type VideoDraft } from '../../lib/classVideos'

const inputClass = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm'

// A new video (with its file, straight to Bunny) or a change to one.
export function VideoEditorModal({
  classroomId,
  className,
  video,
  onClose,
  onSaved,
}: {
  classroomId: number
  className: string
  video: ClassVideo | null
  onClose: () => void
  onSaved: () => void
}) {
  const today = getTodayString()
  const [draft, setDraft] = useState<VideoDraft>(() =>
    video
      ? {
          title: video.title,
          description: video.description ?? '',
          year: video.year,
          month: video.month,
          lessonDate: video.lessonDate ?? '',
        }
      : { title: '', description: '', year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)), lessonDate: today },
  )
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const monthValue = `${draft.year}-${String(draft.month).padStart(2, '0')}`
  const problem = !draft.title.trim()
    ? 'Give the video a title.'
    : !video && !file
      ? 'Choose the video file.'
      : null

  async function save() {
    setSaving(true)
    setError(null)
    const message = video
      ? await updateClassVideo(video.id, draft)
      : await uploadClassVideo(classroomId, draft, file!, setProgress)
    setSaving(false)
    if (message) {
      setError(message)
      setProgress(null)
      return
    }
    onSaved()
  }

  return (
    <ModalShell maxWidth="sm" onClose={saving ? () => undefined : onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
        <div>
          <div className="text-sm font-medium text-[#be185d]">{className}</div>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">{video ? 'Edit video' : 'Upload a video'}</h2>
        </div>
        {!saving && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      <div data-modal-body className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-6">
        {!video && (
          <label className="block text-sm">
            <span className="font-semibold text-slate-700">Video file</span>
            <input
              type="file"
              accept="video/*"
              disabled={saving}
              onChange={(event) => {
                const picked = event.target.files?.[0] ?? null
                setFile(picked)
                if (picked && !draft.title.trim()) {
                  setDraft((current) => ({ ...current, title: picked.name.replace(/\.[^.]+$/, '') }))
                }
              }}
              className="mt-1 block w-full text-sm"
            />
          </label>
        )}
        <label className="block text-sm">
          <span className="font-semibold text-slate-700">Title</span>
          <input
            value={draft.title}
            maxLength={300}
            disabled={saving}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="font-semibold text-slate-700">Month</span>
            <input
              type="month"
              value={monthValue}
              disabled={saving}
              onChange={(event) => {
                const [year, month] = event.target.value.split('-').map(Number)
                if (year && month) setDraft({ ...draft, year, month })
              }}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-slate-700">Lesson day</span>
            <input
              type="date"
              value={draft.lessonDate}
              disabled={saving}
              onChange={(event) => setDraft({ ...draft, lessonDate: event.target.value })}
              className={`mt-1 ${inputClass}`}
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="font-semibold text-slate-700">Note for students (optional)</span>
          <textarea
            value={draft.description}
            rows={3}
            maxLength={5000}
            disabled={saving}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            className={`mt-1 ${inputClass}`}
          />
        </label>

        {progress !== null && (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-[#fc0c97] transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {progress < 1 ? `Uploading ${Math.round(progress * 100)}% · keep this page open` : 'Uploaded; Bunny is processing it'}
            </div>
          </div>
        )}
        {(error || (problem && (file || video))) && (
          <div role={error ? 'alert' : undefined} className={error ? 'text-sm text-red-700' : 'text-sm text-slate-500'}>
            {error ?? problem}
          </div>
        )}

        <div className="flex justify-end gap-2">
          {!saving && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={problem !== null || saving}
            onClick={() => void save()}
            className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
          >
            {saving ? (video ? 'Saving…' : 'Uploading…') : video ? 'Save' : 'Upload'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
