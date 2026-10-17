import { useCallback, useEffect, useState } from 'react'
import { VideoCamera } from '@phosphor-icons/react'
import { fetchLessonZoom, lessonZoomHostUrl, prepareLessonZoom, type LessonZoom } from '../lib/zoomLessons'

// The lesson's own Zoom meeting: make it (each child gets a link of their own
// in the student app), sign up children added later, and start it as host.
export function LessonZoomCard({
  scheduleId,
  lessonDate,
  rosterCount,
}: {
  scheduleId: number
  lessonDate: string
  rosterCount: number
}) {
  const [zoom, setZoom] = useState<LessonZoom | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [problems, setProblems] = useState<string[]>([])

  const load = useCallback(() => {
    fetchLessonZoom(scheduleId, lessonDate)
      .then(setZoom)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Could not read the Zoom meeting.'))
  }, [lessonDate, scheduleId])

  useEffect(load, [load])

  async function prepare() {
    setBusy(true)
    setError(null)
    const result = await prepareLessonZoom(scheduleId, lessonDate)
    setBusy(false)
    setError(result.error)
    setProblems(result.problems)
    load()
  }

  async function start() {
    // Opened before the wait, so the browser does not block it as a pop-up.
    const tab = window.open('', '_blank')
    setBusy(true)
    setError(null)
    const result = await lessonZoomHostUrl(scheduleId, lessonDate)
    setBusy(false)
    if (result.error || !result.url) {
      tab?.close()
      setError(result.error ?? 'Zoom gave no host link.')
      return
    }
    if (tab) tab.location.href = result.url
    else window.location.href = result.url
  }

  const missing = zoom?.meeting ? Math.max(0, rosterCount - zoom.linked) : 0

  return (
    <section aria-label="Zoom for this lesson" className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <VideoCamera size={18} className="text-sky-600" aria-hidden="true" />
          <h3 className="text-base font-semibold text-slate-900">Zoom for this lesson</h3>
        </div>
        {zoom?.meeting ? (
          <div className="flex flex-wrap gap-2">
            {missing > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void prepare()}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Sign up {missing} more
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void start()}
              className="rounded-xl bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              Start as host
            </button>
          </div>
        ) : (
          zoom && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void prepare()}
              className="rounded-xl bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {busy ? 'Making the meeting…' : 'Make the Zoom meeting'}
            </button>
          )
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {zoom === null
          ? 'Loading…'
          : zoom.meeting
            ? `Meeting ${zoom.meeting.meetingId}${zoom.meeting.host ? ` on ${zoom.meeting.host}` : ''} · ${zoom.linked} of ${rosterCount} children have their own link in the student app.`
            : 'Each child gets a link of their own in the student app; Zoom then tells the attendance form who was there.'}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {problems.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-amber-700">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
