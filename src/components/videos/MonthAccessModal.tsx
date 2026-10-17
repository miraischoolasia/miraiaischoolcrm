import { useState } from 'react'
import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { formatDate, getTodayString } from '../../domain/studentStatus'
import { isMonthOpen, monthLabel, setStudentVideoAccess, type VideoAccess } from '../../lib/classVideos'
import type { Student } from '../../types/domain'

// Which students may watch one month of a class's videos (when the school
// uses month access).
export function MonthAccessModal({
  classroomId,
  className,
  year,
  month,
  students,
  access,
  onClose,
  onChanged,
}: {
  classroomId: number
  className: string
  year: number
  month: number
  students: Student[]
  access: VideoAccess[]
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const today = getTodayString()
  const [busy, setBusy] = useState<number | 'all' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const openCount = students.filter((student) => isMonthOpen(access, student.id, year, month, today)).length

  async function change(targets: Student[], granted: boolean, key: number | 'all') {
    setBusy(key)
    setError(null)
    for (const student of targets) {
      const message = await setStudentVideoAccess(student.id, classroomId, year, month, granted)
      if (message) {
        setError(`${student.name}: ${message}`)
        break
      }
    }
    await onChanged()
    setBusy(null)
  }

  return (
    <ModalShell maxWidth="sm" onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
        <div>
          <div className="text-sm font-medium text-[#be185d]">{className}</div>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Who can watch {monthLabel(year, month)}</h2>
          <div className="mt-1 text-sm text-slate-500">
            {openCount} of {students.length} students
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-white"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div data-modal-body className="max-h-[70vh] space-y-3 overflow-y-auto px-6 py-5">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void change(students.filter((s) => !isMonthOpen(access, s.id, year, month, today)), true, 'all')}
            className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Open for everyone
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              if (window.confirm(`Close ${monthLabel(year, month)} for every student in ${className}?`)) {
                void change(
                  students.filter((s) => access.some((row) => row.studentId === s.id && row.year === year && row.month === month)),
                  false,
                  'all',
                )
              }
            }}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            Close for everyone
          </button>
        </div>
        {students.length === 0 && <div className="text-sm text-slate-500">No students in this class today.</div>}
        <ul className="divide-y divide-slate-100">
          {students.map((student) => {
            const open = isMonthOpen(access, student.id, year, month, today)
            const row = access.find((entry) => entry.studentId === student.id && entry.year === year && entry.month === month)
            return (
              <li key={student.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{student.name}</div>
                  {row && (row.startsOn || row.endsOn) && (
                    <div className="text-xs text-slate-500">
                      {row.startsOn ? formatDate(row.startsOn) : 'Any time'} – {row.endsOn ? formatDate(row.endsOn) : 'no end'}
                      {!open && ' (not now)'}
                    </div>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={open}
                    disabled={busy !== null}
                    aria-label={`${student.name} can watch`}
                    onChange={(event) => void change([student], event.target.checked, student.id)}
                  />
                  {busy === student.id ? 'Saving…' : open ? 'Open' : 'Closed'}
                </label>
              </li>
            )
          })}
        </ul>
        {error && (
          <div role="alert" className="text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
