import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowSquareOut, CaretRight, Plus } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { formatDate, getTodayString } from '../../domain/studentStatus'
import { getClassroomRosterOn } from '../../lib/roster'
import { useAgeGroups } from '../../lib/ageGroups'
import { classroomTeacherIds } from '../../lib/classroomTeachers'
import type { Subject } from '../../lib/subjects'
import {
  DEFAULT_VIDEOS_PER_MONTH,
  classVideoAction,
  countByMonth,
  fetchAllClassVideos,
  fetchCanManageVideos,
  fetchMonthAccessOn,
  fetchVideoAccess,
  fetchVideoProgress,
  fetchVideosPerMonth,
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const NO_SUBJECT = 'none'

const rowClass = 'flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-slate-50'

// "2/4" beside a month: green when the month has all its videos, amber when
// some are missing, grey when none are up.
export function monthCountTone(count: number, target: number) {
  if (count >= target) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (count > 0) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-slate-50 text-slate-500 border-slate-200'
}

// Everyone with videos in a class: its teachers first, then anyone else whose
// videos are there (an earlier teacher, or none recorded).
export function classVideoTeachers(classroom: Classroom, videos: ClassVideo[]) {
  const ids: (number | null)[] = [...classroomTeacherIds(classroom)]
  for (const video of videos) {
    if (video.classroomId === classroom.id && !video.isArchived && !ids.includes(video.teacherId)) ids.push(video.teacherId)
  }
  return ids.length > 0 ? ids : [null]
}

function Caret({ open }: { open: boolean }) {
  return <CaretRight size={14} aria-hidden="true" className={cn('shrink-0 text-slate-400 transition', open && 'rotate-90')} />
}

// Class videos the way the LMS lists them, opening in place: grade, then
// subject, then teacher, then a year's months (each with how many of its
// videos are up) and the month's videos to watch, upload, edit or hide.
export function ClassVideosSection({
  classrooms,
  students,
  subjects,
  teacherNames,
  currentTeacherId,
}: {
  classrooms: Classroom[]
  students: Student[]
  subjects: Subject[]
  teacherNames: Map<number, string>
  currentTeacherId: number | null
}) {
  const today = getTodayString()
  const thisYear = Number(today.slice(0, 4))
  const thisMonth = Number(today.slice(5, 7))
  const activeClassrooms = useMemo(() => classrooms.filter((classroom) => classroom.status === 'active'), [classrooms])
  const subjectById = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject])), [subjects])
  const schoolGrades = useAgeGroups()

  const [videos, setVideos] = useState<ClassVideo[] | null>(null)
  const [perMonth, setPerMonth] = useState(DEFAULT_VIDEOS_PER_MONTH)
  const [monthAccessOn, setMonthAccessOn] = useState(false)
  // Open rows, by key; several can be open at once.
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const loadVideos = useCallback(async () => {
    try {
      const [nextVideos, nextPerMonth, nextMonthAccess] = await Promise.all([
        fetchAllClassVideos(),
        fetchVideosPerMonth(),
        fetchMonthAccessOn(),
      ])
      setVideos(nextVideos)
      setPerMonth(nextPerMonth)
      setMonthAccessOn(nextMonthAccess)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load the videos.')
    }
  }, [])

  useEffect(() => {
    void loadVideos()
  }, [loadVideos])

  const shownVideos = useMemo(() => (videos ?? []).filter((video) => !video.isArchived), [videos])
  const videoCount = (inClasses: Classroom[]) => {
    const ids = new Set(inClasses.map((classroom) => classroom.id))
    return shownVideos.filter((video) => ids.has(video.classroomId)).length
  }

  // Grades in the school's own order, then any not on its list.
  const grades = useMemo(() => {
    const used = new Set(activeClassrooms.map((classroom) => classroom.ageGroup))
    return [
      ...schoolGrades.filter((entry) => used.has(entry)),
      ...[...used].filter((entry) => !schoolGrades.includes(entry)).sort(),
    ]
  }, [activeClassrooms, schoolGrades])
  const subjectKeyOf = (classroom: Classroom) => (classroom.subjectId ? String(classroom.subjectId) : NO_SUBJECT)
  const sortSubjectKeys = (keys: string[]) =>
    keys.sort((a, b) => {
      const left = subjectById.get(Number(a))
      const right = subjectById.get(Number(b))
      return (left?.sortOrder ?? 9999) - (right?.sortOrder ?? 9999) || (left?.name ?? '').localeCompare(right?.name ?? '')
    })
  const subjectLabel = (key: string) => (key === NO_SUBJECT ? 'No subject' : (subjectById.get(Number(key))?.name ?? 'A subject'))
  const teacherLabel = (teacherId: number | null) =>
    teacherId === null ? 'No teacher' : (teacherNames.get(teacherId) ?? `Teacher ${teacherId}`)

  function toggle(key: string) {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (activeClassrooms.length === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No classes yet.</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 text-sm text-slate-500">
        <span>Open a grade, then a subject and a teacher, to see the months.</span>
        <span className="text-xs">{perMonth} videos a month</span>
      </div>
      {error && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {videos === null && !error && <div className="text-sm text-slate-500">Loading…</div>}

      {videos !== null && (
        <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {grades.map((grade) => {
            const inGrade = activeClassrooms.filter((classroom) => classroom.ageGroup === grade)
            const gradeKey = `g:${grade}`
            const gradeOpen = open.has(gradeKey)
            return (
              <li key={grade} className="border-b border-slate-100 last:border-b-0">
                <button type="button" aria-expanded={gradeOpen} onClick={() => toggle(gradeKey)} className={rowClass}>
                  <Caret open={gradeOpen} />
                  <span className="text-base font-semibold text-slate-900">{grade}</span>
                  <span className="ml-auto text-xs text-slate-500">
                    {inGrade.length} classes · {videoCount(inGrade)} videos
                  </span>
                </button>
                {gradeOpen && (
                  <ul className="border-t border-slate-100 bg-slate-50/50 pl-6">
                    {sortSubjectKeys([...new Set(inGrade.map(subjectKeyOf))]).map((subjectKey) => {
                      const inSubject = inGrade
                        .filter((classroom) => subjectKeyOf(classroom) === subjectKey)
                        .sort((a, b) => a.name.localeCompare(b.name))
                      const subjectRowKey = `s:${grade}:${subjectKey}`
                      const subjectOpen = open.has(subjectRowKey)
                      return (
                        <li key={subjectKey} className="border-b border-slate-100 last:border-b-0">
                          <button
                            type="button"
                            aria-expanded={subjectOpen}
                            onClick={() => toggle(subjectRowKey)}
                            className={rowClass}
                          >
                            <Caret open={subjectOpen} />
                            <span className="font-semibold text-slate-800">{subjectLabel(subjectKey)}</span>
                            <span className="ml-auto text-xs text-slate-500">
                              {inSubject.length} {inSubject.length === 1 ? 'class' : 'classes'} · {videoCount(inSubject)} videos
                            </span>
                          </button>
                          {subjectOpen && (
                            <ul className="border-t border-slate-100 pl-6">
                              {inSubject.flatMap((classroom) =>
                                classVideoTeachers(classroom, shownVideos).map((teacherId) => {
                                  const count = countByMonth(shownVideos, classroom.id, teacherId, thisYear).get(thisMonth) ?? 0
                                  const total = shownVideos.filter(
                                    (video) => video.classroomId === classroom.id && video.teacherId === teacherId,
                                  ).length
                                  const teacherKey = `t:${classroom.id}:${teacherId ?? 'none'}`
                                  const teacherOpen = open.has(teacherKey)
                                  return (
                                    <li key={teacherKey} className="border-b border-slate-100 last:border-b-0">
                                      <button
                                        type="button"
                                        aria-expanded={teacherOpen}
                                        onClick={() => toggle(teacherKey)}
                                        className={rowClass}
                                      >
                                        <Caret open={teacherOpen} />
                                        <span className="min-w-0">
                                          <span className="block font-semibold text-slate-800">{teacherLabel(teacherId)}</span>
                                          <span className="block text-xs text-slate-500">
                                            {classroom.name} · {classroom.programLevel}
                                          </span>
                                        </span>
                                        <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-slate-500">
                                          <span
                                            className={cn(
                                              'rounded-full border px-2 py-0.5 font-semibold',
                                              monthCountTone(count, perMonth),
                                            )}
                                          >
                                            {MONTHS[thisMonth - 1]} {count}/{perMonth}
                                          </span>
                                          {total} videos
                                        </span>
                                      </button>
                                      {teacherOpen && (
                                        <div className="border-t border-slate-100 bg-white p-3">
                                          <TeacherMonths
                                            classroom={classroom}
                                            teacherId={teacherId}
                                            videos={videos}
                                            perMonth={perMonth}
                                            monthAccessOn={monthAccessOn}
                                            students={students}
                                            teacherNames={teacherNames}
                                            currentTeacherId={currentTeacherId}
                                            onChanged={loadVideos}
                                          />
                                        </div>
                                      )}
                                    </li>
                                  )
                                }),
                              )}
                            </ul>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// A teacher's year in one class: twelve months with "uploaded/expected", and
// the chosen month's videos.
function TeacherMonths({
  classroom,
  teacherId,
  videos,
  perMonth,
  monthAccessOn,
  students,
  teacherNames,
  currentTeacherId,
  onChanged,
}: {
  classroom: Classroom
  teacherId: number | null
  videos: ClassVideo[]
  perMonth: number
  monthAccessOn: boolean
  students: Student[]
  teacherNames: Map<number, string>
  currentTeacherId: number | null
  onChanged: () => Promise<void>
}) {
  const today = getTodayString()
  const thisYear = Number(today.slice(0, 4))
  const thisMonth = Number(today.slice(5, 7))
  // The year and month picked; until one is, the latest with videos.
  const [pickedYear, setPickedYear] = useState<number | null>(null)
  const [pickedMonth, setPickedMonth] = useState<number | null>(null)
  const [access, setAccess] = useState<VideoAccess[]>([])
  const [canManage, setCanManage] = useState(false)
  const [progress, setProgress] = useState<VideoProgress[]>([])
  const [showHidden, setShowHidden] = useState(false)
  const [editing, setEditing] = useState<ClassVideo | 'new' | null>(null)
  const [accessOpen, setAccessOpen] = useState(false)
  const [openStats, setOpenStats] = useState<number | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadAccess = useCallback(async () => {
    try {
      const [nextAccess, nextCanManage] = await Promise.all([fetchVideoAccess(classroom.id), fetchCanManageVideos(classroom.id)])
      setAccess(nextAccess)
      setCanManage(nextCanManage)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load the class.')
    }
  }, [classroom.id])

  useEffect(() => {
    void loadAccess()
  }, [loadAccess])

  const mine = useMemo(
    () => videos.filter((video) => video.classroomId === classroom.id && video.teacherId === teacherId),
    [videos, classroom.id, teacherId],
  )
  // Only years and months that have videos are listed.
  const years = useMemo(() => [...new Set(mine.map((video) => video.year))].sort((a, b) => b - a), [mine])
  const year = pickedYear !== null && years.includes(pickedYear) ? pickedYear : (years[0] ?? thisYear)
  const months = [...new Set(mine.filter((video) => video.year === year).map((video) => video.month))].sort((a, b) => a - b)
  const month = pickedMonth !== null && months.includes(pickedMonth) ? pickedMonth : (months[months.length - 1] ?? thisMonth)
  const counts = countByMonth(mine, classroom.id, teacherId, year)
  const inMonth = mine.filter((video) => video.year === year && video.month === month)
  const hiddenCount = inMonth.filter((video) => video.isArchived).length
  const shown = groupByMonth(inMonth.filter((video) => showHidden || !video.isArchived))[0]?.videos ?? []
  const shownIds = shown.map((video) => video.id).join(',')

  useEffect(() => {
    let live = true
    const ids = shownIds ? shownIds.split(',').map(Number) : []
    fetchVideoProgress(ids)
      .then((rows) => {
        if (live) setProgress(rows)
      })
      .catch((loadError) => {
        if (live) setError(loadError instanceof Error ? loadError.message : 'Failed to load who watched.')
      })
    return () => {
      live = false
    }
  }, [shownIds])

  const roster = useMemo(() => getClassroomRosterOn(students, classroom.id, today), [students, classroom.id, today])
  const studentNames = useMemo(() => new Map(students.map((student) => [student.id, student.name])), [students])
  const openCount = roster.filter((student) => isMonthOpen(access, student.id, year, month, today)).length

  async function act(video: ClassVideo, run: () => Promise<string | null>) {
    setBusyId(video.id)
    const message = await run()
    setBusyId(null)
    setError(message)
    await onChanged()
  }

  return (
    <div className="space-y-4">
      {mine.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          No videos yet.
          {canManage && (
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-[#fc0c97] px-3 py-1 text-xs font-semibold text-white transition hover:bg-[#de0a84]"
            >
              <Plus size={14} aria-hidden="true" />
              Upload video
            </button>
          )}
        </div>
      ) : (
        <>
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              {years.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => {
                    setPickedYear(entry)
                    setPickedMonth(null)
                  }}
                  aria-pressed={entry === year}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm font-semibold',
                    entry === year
                      ? 'border-[#fc0c97] bg-[#fc0c97] text-white'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50',
                  )}
                >
                  {entry}
                </button>
              ))}
              <span className="ml-auto text-xs text-slate-500">{roster.length} students in the class</span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {months.map((value) => {
                const label = MONTHS[value - 1]
                const count = counts.get(value) ?? 0
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setPickedMonth(value)}
                    aria-pressed={value === month}
                    aria-label={`${label} ${year}: ${count} of ${perMonth} videos`}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm',
                      value === month ? 'border-[#fc0c97] ring-2 ring-[#fc0c97]/20' : 'border-slate-200 hover:bg-slate-50',
                    )}
                  >
                    <span className="font-semibold text-slate-800">{label}</span>
                    <span
                      className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold', monthCountTone(count, perMonth))}
                    >
                      {count}/{perMonth}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 className="text-base font-semibold text-slate-900">{monthLabel(year, month)}</h3>
              <span className="text-sm text-slate-500">
                {counts.get(month) ?? 0} of {perMonth} videos
              </span>
              {hiddenCount > 0 && (
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} />
                  Show hidden ({hiddenCount})
                </label>
              )}
              <div className="ml-auto flex flex-wrap gap-2">
                {monthAccessOn && (
                  <button
                    type="button"
                    onClick={() => setAccessOpen(true)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Open for {openCount} of {roster.length}
                  </button>
                )}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setEditing('new')}
                    className="flex items-center gap-1.5 rounded-lg bg-[#fc0c97] px-3 py-1 text-xs font-semibold text-white transition hover:bg-[#de0a84]"
                  >
                    <Plus size={14} aria-hidden="true" />
                    Upload video
                  </button>
                )}
              </div>
            </div>
            {monthAccessOn && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                Month access is on: students see a month's videos only after that month is opened for them.
              </div>
            )}
            {error && (
              <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            {shown.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">No videos for this month yet.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {shown.map((video) => {
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
                            <span className={cn('rounded-full px-2 py-0.5 font-semibold', statusStyles[video.status])}>
                              {videoStatusLabels[video.status]}
                            </span>
                            {video.isArchived && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold">Hidden</span>
                            )}
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
                              rel="noopener"
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
            )}
          </section>
        </>
      )}

      {editing && (
        <VideoEditorModal
          classroomId={classroom.id}
          className={classroom.name}
          video={editing === 'new' ? null : editing}
          defaultYear={year}
          defaultMonth={month}
          uploaderNote={
            editing === 'new' && teacherId !== currentTeacherId
              ? `This video is saved under your name, not ${teacherId === null ? 'No teacher' : (teacherNames.get(teacherId) ?? 'this teacher')}.`
              : null
          }
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void onChanged()
          }}
        />
      )}
      {accessOpen && (
        <MonthAccessModal
          classroomId={classroom.id}
          className={classroom.name}
          year={year}
          month={month}
          students={roster}
          access={access}
          onClose={() => setAccessOpen(false)}
          onChanged={loadAccess}
        />
      )}
    </div>
  )
}
