import { useState } from 'react'
import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import type { Teacher } from '../../types/domain'

type DeleteTeacherModalProps = {
  teacher: Teacher
  classroomNames: string[]
  successorOptions: Teacher[]
  isDeleting: boolean
  onClose: () => void
  onConfirm: (successorTeacherId: number | null) => void
}

export function DeleteTeacherModal({
  teacher,
  classroomNames,
  successorOptions,
  isDeleting,
  onClose,
  onConfirm,
}: DeleteTeacherModalProps) {
  // Default to handing over when the teacher still runs classes, so a
  // departing teacher's classes don't stop by accident.
  const [successorId, setSuccessorId] = useState(
    classroomNames.length > 0 && successorOptions[0] ? String(successorOptions[0].id) : '',
  )

  return (
    <ModalShell maxWidth="sm" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">Remove teacher</div>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">{teacher.fullName}</h2>
            <p className="mt-2 text-sm text-slate-500">
              Attendance records and past classes are always kept. A teacher with
              history is deactivated instead of deleted.
            </p>
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
      </div>

      <div className="space-y-4 px-6 py-6">
        {classroomNames.length > 0 && (
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Currently teaches: {classroomNames.join(', ')}
          </div>
        )}

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-700">
            Hand over classes to
          </span>
          <select
            value={successorId}
            onChange={(event) => setSuccessorId(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
          >
            <option value="">No one - stop their classes</option>
            {successorOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.fullName}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500">
            {successorId
              ? 'From today, their classrooms, students and upcoming classes move to this teacher.'
              : 'Their classrooms are left without a teacher and upcoming classes stop. Past classes stay on the calendar.'}
          </p>
        </label>

        <button
          type="button"
          disabled={isDeleting}
          onClick={() => onConfirm(successorId ? Number(successorId) : null)}
          className="w-full rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
        >
          {isDeleting ? 'Removing...' : 'Remove Teacher'}
        </button>
      </div>
    </ModalShell>
  )
}
