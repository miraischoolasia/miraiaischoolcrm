import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDate } from '../domain/studentStatus'
import { fetchMonthAccessOn, fetchStudentVideoData, monthLabel, type StudentVideoData } from '../lib/classVideos'
import { VideoGrantsGrid } from './videos/VideoGrantsGrid'
import type { Classroom } from '../types/domain'

type Month = { year: number; month: number }

// Student page > Videos: with month access on, which age group x subject x month
// of recordings the student may watch (VideoGrantsGrid, where staff open them);
// then for each class the student is in, every month of videos and how far they
// got with each video.
export function StudentVideosTab({
  studentId,
  classrooms,
}: {
  studentId: number
  // The student's classes, main class first.
  classrooms: Classroom[]
  // Kept for the student page; who may open recordings is checked by the database.
  canEdit?: boolean
}) {
  const [data, setData] = useState<StudentVideoData | null>(null)
  const [monthAccessOn, setMonthAccessOn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
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
  if (data.videos.length === 0) {
    return (
      <div className="space-y-4">
        {monthAccessOn && <VideoGrantsGrid studentId={studentId} classrooms={classrooms} />}
        <div className="text-sm text-slate-500">No class videos for this student's classes yet.</div>
      </div>
    )
  }

  const progressByVideo = new Map(data.progress.map((row) => [row.videoId, row]))
  const recent = [...data.progress].sort((a, b) => b.lastWatchedAt.localeCompare(a.lastWatchedAt)).slice(0, 5)
  const videoById = new Map(data.videos.map((video) => [video.id, video]))
  const classById = new Map(classrooms.map((classroom) => [classroom.id, classroom]))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Videos watched" value={data.progress.length} />
        <Stat label="Finished" value={data.progress.filter((row) => row.completed).length} />
        <Stat label="Classes" value={classrooms.length} />
      </div>

      {monthAccessOn && <VideoGrantsGrid studentId={studentId} classrooms={classrooms} />}

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
                    </div>
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
