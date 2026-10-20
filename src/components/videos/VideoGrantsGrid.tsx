import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { formatDate, getTodayString } from '../../domain/studentStatus'
import { useAgeGroups } from '../../lib/ageGroups'
import { supabase } from '../../lib/supabase'
import { fetchSubjects, type Subject } from '../../lib/subjects'
import {
  fetchCanGrantVideos,
  fetchStudentGrants,
  isGrantOpen,
  setVideoGrants,
  topicKey,
  topicLabel,
  topicOfClassroom,
  type GrantTopic,
  type VideoGrant,
} from '../../lib/videoGrants'
import type { Classroom } from '../../types/domain'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type NoSubjectClass = { id: number; name: string }

// Where the grid reads and saves; the database unless a demo passes its own.
export type VideoGrantsApi = {
  fetchGrants: (studentId: number) => Promise<VideoGrant[]>
  canGrant: () => Promise<boolean>
  setGrants: typeof setVideoGrants
  fetchSubjects: () => Promise<Subject[]>
  fetchNoSubjectClasses: () => Promise<NoSubjectClass[]>
}

const databaseApi: VideoGrantsApi = {
  fetchGrants: fetchStudentGrants,
  canGrant: fetchCanGrantVideos,
  setGrants: setVideoGrants,
  fetchSubjects,
  fetchNoSubjectClasses: async () => {
    if (!supabase) return []
    const { data } = await supabase.from('classrooms').select('id, name').is('subject_id', null).eq('status', 'active').order('name')
    return (data ?? []) as NoSubjectClass[]
  },
}

