import { useState } from 'react'
import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import type { Package, Student } from '../../types/domain'

export type PackageAssignment = { studentId: number; packageId: number | null }

type AssignPackagesModalProps = {
  // Regular students; the ones with no package are listed first.
  students: Student[]
  packages: Package[]
  isSaving: boolean
  error: string | null
  onClose: () => void
  onSave: (changes: PackageAssignment[]) => void
}

// Tags students who joined before packages existed with the package they
// are on. Nothing else changes: classes and dates stay as they are, and no
// enrollment is recorded (that happens on the next renewal).
export function AssignPackagesModal({
  students,
  packages,
  isSaving,
  error,
  onClose,
  onSave,
}: AssignPackagesModalProps) {
  const [picked, setPicked] = useState<Record<number, string>>(() =>
    Object.fromEntries(students.map((student) => [student.id, String(student.packageId ?? '')])),
  )
  const ordered = [...students].sort(
    (a, b) => Number(Boolean(a.packageId)) - Number(Boolean(b.packageId)) || a.name.localeCompare(b.name),
  )
  const changes: PackageAssignment[] = students
    .filter((student) => picked[student.id] !== String(student.packageId ?? ''))
    .map((student) => ({
      studentId: student.id,
      packageId: picked[student.id] ? Number(picked[student.id]) : null,
    }))

  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">Students</div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Set Packages</h2>
            <p className="mt-2 text-sm text-slate-500">
              Pick the package each student is on now. Classes and dates are not changed;
              the next renewal records the package history.
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

      <div data-modal-body className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-6 sm:px-8">
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {ordered.map((student) => (
            <li key={student.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold text-slate-900">{student.name}</div>
                <div className="text-xs text-slate-500">
                  {student.remainingHours} classes left
                  {student.isActive ? '' : ' · Deactivated'}
                </div>
              </div>
              <select
                value={picked[student.id] ?? ''}
                aria-label={`Package for ${student.name}`}
                onChange={(event) =>
                  setPicked((current) => ({ ...current, [student.id]: event.target.value }))
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97] sm:w-56"
              >
                <option value="">No package</option>
                {packages
                  .filter((pkg) => pkg.isActive || pkg.id === student.packageId)
                  .map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name}
                      {pkg.isActive ? '' : ' (hidden)'}
                    </option>
                  ))}
              </select>
            </li>
          ))}
          {ordered.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-500">No regular students yet.</li>
          )}
        </ul>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving || changes.length === 0}
            onClick={() => onSave(changes)}
            className="rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving
              ? 'Saving...'
              : changes.length === 0
                ? 'Save'
                : `Save ${changes.length} change${changes.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
