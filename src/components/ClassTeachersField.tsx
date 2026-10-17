import { useState } from 'react'
import { classroomTeacherIds, saveClassroomTeachers } from '../lib/classroomTeachers'
import type { Classroom, Teacher } from '../types/domain'

// Everyone who teaches a class (a class can have several teachers; the main
// one is marked). Staff who may edit classes add and take off teachers here;
// the main teacher is changed with Edit Class.
export function ClassTeachersField({
  classroom,
  teacherMap,
  assignableTeachers,
  onSaved,
}: {
  classroom: Classroom
  teacherMap: Map<number, Teacher>
  // Left out for a login that may not change classes.
  assignableTeachers?: Teacher[]
  onSaved?: () => Promise<void> | void
}) {
  const ids = classroomTeacherIds(classroom)
  const [draft, setDraft] = useState<number[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameOf = (id: number) => teacherMap.get(id)?.fullName ?? 'A teacher'

  async function save() {
    if (!draft) return
    setSaving(true)
    setError(null)
    // The main teacher first, so they stay main while still ticked.
    const ordered = [...draft].sort((a, b) => Number(b === classroom.teacherId) - Number(a === classroom.teacherId))
    const message = await saveClassroomTeachers(classroom.id, ordered)
    if (message) {
      setError(message)
    } else {
      await onSaved?.()
      setDraft(null)
    }
    setSaving(false)
  }

  if (draft && assignableTeachers) {
    return (
      <div className="space-y-2">
        <div className="text-sm font-semibold text-slate-700">Teachers of this class</div>
        <div className="grid max-h-56 gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-2">
          {assignableTeachers.map((teacher) => (
            <label key={teacher.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
              <input
                type="checkbox"
                checked={draft.includes(teacher.id)}
                onChange={(event) =>
                  setDraft(event.target.checked ? [...draft, teacher.id] : draft.filter((id) => id !== teacher.id))
                }
              />
              <span>
                {teacher.fullName}
                {teacher.id === classroom.teacherId && <span className="ml-1 text-xs text-slate-500">(main)</span>}
              </span>
            </label>
          ))}
        </div>
        {error && <div className="text-sm text-red-700">{error}</div>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-xl bg-[#fc0c97] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save teachers'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setDraft(null)
              setError(null)
            }}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-slate-500">Teachers:</span>
      {ids.length === 0 && <span className="text-slate-500">None yet</span>}
      {ids.map((id) => (
        <span key={id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
          {nameOf(id)}
          {id === classroom.teacherId && ids.length > 1 ? ' · main' : ''}
        </span>
      ))}
      {assignableTeachers && classroom.teacherIds !== undefined && (
        <button
          type="button"
          onClick={() => setDraft(ids)}
          className="text-xs font-semibold text-[#be185d] underline underline-offset-2"
        >
          Edit teachers
        </button>
      )}
    </div>
  )
}
