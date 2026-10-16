import type { AttendanceStatusOption, AttendanceStatusColor } from '../types/domain'

// The three every school starts with, used before the list has loaded and
// when Supabase is not configured (same keys as the seeded rows).
export const defaultAttendanceStatuses: AttendanceStatusOption[] = [
  { key: 'present', label: 'Present', attended: true, deductsLesson: true, color: 'emerald', sortOrder: 10, isActive: true },
  { key: 'absent', label: 'Absent', attended: false, deductsLesson: false, color: 'rose', sortOrder: 20, isActive: true },
  { key: 'leave', label: 'Leave', attended: false, deductsLesson: false, color: 'amber', sortOrder: 30, isActive: true },
]

// Every new attendance starts on this one; it can never be hidden.
export const PRESENT = 'present'

export const attendanceColorStyles: Record<
  AttendanceStatusColor,
  { button: string; chip: string; square: string; swatch: string }
> = {
  emerald: {
    button: 'bg-emerald-50 text-emerald-700',
    chip: 'bg-emerald-50 text-emerald-700',
    square: 'border-emerald-500 bg-emerald-100',
    swatch: 'bg-emerald-500',
  },
  rose: {
    button: 'bg-red-50 text-red-700',
    chip: 'bg-red-50 text-red-700',
    square: 'border-red-500 bg-red-100',
    swatch: 'bg-red-500',
  },
  amber: {
    button: 'bg-amber-50 text-amber-700',
    chip: 'bg-amber-50 text-amber-700',
    square: 'border-amber-500 bg-amber-100',
    swatch: 'bg-amber-500',
  },
  sky: {
    button: 'bg-sky-50 text-sky-700',
    chip: 'bg-sky-50 text-sky-700',
    square: 'border-sky-500 bg-sky-100',
    swatch: 'bg-sky-500',
  },
  violet: {
    button: 'bg-violet-50 text-violet-700',
    chip: 'bg-violet-50 text-violet-700',
    square: 'border-violet-500 bg-violet-100',
    swatch: 'bg-violet-500',
  },
  slate: {
    button: 'bg-slate-100 text-slate-800',
    chip: 'bg-slate-100 text-slate-700',
    square: 'border-slate-400 bg-slate-100',
    swatch: 'bg-slate-500',
  },
}

export const attendanceColorNames: AttendanceStatusColor[] = ['emerald', 'rose', 'amber', 'sky', 'violet', 'slate']

export function sortStatuses(statuses: AttendanceStatusOption[]) {
  return [...statuses].sort((left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key))
}

// Looks a status up by key; an unknown key (a status this page has not loaded
// yet) reads as itself, not attended, grey.
export function getStatusOption(statuses: AttendanceStatusOption[], key: string): AttendanceStatusOption {
  return (
    statuses.find((status) => status.key === key) ?? {
      key,
      label: key,
      attended: key === PRESENT,
      deductsLesson: key === PRESENT,
      color: 'slate',
      sortOrder: 999,
      isActive: false,
    }
  )
}

// Was the student in class (needs a review, counts as there)?
export function isAttendedStatus(statuses: AttendanceStatusOption[], key: string) {
  return getStatusOption(statuses, key).attended
}

// The buttons on the attendance form: the shown statuses, plus a hidden one a
// student of this lesson already has (so an edit can keep it).
export function statusChoices(statuses: AttendanceStatusOption[], inUse: string[] = []) {
  const used = new Set(inUse)
  return sortStatuses(statuses.filter((status) => status.isActive || used.has(status.key)))
}