// Student page > Videos (month access on): which age group x subject x month of
// recordings this student may watch, whatever class or teacher the videos are in.
// One row per topic - the student's own classes' first, then any other ticked one;
// staff who may open recordings tick months and add rows (another age group too).
export function VideoGrantsGrid({
  studentId,
  classrooms,
  api = databaseApi,
}: {
  studentId: number
  classrooms: Classroom[]
  api?: VideoGrantsApi
}) {
  const today = getTodayString()
  const thisYear = Number(today.slice(0, 4))
  const ageGroups = useAgeGroups()
  const [year, setYear] = useState(thisYear)
  const [grants, setGrants] = useState<VideoGrant[] | null>(null)
  const [canGrant, setCanGrant] = useState(false)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [noSubjectClasses, setNoSubjectClasses] = useState<NoSubjectClass[]>([])
  const [extraTopics, setExtraTopics] = useState<GrantTopic[]>([])
  const [adding, setAdding] = useState<{ ageGroup: string; subject: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setGrants(await api.fetchGrants(studentId))
      setError(null)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not load the recordings access.')
    }
  }, [studentId, api])

  useEffect(() => {
    void load()
    void api.canGrant().then(setCanGrant)
    void api.fetchSubjects().then(setSubjects).catch(() => setSubjects([]))
    void api.fetchNoSubjectClasses().then(setNoSubjectClasses).catch(() => setNoSubjectClasses([]))
  }, [load, api])

  const subjectName = useCallback((id: number) => subjects.find((subject) => subject.id === id)?.name, [subjects])
  const className = useCallback(
    (id: number) => classrooms.find((classroom) => classroom.id === id)?.name ?? noSubjectClasses.find((entry) => entry.id === id)?.name,
    [classrooms, noSubjectClasses],
  )

  const topics = useMemo(() => {
    const list: GrantTopic[] = []
    const seen = new Set<string>()
    const add = (topic: GrantTopic) => {
      const key = topicKey(topic)
      if (!seen.has(key)) {
        seen.add(key)
        list.push(topic)
      }
    }
    classrooms.forEach((classroom) => add(topicOfClassroom(classroom)))
    ;(grants ?? []).forEach((grant) => add(grant.topic))
    extraTopics.forEach(add)
    return list
  }, [classrooms, grants, extraTopics])

  if (error) return <div className="text-sm text-red-700">{error}</div>
  if (grants === null) return <div className="text-sm text-slate-500">Loading the recordings access…</div>

  const cell = (topic: GrantTopic, month: number) =>
    grants.find((grant) => topicKey(grant.topic) === topicKey(topic) && grant.year === year && grant.month === month) ?? null

  async function change(topic: GrantTopic, months: number[], granted: boolean, key: string) {
    setBusy(key)
    const message = await api.setGrants({ studentIds: [studentId], topic, months: months.map((month) => ({ year, month })), granted })
    setBusy(null)
    if (message) {
      setError(message)
      return
    }
    await load()
  }

  function addTopic() {
    if (!adding) return
    const topic: GrantTopic = adding.subject.startsWith('c:')
      ? { kind: 'class', classroomId: Number(adding.subject.slice(2)) }
      : { kind: 'topic', ageGroup: adding.ageGroup, subjectId: Number(adding.subject) }
    setExtraTopics((current) => [...current, topic])
    setAdding(null)
  }

  return (
    <section aria-label="Recordings access" className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Recordings this student may watch</h4>
          <p className="text-xs text-slate-500">
            By age group, subject and month, from any class or teacher.{' '}
            {canGrant ? 'Tick a month to open it.' : 'Only staff who may edit students can change it.'}
          </p>
        </div>
        <select
          value={year}
          aria-label="Year"
          onChange={(event) => setYear(Number(event.target.value))}
          className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
        >
          {[thisYear - 1, thisYear, thisYear + 1].map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-[640px] text-sm">
          <thead>
            <tr className="text-xs text-slate-500">
              <th className="py-1 pr-3 text-left font-semibold">Age group · subject</th>
              {MONTHS.map((label) => (
                <th key={label} className="w-9 py-1 text-center font-semibold">
                  {label}
                </th>
              ))}
              {canGrant && <th className="py-1" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {topics.length === 0 && (
              <tr>
                <td colSpan={14} className="py-3 text-slate-500">
                  Nothing opened yet.
                </td>
              </tr>
            )}
            {topics.map((topic) => {
              const rowKey = topicKey(topic)
              const label = topicLabel(topic, subjectName, className)
              return (
                <tr key={rowKey}>
                  <td className="py-1.5 pr-3 font-medium text-slate-800">{label}</td>
                  {MONTHS.map((monthLabel, index) => {
                    const month = index + 1
                    const grant = cell(topic, month)
                    // Ticked while open or still to come; a month closed by a stop shows unticked with its end day.
                    const ticked = grant !== null && (grant.endsOn === null || grant.endsOn >= today)
                    const ended = grant !== null && !ticked
                    const key = `${rowKey}-${month}`
                    return (
                      <td key={monthLabel} className="text-center">
                        <input
                          type="checkbox"
                          checked={ticked}
                          disabled={!canGrant || busy !== null}
                          aria-label={`${label} ${monthLabel} ${year}`}
                          title={
                            ended
                              ? `Closed on ${formatDate(grant.endsOn ?? '')}`
                              : grant && !isGrantOpen(grant, today)
                                ? `Opens on ${formatDate(grant.startsOn ?? '')}`
                                : undefined
                          }
                          onChange={(event) => void change(topic, [month], event.target.checked, key)}
                          className={cn(ended && 'outline outline-1 outline-amber-400')}
                        />
                      </td>
                    )
                  })}
                  {canGrant && (
                    <td className="pl-2">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void change(topic, MONTHS.map((_, index) => index + 1), true, `${rowKey}-all`)}
                        className="whitespace-nowrap text-xs font-semibold text-[#be185d] underline underline-offset-2 disabled:opacity-50"
                      >
                        {busy === `${rowKey}-all` ? 'Saving…' : `All of ${year}`}
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {canGrant &&
        (adding ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <select
              value={adding.ageGroup}
              aria-label="Age group to add"
              onChange={(event) => setAdding({ ...adding, ageGroup: event.target.value })}
              className="rounded-lg border border-slate-200 px-2 py-1"
            >
              {ageGroups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
            <select
              value={adding.subject}
              aria-label="Subject to add"
              onChange={(event) => setAdding({ ...adding, subject: event.target.value })}
              className="rounded-lg border border-slate-200 px-2 py-1"
            >
              <option value="">Pick a subject</option>
              {subjects
                .filter((subject) => subject.isActive)
                .map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              {noSubjectClasses.length > 0 && (
                <optgroup label="Classes with no subject">
                  {noSubjectClasses.map((entry) => (
                    <option key={entry.id} value={`c:${entry.id}`}>
                      {entry.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <button
              type="button"
              disabled={!adding.subject}
              onClick={addTopic}
              className="rounded-lg bg-[#fc0c97] px-3 py-1 font-semibold text-white disabled:opacity-50"
            >
              Add row
            </button>
            <button type="button" onClick={() => setAdding(null)} className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700">
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding({ ageGroup: ageGroups[0] ?? '', subject: '' })}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#be185d]"
          >
            <Plus size={12} aria-hidden="true" />
            Another age group or subject
          </button>
        ))}
    </section>
  )
}
