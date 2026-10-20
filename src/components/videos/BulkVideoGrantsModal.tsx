import { useMemo, useState } from 'react'
import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { getTodayString } from '../../domain/studentStatus'
import { getClassroomRosterOn } from '../../lib/roster'
import { setVideoGrants, type GrantTopic } from '../../lib/videoGrants'
import type { Subject } from '../../lib/subjects'
import type { Classroom, Student } from '../../types/domain'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Class Videos > Open for many students: pick the students (a class, or a whole
// age group), the age group and subject of the recordings (any, not only their
// own), and the months; then open or close them all at once.
export function BulkVideoGrantsModal({
  classrooms,
  students,
  subjects,
  ageGroups,
  onClose,
  onDone,
  save = setVideoGrants,
}: {
  classrooms: Classroom[]
  students: Student[]
  subjects: Subject[]
  ageGroups: string[]
  onClose: () => void
  onDone: () => void
  // The database unless a demo passes its own.
  save?: typeof setVideoGrants
}) {
  const today = getTodayString()
  const thisYear = Number(today.slice(0, 4))
  const active = classrooms.filter((classroom) => classroom.status === 'active')
  const [from, setFrom] = useState<{ kind: 'class'; id: string } | { kind: 'age'; ageGroup: string }>({ kind: 'class', id: '' })
  const [search, setSearch] = useState('')
  const [unticked, setUnticked] = useState<Set<number>>(new Set())
  const [topicAge, setTopicAge] = useState(ageGroups[0] ?? '')
  const [topicSubject, setTopicSubject] = useState('')
  const [year, setYear] = useState(thisYear)
  const [months, setMonths] = useState<Set<number>>(new Set([Number(today.slice(5, 7))]))
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const candidates = useMemo(() => {
    const ids =
      from.kind === 'class'
        ? from.id
          ? [Number(from.id)]
          : []
        : active.filter((classroom) => classroom.ageGroup === from.ageGroup).map((classroom) => classroom.id)
    const seen = new Set<number>()
    const list: Student[] = []
    for (const id of ids) {
      for (const student of getClassroomRosterOn(students, id, today)) {
        if (student.isActive && !seen.has(student.id)) {
          seen.add(student.id)
          list.push(student)
        }
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [from, active, students, today])
  const shown = candidates.filter((student) => student.name.toLowerCase().includes(search.trim().toLowerCase()))
  const chosen = candidates.filter((student) => !unticked.has(student.id))

  function pickClass(id: string) {
    setFrom({ kind: 'class', id })
    setUnticked(new Set())
    const classroom = active.find((entry) => String(entry.id) === id)
    // The class's own topic is the usual choice.
    if (classroom?.subjectId) {
      setTopicAge(classroom.ageGroup)
      setTopicSubject(String(classroom.subjectId))
    } else if (classroom) {
      setTopicSubject(`c:${classroom.id}`)
    }
  }

  const topic: GrantTopic | null = topicSubject.startsWith('c:')
    ? { kind: 'class', classroomId: Number(topicSubject.slice(2)) }
    : topicSubject && topicAge
      ? { kind: 'topic', ageGroup: topicAge, subjectId: Number(topicSubject) }
      : null
  const ready = topic !== null && chosen.length > 0 && months.size > 0

  async function run(granted: boolean) {
    if (!topic) return
    if (!granted && !window.confirm(`Close ${months.size} month(s) for ${chosen.length} students?`)) return
    setBusy(true)
    setMessage(null)
    const error = await save({
      studentIds: chosen.map((student) => student.id),
      topic,
      months: [...months].sort((a, b) => a - b).map((month) => ({ year, month })),
      granted,
      startsOn: granted ? startsOn || null : null,
      endsOn: granted ? endsOn || null : null,
    })
    setBusy(false)
    if (error) {
      setMessage({ tone: 'error', text: error })
      return
    }
    setMessage({ tone: 'ok', text: `${granted ? 'Opened' : 'Closed'} for ${chosen.length} students.` })
    onDone()
  }

  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
        <div>
          <div className="text-sm font-medium text-[#be185d]">Recordings access</div>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Open months for many students</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-white">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div data-modal-body className="max-h-[75vh] space-y-5 overflow-y-auto px-6 py-5 text-sm">
        <section className="space-y-2">
          <h3 className="font-semibold text-slate-900">1. Students</h3>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Students from a class"
              value={from.kind === 'class' ? from.id : ''}
              onChange={(event) => pickClass(event.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1"
            >
              <option value="">A class…</option>
              {active
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.name}
                  </option>
                ))}
            </select>
            <select
              aria-label="Students from an age group"
              value={from.kind === 'age' ? from.ageGroup : ''}
              onChange={(event) => {
                setFrom(event.target.value ? { kind: 'age', ageGroup: event.target.value } : { kind: 'class', id: '' })
                setUnticked(new Set())
                if (event.target.value) setTopicAge(event.target.value)
              }}
              className="rounded-lg border border-slate-200 px-2 py-1"
            >
              <option value="">…or a whole age group</option>
              {ageGroups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
            {candidates.length > 0 && (
              <input
                type="search"
                value={search}
                placeholder="Find a student"
                aria-label="Find a student"
                onChange={(event) => setSearch(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1"
              />
            )}
          </div>
          {candidates.length > 0 && (
            <>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>
                  {chosen.length} of {candidates.length} ticked
                </span>
                <button type="button" onClick={() => setUnticked(new Set())} className="font-semibold text-[#be185d] underline">
                  Tick all
                </button>
                <button type="button" onClick={() => setUnticked(new Set(candidates.map((student) => student.id)))} className="font-semibold text-[#be185d] underline">
                  Untick all
                </button>
              </div>
              <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                {shown.map((student) => (
                  <li key={student.id} className="px-3 py-1.5">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!unticked.has(student.id)}
                        onChange={(event) =>
                          setUnticked((current) => {
                            const next = new Set(current)
                            if (event.target.checked) next.delete(student.id)
                            else next.add(student.id)
                            return next
                          })
                        }
                      />
                      {student.name}
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-slate-900">2. Which recordings</h3>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Recordings of age group" value={topicAge} onChange={(event) => setTopicAge(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1">
              {ageGroups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
            <select aria-label="Recordings of subject" value={topicSubject} onChange={(event) => setTopicSubject(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1">
              <option value="">Pick a subject</option>
              {subjects
                .filter((subject) => subject.isActive)
                .map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              <optgroup label="Classes with no subject">
                {active
                  .filter((classroom) => !classroom.subjectId)
                  .map((classroom) => (
                    <option key={classroom.id} value={`c:${classroom.id}`}>
                      {classroom.name}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>
          <p className="text-xs text-slate-500">Every class and teacher of this age group and subject; another age group than the students' own is fine.</p>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-slate-900">3. Months</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Year of the months" value={year} onChange={(event) => setYear(Number(event.target.value))} className="rounded-lg border border-slate-200 px-2 py-1">
              {[thisYear - 1, thisYear, thisYear + 1].map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
            {MONTHS.map((label, index) => (
              <label key={label} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={months.has(index + 1)}
                  aria-label={`${label} ${year}`}
                  onChange={(event) =>
                    setMonths((current) => {
                      const next = new Set(current)
                      if (event.target.checked) next.add(index + 1)
                      else next.delete(index + 1)
                      return next
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label>
              <span className="block text-slate-500">Watchable from (optional)</span>
              <input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1" />
            </label>
            <label>
              <span className="block text-slate-500">Until (optional)</span>
              <input type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1" />
            </label>
          </div>
        </section>

        {message && (
          <div role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-red-700' : 'text-emerald-700'}>
            {message.text}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            disabled={!ready || busy}
            onClick={() => void run(false)}
            className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 disabled:opacity-50"
          >
            Close for {chosen.length}
          </button>
          <button
            type="button"
            disabled={!ready || busy}
            onClick={() => void run(true)}
            className="rounded-xl bg-[#fc0c97] px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : `Open for ${chosen.length} students`}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
