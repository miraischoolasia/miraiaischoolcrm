import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../lib/cn'
import { formatDate, getTodayString } from '../domain/studentStatus'
import { fetchMonthAccessOn, fetchStudentVideoData, isMonthOpen, monthLabel, setStudentVideoAccess, type StudentVideoData } from '../lib/classVideos'
import type { Classroom } from '../types/domain'

type Month = { year: number; month: number }

// Student page > Videos: for each class the student is in, every month of
// videos, whether it is open for them (and until when), and how far they got
// with each video. Staff who may edit students open and close months here.
export function StudentVideosTab({
  studentId,
  classrooms,
  canEdit,
}: {
  studentId: number
  // The student's classes, main class first.
  classrooms: Classroom[]
  canEdit: boolean
}) {
  const [data, setData] = useState<StudentVideoData | null>(null)
  const [monthAccessOn, setMonthAccessOn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ key: string; startsOn: string; endsOn: string } | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const today = getTodayString()
  const classroomIds = useMemo(() => classrooms.map((classroom) => classroom.id), [classrooms])

  const load = useCallback(async () => {
    try {
      const [next, on] = await Promise.all([fetchStudentVideoData(studentId, classroomIds), fetchMonthAccessOn()])
      setData(next)
      setMonthAccessOn(on)
      setError(null)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not load the videos.')
    }
  }, [studentId, classroomIds])

  useEffect(() => {
    void load()
  }, [load])

  if (error) return <div className="text-sm text-red-700">{error}</div>
  if (!data) return <div className="text-sm text-slate-500">Loading videos…</div>
  if (data.videos.length === 0) return <div className="text-sm text-slate-500">No class videos for this student's classes yet.</div>

  const progressByVideo = new Map(data.progress.map((row) => [row.videoId, row]))
  const recent = [...data.progress].sort((a, b) => b.lastWatchedAt.localeCompare(a.lastWatchedAt)).slice(0, 5)
  const videoById = new Map(data.videos.map((video) => [video.id, video]))
  const classById = new Map(classrooms.map((classroom) => [classroom.id, classroom]))

  async function setAccess(classroomId: number, month: Month, granted: boolean, startsOn: string | null = null, endsOn: string | null = null) {
    const key = `${classroomId}-${month.year}-${month.month}`
    setBusyKey(key)
    const message = await setStudentVideoAccess(studentId, classroomId, month.year, month.month, granted, startsOn, endsOn)
    setBusyKey(null)
    if (message) {
      setError(message)
      return
    }
    setEditing(null)
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Videos watched" value={data.progress.length} />
        <Stat label="Finished" value={data.progress.filter((row) => row.completed).length} />
        <Stat label="Classes" value={classrooms.length} />
      </div>

      {recent.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-slate-900">Watched lately</h4>
          <ul className="mt-2 space-y-1.5 text-sm">
            {recent.map((row) => {
              const video = videoById.get(row.videoId)
              return (
                <li key={row.videoId} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {video?.title ?? 'A video'}
                    <span className="text-slate-500"> · {classById.get(video?.classroomId ?? -1)?.name ?? ''}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    <Watched percentage={row.percentage} completed={row.completed} /> · {formatDate(row.lastWatchedAt.slice(0, 10))}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {classrooms.map((classroom) => {
        const videos = data.videos.filter((video) => video.classroomId === classroom.id)
        if (videos.length === 0) return null
        const months: Month[] = []
        for (const video of videos) {
          if (!months.some((entry) => entry.year === video.year && entry.month === video.month)) months.push({ year: video.year, month: video.month })
        }
        months.sort((a, b) => b.year - a.year || b.month - a.month)
        const watched = videos.filter((video) => progressByVideo.has(video.id)).length
        return (
          <section key={classroom.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <h4 className="text-sm font-semibold text-slate-900">{classroom.name}</h4>
              <span className="text-xs text-slate-500">
                watched {watched} of {videos.length}
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {months.map((month) => {
                const key = `${classroom.id}-${month.year}-${month.month}`
                const monthVideos = videos.filter((video) => video.year === month.year && video.month === month.month)
                const row = data.access.find((entry) => entry.classroomId === classroom.id && entry.year === month.year && entry.month === month.month)
                const open = !monthAccessOn || isMonthOpen(data.access.filter((entry) => entry.classroomId === classroom.id), studentId, month.year, month.month, today)
                const seen = monthVideos.filter((video) => progressByVideo.has(video.id)).length
                return (
                  <li key={key} className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button type="button" onClick={() => setOpenKey(openKey === key ? null : key)} className="text-left text-sm">
                        <span className="font-semibold text-slate-900">{monthLabel(month.year, month.month)}</span>
                        <span className="text-slate-500">
                          {' '}
                          · {monthVideos.length} videos · watched {seen}
                        </span>
                      </button>
                      {monthAccessOn && (
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className={cn('rounded-full px-2 py-0.5 font-semibold', open ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                            {open ? 'Open' : row ? 'Ended' : 'Closed'}
                          </span>
                          {row && (row.startsOn || row.endsOn) && (
                            <span className="text-slate-500">
                              {row.startsOn ? formatDate(row.startsOn) : 'any time'} – {row.endsOn ? formatDate(row.endsOn) : 'no end'}
                            </span>
                          )}
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                disabled={busyKey !== null}
                                onClick={() => void setAccess(classroom.id, month, !row)}
                                className="rounded-lg border border-slate-200 px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                {busyKey === key ? 'Saving…' : row ? 'Close' : 'Open'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditing({ key, startsOn: row?.startsOn ?? '', endsOn: row?.endsOn ?? '' })}
                                className="font-semibold text-[#be185d] underline underline-offset-2"
                              >
                                Dates
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {editing?.key === key && (
                      <div className="mt-2 flex flex-wrap items-end gap-2 text-xs">
                        <label>
                          <span className="block text-slate-500">From</span>
                          <input type="date" value={editing.startsOn} onChange={(event) => setEditing({ ...editing, startsOn: event.target.value })} className="rounded-lg border border-slate-200 px-2 py-1" />
                        </label>
                        <label>
                          <span className="block text-slate-500">Until</span>
                          <input type="date" value={editing.endsOn} onChange={(event) => setEditing({ ...editing, endsOn: event.target.value })} className="rounded-lg border border-slate-200 px-2 py-1" />
                        </label>
                        <button
                          type="button"
                          disabled={busyKey !== null}
                          onClick={() => void setAccess(classroom.id, month, true, editing.startsOn || null, editing.endsOn || null)}
                          className="rounded-lg bg-[#fc0c97] px-3 py-1 font-semibold text-white disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700">
                          Cancel
                        </button>
                      </div>
                    )}
                    {openKey === key && (
                      <ul className="mt-2 space-y-1 rounded-xl bg-slate-50 p-2 text-sm">
                        {monthVideos.map((video) => {
                          const progress = progressByVideo.get(video.id)
                          return (
                            <li key={video.id} className="flex items-center justify-between gap-3">
                              <span className="min-w-0 truncate">{video.title}</span>
                              <span className="shrink-0 text-xs text-slate-500">
                                {progress ? (
                                  <>
                                    <Watched percentage={progress.percentage} completed={progress.completed} />
                                    {progress.rewatches > 0 ? ` · again ${progress.rewatches}×` : ''} · {formatDate(progress.lastWatchedAt.slice(0, 10))}
                                  </>
                                ) : (
                                  'Not watched'
                                )}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="text-lg font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}

function Watched({ percentage, completed }: { percentage: number; completed: boolean }) {
  return completed ? <span className="font-semibold text-emerald-700">Finished</span> : <span>{Math.round(percentage)}%</span>
}
