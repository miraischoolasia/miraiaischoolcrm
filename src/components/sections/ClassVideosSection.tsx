import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowSquareOut, Plus } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { formatDate, getTodayString } from '../../domain/studentStatus'
import { getClassroomRosterOn } from '../../lib/roster'
import {
  classVideoAction,
  fetchCanManageVideos,
  fetchClassVideos,
  fetchMonthAccessOn,
  fetchVideoAccess,
  fetchVideoProgress,
  groupByMonth,
  isMonthOpen,
  monthLabel,
  setClassVideoArchived,
  videoEmbedUrl,
  videoStats,
  videoStatusLabels,
  type ClassVideo,
  type VideoAccess,
  type VideoProgress,
} from '../../lib/classVideos'
import type { Classroom, Student } from '../../types/domain'
import { VideoEditorModal } from '../videos/VideoEditorModal'
import { MonthAccessModal } from '../videos/MonthAccessModal'

const statusStyles: Record<ClassVideo['status'], string> = {
  uploading: 'bg-amber-50 text-amber-700',
  processing: 'bg-sky-50 text-sky-700',
  ready: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
}

const sourceLabels: Record<ClassVideo['source'], string> = {
  upload: 'Uploaded',
  zoom: 'Zoom recording',
  import: 'Imported',
}

