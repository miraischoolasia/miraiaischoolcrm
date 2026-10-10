import { useMemo, useState } from 'react'
import { describeStudent } from '../../lib/studentLink'
import type { Package, Student } from '../../types/domain'

type StudentLinkerProps = {
  students: Student[]
  packages: Package[]
  // Students already shown for this chat.
  shownIds: number[]
  // No student was found for this chat yet, so the search is open from the start.
  isEmpty: boolean
  // Ties the student to this chat; resolves to a message, or null when it worked.
  onLink: (student: Student) => Promise<string | null>
}

// For a parent whose number matches no student (the student has no number written, or WhatsApp
// hides the parent's): find the child by name and tie them to this chat.
export function StudentLinker({ students, packages, shownIds, isEmpty, onLink }: StudentLinkerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const open = isEmpty || isOpen
  const found = useMemo(() => {
    const wanted = query.trim().toLowerCase()
    if (!wanted) {
      return []
    }
    return students
      .filter((student) => !shownIds.includes(student.id) && student.name.toLowerCase().includes(wanted))
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name))
      .slice(0, 6)
  }, [students, shownIds, query])

  async function link(student: Student) {
    setBusyId(student.id)
    setProblem(null)
    const result = await onLink(student)
    setBusyId(null)
    if (result) {
      setProblem(result)
      return
    }
    setQuery('')
    setIsOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-xs font-medium text-[#be185d] hover:underline"
      >
        Link another child
      </button>
    )
  }

  return (
    <div className="space-y-1.5 text-xs">
      <label className="block">
        <span className="font-semibold text-slate-700">
          {isEmpty ? 'Is this the parent of a student? Find the child' : 'Find the child to link'}
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Student name"
          className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-[#fc0c97]"
        />
      </label>
      {query.trim() && found.length === 0 && <p className="text-slate-500">No student with that name.</p>}
      {found.length > 0 && (
        <ul className="space-y-1">
          {found.map((student) => (
            <li key={student.id}>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void link(student)}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-left hover:bg-slate-50 disabled:opacity-60"
              >
                <span className="block truncate text-sm text-slate-900">{student.name}</span>
                <span className="block truncate text-slate-500">
                  {describeStudent(student, packages)}
                  {student.isActive ? '' : ' · Not active now'}
                  {student.phone ? '' : ' · No phone number yet'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {problem && (
        <p role="alert" className="text-red-600">
          {problem}
        </p>
      )}
      {!isEmpty && (
        <button type="button" onClick={() => setIsOpen(false)} className="text-slate-500 hover:underline">
          Cancel
        </button>
      )}
    </div>
  )
}
