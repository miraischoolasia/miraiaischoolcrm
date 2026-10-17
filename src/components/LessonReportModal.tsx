import { useEffect, useMemo, useState } from 'react'
import { Printer, X } from '@phosphor-icons/react'
import { ModalShell } from './ModalShell'
import { buildLessonReport } from '../lib/lessonReport'
import type { LiveAnswer, LiveQuestion } from '../lib/liveQuestions'
import { fetchRoom, type RoomData } from '../lib/zoomRoom'
import { fetchLessonZoomMinutes, type ZoomMinutes } from '../lib/zoomLessons'

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })

// One lesson on one page, for the teacher after class (or to print / save as
// PDF): how each question went, and each child's time in Zoom and answers.
export function LessonReportModal({
  sessionId,
  scheduleId,
  lessonDate,
  title,
  questions,
  answers,
  onClose,
}: {
  sessionId: number
  scheduleId: number
  lessonDate: string
  title: string
  questions: LiveQuestion[]
  answers: LiveAnswer[]
  onClose: () => void
}) {
  const [room, setRoom] = useState<RoomData | null>(null)
  const [minutes, setMinutes] = useState<ZoomMinutes[]>([])
  const [error, setError] = useState<string | null>(null)
  const [openChild, setOpenChild] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchRoom(sessionId), fetchLessonZoomMinutes(scheduleId, lessonDate)])
      .then(([nextRoom, nextMinutes]) => {
        if (cancelled) return
        setRoom(nextRoom)
        setMinutes(nextMinutes)
      })
      .catch((loadError) => !cancelled && setError(loadError instanceof Error ? loadError.message : 'Could not read the lesson.'))
    return () => {
      cancelled = true
    }
  }, [lessonDate, scheduleId, sessionId])

  const report = useMemo(() => (room ? buildLessonReport({ questions, answers, room, minutes }) : null), [answers, minutes, questions, room])

  return (
    <ModalShell maxWidth="760" layer="overlay" onClose={onClose}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">Lesson report</h2>
          <p className="truncate text-sm text-slate-500">
            {title} · {lessonDate}
          </p>
        </div>
        <div className="flex gap-1 print:hidden">
          <button type="button" onClick={() => window.print()} aria-label="Print" className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
            <Printer size={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="max-h-[75vh] space-y-5 overflow-y-auto px-5 py-4 text-sm">
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        {!report ? (
          !error && <p className="text-slate-500">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="In Zoom" value={`${report.inZoom} / ${report.rosterSize}`} />
              <Stat label="Questions" value={String(report.questions.length)} />
              <Stat label="Right" value={report.rightPercent === null ? '—' : `${report.rightPercent}%`} />
            </div>

            {report.questions.length > 0 && (
              <section aria-label="Questions">
                <h3 className="font-semibold text-slate-900">Questions</h3>
                <table className="mt-2 w-full text-left">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th className="py-1 font-medium">Question</th>
                      <th className="py-1 font-medium">Answered</th>
                      <th className="py-1 font-medium">Right</th>
                      <th className="py-1 font-medium">Avg time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.questions.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="py-1.5 pr-2 text-slate-800">
                          <span className="font-semibold">Q{row.number}.</span> {row.prompt.slice(0, 70)}
                        </td>
                        <td className="py-1.5">{row.answered}</td>
                        <td className="py-1.5">
                          {row.rightPercent === null ? '—' : `${row.rightPercent}%`}
                          {row.toMark > 0 && <span className="text-xs text-amber-700"> · {row.toMark} to mark</span>}
                        </td>
                        <td className="py-1.5">{row.averageSeconds === null ? '—' : `${row.averageSeconds}s`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <section aria-label="Children">
              <h3 className="font-semibold text-slate-900">Children</h3>
              <ul className="mt-2 divide-y divide-slate-100">
                {report.children.map((child) => (
                  <li key={child.studentId} className="py-2">
                    <button
                      type="button"
                      onClick={() => setOpenChild(openChild === child.studentId ? null : child.studentId)}
                      className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                    >
                      <span className="font-semibold text-slate-800">
                        {child.place ? `${child.place}. ` : ''}
                        {child.name}
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        {child.firstJoinedAt === null ? (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-800">Not in Zoom</span>
                        ) : (
                          <>
                            <span>
                              Joined {timeOf(child.firstJoinedAt)}
                              {child.zoomMinutes !== null ? ` · ${child.zoomMinutes} min` : ''}
                            </span>
                            {child.late && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">late</span>}
                            {child.droppedOut && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">dropped out</span>}
                            {child.countsAsPresent === false && <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-800">too short</span>}
                          </>
                        )}
                        <span className="font-semibold text-slate-900">
                          {child.points} pts ({child.right}/{child.answered})
                        </span>
                      </span>
                    </button>
                    {openChild === child.studentId && (
                      <ul className="mt-1 space-y-0.5 pl-3 text-xs text-slate-600">
                        {child.answers.length === 0 && <li>No answers.</li>}
                        {child.answers.map((row) => (
                          <li key={row.questionId}>
                            Q{row.number}: {row.result === 'correct' ? `right +${row.points}` : row.result === 'wrong' ? 'wrong' : 'to mark'} · {row.secondsTaken}s
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </ModalShell>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}