// A class's videos by month: upload, edit, hide, who may watch which month,
// and who watched.
export function ClassVideosSection({
  classrooms,
  students,
  teacherNames,
}: {
  classrooms: Classroom[]
  students: Student[]
  teacherNames: Map<number, string>
}) {
  const activeClassrooms = useMemo(
    () => classrooms.filter((classroom) => classroom.status === 'active').sort((a, b) => a.name.localeCompare(b.name)),
    [classrooms],
  )
  const [classroomId, setClassroomId] = useState<number | null>(null)
  const selectedId = classroomId ?? activeClassrooms[0]?.id ?? null
  const classroom = activeClassrooms.find((entry) => entry.id === selectedId) ?? null
  const [videos, setVideos] = useState<ClassVideo[] | null>(null)
  const [progress, setProgress] = useState<VideoProgress[]>([])
  const [access, setAccess] = useState<VideoAccess[]>([])
  const [monthAccessOn, setMonthAccessOn] = useState(false)
  const [canManage, setCanManage] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [editing, setEditing] = useState<ClassVideo | 'new' | null>(null)
  const [accessMonth, setAccessMonth] = useState<{ year: number; month: number } | null>(null)
  const [openStats, setOpenStats] = useState<number | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const today = getTodayString()

  const load = useCallback(async () => {
    if (!selectedId) return
    try {
      const [nextVideos, nextAccess, nextMonthAccess, nextCanManage] = await Promise.all([
        fetchClassVideos(selectedId),
        fetchVideoAccess(selectedId),
        fetchMonthAccessOn(),
        fetchCanManageVideos(selectedId),
      ])
      setVideos(nextVideos)
      setAccess(nextAccess)
      setMonthAccessOn(nextMonthAccess)
      setCanManage(nextCanManage)
      setProgress(await fetchVideoProgress(nextVideos.map((video) => video.id)))
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load the videos.')
    }
  }, [selectedId])

  useEffect(() => {
    setVideos(null)
    void load()
  }, [load])

  const roster = useMemo(
    () => (selectedId ? getClassroomRosterOn(students, selectedId, today) : []),
    [students, selectedId, today],
  )
  const studentNames = useMemo(() => new Map(students.map((student) => [student.id, student.name])), [students])
  const shown = (videos ?? []).filter((video) => showHidden || !video.isArchived)
  const hiddenCount = (videos ?? []).filter((video) => video.isArchived).length
  const months = groupByMonth(shown)

  async function act(video: ClassVideo, run: () => Promise<string | null>) {
    setBusyId(video.id)
    const message = await run()
    setBusyId(null)
    setError(message)
    await load()
  }

  if (activeClassrooms.length === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No classes yet.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        <select
          value={selectedId ?? ''}
          aria-label="Class"
          onChange={(event) => setClassroomId(Number(event.target.value))}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
        >
          {activeClassrooms.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
        <div className="text-sm text-slate-500">
          {roster.length} students · {shown.length} videos
        </div>
        {hiddenCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} />
            Show hidden ({hiddenCount})
          </label>
        )}
        {canManage && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="ml-auto flex items-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
          >
            <Plus size={16} aria-hidden="true" />
            Upload video
          </button>
        )}
      </div>

      {monthAccessOn && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Month access is on: students see a month's videos only after that month is opened for them.
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {videos === null && !error && <div className="text-sm text-slate-500">Loading…</div>}
      {videos !== null && months.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No videos for this class yet.
        </div>
      )}

      {months.map((group) => {
        const openCount = roster.filter((student) => isMonthOpen(access, student.id, group.year, group.month, today)).length
        return (
          <section key={`${group.year}-${group.month}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 className="text-base font-semibold text-slate-900">{monthLabel(group.year, group.month)}</h3>
              {monthAccessOn && (
                <button
                  type="button"
                  onClick={() => setAccessMonth({ year: group.year, month: group.month })}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Open for {openCount} of {roster.length}
                </button>
              )}
            </div>
            <ul className="divide-y divide-slate-100">
              {group.videos.map((video) => {
                const stats = videoStats(progress, video.id)
                const rows = progress.filter((row) => row.videoId === video.id)
                return (
                  <li key={video.id} className={cn('px-4 py-3', video.isArchived && 'opacity-60')}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900">{video.title}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                          {video.lessonDate && <span>{formatDate(video.lessonDate)}</span>}
                          <span>{sourceLabels[video.source]}</span>
                          {video.teacherId && teacherNames.get(video.teacherId) && <span>{teacherNames.get(video.teacherId)}</span>}
                          <span className={cn('rounded-full px-2 py-0.5 font-semibold', statusStyles[video.status])}>
                            {videoStatusLabels[video.status]}
                          </span>
                          {video.isArchived && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold">Hidden</span>}
                          <button
                            type="button"
                            onClick={() => setOpenStats(openStats === video.id ? null : video.id)}
                            className="underline decoration-dotted"
                          >
                            {stats.watched} watched · {stats.completed} finished · {video.views} views
                          </button>
                        </div>
                        {video.description && <div className="mt-1 text-sm text-slate-600">{video.description}</div>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {video.status === 'ready' && (
                          <a
                            href={videoEmbedUrl(video)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Watch <ArrowSquareOut size={12} aria-hidden="true" />
                          </a>
                        )}
                        {canManage && (video.status === 'processing' || video.status === 'uploading') && (
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => void act(video, async () => (await classVideoAction(video.id, 'check')).error)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {busyId === video.id ? 'Checking…' : 'Check'}
                          </button>
                        )}
                        {canManage && (video.status === 'uploading' || video.status === 'failed') && (
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => {
                              if (window.confirm(`Remove "${video.title}"? The unfinished upload is deleted from Bunny.`)) {
                                void act(video, async () => (await classVideoAction(video.id, 'cancel')).error)
                              }
                            }}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        )}
                        {canManage && (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditing(video)}
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={busyId !== null}
                              onClick={() => void act(video, () => setClassVideoArchived(video.id, !video.isArchived))}
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              {video.isArchived ? 'Show' : 'Hide'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {openStats === video.id && (
                      <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm">
                        {rows.length === 0 ? (
                          <div className="text-slate-500">Nobody has watched it yet.</div>
                        ) : (
                          <ul className="space-y-1">
                            {[...rows]
                              .sort((a, b) => b.percentage - a.percentage)
                              .map((row) => (
                                <li key={row.studentId} className="flex justify-between gap-3">
                                  <span>{studentNames.get(row.studentId) ?? `Student ${row.studentId}`}</span>
                                  <span className="text-slate-500">
                                    {Math.round(row.percentage)}%{row.completed ? ' · finished' : ''}
                                    {row.rewatches > 0 ? ` · watched again ${row.rewatches}×` : ''}
                                  </span>
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      {editing && classroom && (
        <VideoEditorModal
          classroomId={classroom.id}
          className={classroom.name}
          video={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      )}
      {accessMonth && classroom && (
        <MonthAccessModal
          classroomId={classroom.id}
          className={classroom.name}
          year={accessMonth.year}
          month={accessMonth.month}
          students={roster}
          access={access}
          onClose={() => setAccessMonth(null)}
          onChanged={load}
        />
      )}
    </div>
  )
}
