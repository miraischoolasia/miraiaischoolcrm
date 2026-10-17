import { useCallback, useEffect, useState } from 'react'
import { VideoCamera } from '@phosphor-icons/react'
import { facebookLiveConfigured, fetchLessonZoom, lessonZoomHostUrl, prepareLessonZoom, setFacebookLive, type LessonZoom } from '../lib/zoomLessons'
import { fetchLessonRecordings, recordingAction, recordingStatusLabels, type LessonRecording } from '../lib/recordings'

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
  const [recordings, setRecordings] = useState<LessonRecording[]>([])
  const [facebookReady, setFacebookReady] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchLessonZoom(scheduleId, lessonDate)
      .then((next) => {
        setZoom(next)
        if (next.sessionId) void fetchLessonRecordings(next.sessionId).then(setRecordings).catch(() => setRecordings([]))
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Could not read the Zoom meeting.'))
  }, [lessonDate, scheduleId])

  async function act(recordingId: number, action: 'check' | 'send') {
    setBusy(true)
    setError(null)
    const problem = await recordingAction(recordingId, action)
    setBusy(false)
    setError(problem)
    load()
  }

  useEffect(load, [load])

  const hasMeeting = Boolean(zoom?.meeting)
  useEffect(() => {
    if (hasMeeting) void facebookLiveConfigured(scheduleId, lessonDate).then(setFacebookReady)
  }, [hasMeeting, lessonDate, scheduleId])

  // While Facebook Live waits for Zoom to start, look again now and then.
  const waitingForFacebook = Boolean(zoom?.meeting?.facebook.wanted && !zoom.meeting.facebook.live && !zoom.meeting.facebook.error)
  useEffect(() => {
    if (!waitingForFacebook) return
    const poll = setInterval(load, 10000)
    return () => clearInterval(poll)
  }, [load, waitingForFacebook])

  async function toggleFacebook(on: boolean) {
    setBusy(true)
    setError(null)
    setNote(null)
    const result = await setFacebookLive(scheduleId, lessonDate, on)
    setBusy(false)
    setError(result.error)
    setNote(result.note)
    load()
  }

  async function prepare() {
    setBusy(true)
    setError(null)
    const result = await prepareLessonZoom(scheduleId, lessonDate, (linked, roster) =>
      setProgress(roster > 0 ? `Signing children up to Zoom: ${linked} of ${roster}…` : null),
    )
    setProgress(null)
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
      {zoom?.meeting && facebookReady && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm">
          <label className="flex items-center gap-2 text-slate-700">
            <input
              type="checkbox"
              checked={zoom.meeting.facebook.wanted}
              disabled={busy}
              onChange={(event) => void toggleFacebook(event.target.checked)}
            />
            Live on Facebook
          </label>
          <span className="text-xs">
            {zoom.meeting.facebook.live ? (
              <>
                <span className="font-semibold text-rose-600">● Live now</span>
                {zoom.meeting.facebook.url && (
                  <a href={zoom.meeting.facebook.url} target="_blank" rel="noopener" className="ml-2 font-semibold text-sky-700 underline underline-offset-2">
                    Open
                  </a>
                )}
              </>
            ) : zoom.meeting.facebook.error ? (
              <span className="text-rose-700">{zoom.meeting.facebook.error}</span>
            ) : zoom.meeting.facebook.wanted ? (
              <span className="text-slate-500">Goes live when you start Zoom</span>
            ) : null}
          </span>
        </div>
      )}
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
      {progress && (
        <p className="mt-1 text-xs text-sky-700" aria-live="polite">
          {progress}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {recordings.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-sm">
          {recordings.map((recording) => (
            <li key={recording.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-700">
                Recording{recording.durationMinutes ? ` · ${recording.durationMinutes} min` : ''} ·{' '}
                <span className={recording.bunnyStatus === 'ready' ? 'font-semibold text-emerald-700' : recording.bunnyStatus === 'failed' || recording.bunnyStatus === 'no_library' ? 'text-rose-700' : 'text-slate-600'}>
                  {recordingStatusLabels[recording.bunnyStatus ?? 'none']}
                </span>
                {recording.zoomDeleted ? ' · removed from Zoom' : ''}
                {recording.bunnyDetail && <span className="block text-xs text-slate-500">{recording.bunnyDetail}</span>}
              </span>
              <span className="flex gap-2">
                {recording.bunnyUrl && (
                  <a href={recording.bunnyUrl} target="_blank" rel="noopener" className="text-xs font-semibold text-sky-700 underline underline-offset-2">
                    Watch
                  </a>
                )}
                {recording.bunnyStatus === 'sent' && (
                  <button type="button" disabled={busy} onClick={() => void act(recording.id, 'check')} className="text-xs font-semibold text-slate-600 underline underline-offset-2 disabled:opacity-50">
                    Check
                  </button>
                )}
                {(recording.bunnyStatus === 'failed' || recording.bunnyStatus === 'no_library' || recording.bunnyStatus === null) && !recording.zoomDeleted && (
                  <button type="button" disabled={busy} onClick={() => void act(recording.id, 'send')} className="text-xs font-semibold text-slate-600 underline underline-offset-2 disabled:opacity-50">
                    Send to Bunny
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
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
