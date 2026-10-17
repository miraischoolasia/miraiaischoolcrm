import { useState } from 'react'
import { formatDate } from '../domain/studentStatus'
import { getExtraClassIds, getStudentClassIds } from '../lib/roster'
import type { Classroom, Student } from '../types/domain'

// The classes a student is in besides the main one (a student can take
// several subjects). Staff who may edit students add and remove them.
export function ExtraClassesField({
  student,
  classrooms,
  onAdd,
  onRemove,
}: {
  student: Student
  classrooms: Classroom[]
  onAdd?: (classroomId: number) => Promise<string | null>
  onRemove?: (classroomId: number) => Promise<string | null>
}) {
  const [picked, setPicked] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Before the class history exists, a student has one class only.
  if (student.classPeriods === undefined) {
    return null
  }
  const extraIds = getExtraClassIds(student)
  if (extraIds.length === 0 && !onAdd) {
    return null
  }
  const inIds = new Set(getStudentClassIds(student))
  const choices = classrooms
    .filter((classroom) => classroom.status === 'active' && !inIds.has(classroom.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  const nameOf = (id: number) => classrooms.find((classroom) => classroom.id === id)?.name ?? 'A class'
  const sinceOf = (id: number) =>
    student.classPeriods?.find((period) => period.classroomId === id && period.endDate === null)?.startDate ?? null

  async function run(id: number, action: (classroomId: number) => Promise<string | null>) {
    setBusyId(id)
    setError(null)
    const message = await action(id)
    setBusyId(null)
    if (message) {
      setError(message)
      return
    }
    setPicked('')
  }

  return (
    <div>
      <div className="text-sm text-slate-500">Other Classes</div>
      {extraIds.length === 0 ? (
        <div className="mt-1 text-sm text-slate-400">None</div>
      ) : (
        <ul className="mt-1 space-y-1">
          {extraIds.map((id) => {
            const since = sinceOf(id)
            return (
              <li key={id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-semibold text-slate-900">{nameOf(id)}</span>
                  {since && <span className="text-slate-500"> · since {formatDate(since)}</span>}
                </span>
                {onRemove && (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => {
                      if (window.confirm(`Take ${student.name} out of ${nameOf(id)}?`)) {
                        void run(id, onRemove)
                      }
                    }}
                    className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    {busyId === id ? 'Removing…' : 'Remove'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {onAdd && choices.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <select
            aria-label="Add to another class"
            value={picked}
            onChange={(event) => setPicked(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm"
          >
            <option value="">Add to another class…</option>
            {choices.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!picked || busyId !== null}
            onClick={() => void run(Number(picked), onAdd)}
            className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            {busyId !== null && busyId === Number(picked) ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}
      {error && <div className="mt-1 text-sm text-rose-600">{error}</div>}
    </div>
  )
}
