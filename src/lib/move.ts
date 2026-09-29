import { isScheduleMeetingDate } from './makeup'
import type { Classroom, Schedule, ScheduleException } from '../types/domain'

// "HH:mm" of a Date in local time, the format the schedule RPCs take.
export function getTimeFromDate(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// Trial slots that run on a date, i.e. where a dragged trial can land.
// Trial slots meet every week, the 29th-31st included.
export function getTrialSlotsOnDate(
  schedules: Schedule[],
  classroomMap: Map<number, Classroom>,
  exceptions: ScheduleException[],
  dateKey: string,
) {
  return schedules
    .filter((schedule) => {
      const classroom =
        schedule.classroomId !== null ? classroomMap.get(schedule.classroomId) : undefined
      return (
        classroom?.category === 'trial' &&
        classroom.status === 'active' &&
        isScheduleMeetingDate(schedule, dateKey, exceptions, true)
      )
    })
    .sort((left, right) => left.startTime.localeCompare(right.startTime))
}

export type DragCheck = {
  classKind: 'regular' | 'trial' | 'replacement'
  fromDate: string
  toDate: string
  todayString: string
  droppedAllDay: boolean
  hasAttendance: boolean
  trialBookingCount: number
  trialSlotsOnTarget: number
}

// Why a class card cannot be dropped there, or null when it can. Mirrors
// move_class_occurrence / move_trial_bookings so a bad drop never reaches
// the confirm step.
export function getDragBlockReason(check: DragCheck) {
  if (check.droppedAllDay) {
    return 'Drop the class on a time, not the all-day row.'
  }

  if (check.hasAttendance) {
    return 'Attendance is already taken for this class, so it cannot be moved.'
  }

  if (check.toDate <= check.todayString) {
    return 'Classes can only be moved to a date after today.'
  }

  if (check.classKind === 'trial') {
    if (check.trialBookingCount === 0) {
      return 'Nobody is booked on this trial slot yet, so there is nothing to move.'
    }

    if (check.trialSlotsOnTarget === 0) {
      return 'There is no trial slot on that day.'
    }
  }

  return null
}
