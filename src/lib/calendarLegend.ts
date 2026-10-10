import { getScheduleClassKind, type CalendarClassFilter } from './schedule'
import type { Classroom, Schedule } from '../types/domain'

export type LegendKey =
  | 'regular'
  | 'trialAvailable'
  | 'trialBooked'
  | 'camp'
  | 'replacement'
  | 'holiday'
  | 'cancelled'
  | 'makeup'

export const legendEntries: Record<LegendKey, { label: string; dot: string }> = {
  regular: { label: 'Regular Class', dot: 'bg-sky-500' },
  trialAvailable: { label: 'Trial - Available', dot: 'border border-dashed border-slate-400 bg-slate-50' },
  trialBooked: { label: 'Trial - Booked', dot: 'bg-teal-500' },
  camp: { label: 'Camp Class', dot: 'bg-emerald-600' },
  replacement: { label: 'Replacement Class', dot: 'bg-orange-500' },
  holiday: { label: 'Public Holiday', dot: 'bg-red-500' },
  cancelled: { label: 'Cancelled Day', dot: 'bg-slate-300' },
  makeup: { label: 'Make-up', dot: 'bg-violet-500' },
}

export const legendKeys: LegendKey[] = [
  'regular',
  'trialAvailable',
  'trialBooked',
  'camp',
  'replacement',
  'holiday',
  'cancelled',
  'makeup',
]

// Which kinds of class the viewer's own calendar actually has.
export function getScheduleKinds(schedules: Schedule[], classroomMap: Map<number, Classroom>) {
  return new Set(
    schedules
      .filter((schedule) => schedule.status === 'active')
      .map((schedule) => getScheduleClassKind(schedule, classroomMap)),
  )
}

// Someone who can edit the calendar plans every kind of class, so they see the
// whole legend. Everyone else only needs the colours that are on their own
// calendar.
export function getLegendKeys({
  canEdit,
  kinds,
  hasMakeups,
  hasCancelledDays,
}: {
  canEdit: boolean
  kinds: Set<Exclude<CalendarClassFilter, 'all'>>
  hasMakeups: boolean
  hasCancelledDays: boolean
}): LegendKey[] {
  if (canEdit) {
    return legendKeys
  }

  return legendKeys.filter((key) => {
    switch (key) {
      case 'regular':
      case 'holiday':
        return true
      case 'trialAvailable':
        return false
      case 'trialBooked':
        return kinds.has('trial')
      case 'camp':
        return kinds.has('camp')
      case 'replacement':
        return kinds.has('replacement')
      case 'cancelled':
        return hasCancelledDays
      case 'makeup':
        return hasMakeups
    }
  })
}

// The class-type buttons above the calendar: for someone who cannot edit it,
// only the kinds they have, and none at all when there is only one.
export function getClassFilterValues({
  canEdit,
  kinds,
  all,
}: {
  canEdit: boolean
  kinds: Set<Exclude<CalendarClassFilter, 'all'>>
  all: CalendarClassFilter[]
}): CalendarClassFilter[] {
  if (canEdit) {
    return all
  }

  const present = all.filter((value) => value === 'all' || kinds.has(value))
  return present.length <= 2 ? [] : present
}
