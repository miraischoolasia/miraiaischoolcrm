import { formatDate } from '../domain/studentStatus'
import { leadStatusOptions } from './constants'
import { describePermissions, parseAccountPermissions } from './permissions'
import type { AdminActivity } from '../types/domain'

export type ActivityArea = 'leads' | 'students' | 'classes' | 'team'

export const activityAreaLabels: Record<ActivityArea, string> = {
  leads: 'Leads',
  students: 'Students',
  classes: 'Classes & Calendar',
  team: 'Team',
}

export function getActivityArea(activity: AdminActivity): ActivityArea {
  if (activity.entityType === 'lead') {
    return 'leads'
  }
  if (activity.entityType === 'student') {
    return 'students'
  }
  if (activity.entityType === 'teacher') {
    return 'team'
  }
  return 'classes'
}

// Names for the ids kept in the log details.
export type ActivityNames = {
  teacher: (id: number) => string | undefined
  classroom: (id: number) => string | undefined
}

export type ActivityChange = { label: string; from: string; to: string }

export type ActivityView = {
  title: string
  // Before -> after, only for values that actually changed.
  changes: ActivityChange[]
  notes: string[]
}

const text = (value: unknown) =>
  value === null || value === undefined || value === '' ? '' : String(value)

const isDateKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
const date = (value: unknown) => {
  const raw = text(value)
  return isDateKey(raw) ? formatDate(raw) : raw
}
const words = (value: unknown) => {
  const raw = text(value)
  return raw ? raw.replaceAll('_', ' ').replace(/^\w/, (letter) => letter.toUpperCase()) : ''
}
const stageLabel = (value: unknown) =>
  leadStatusOptions.find((option) => option.key === value)?.label ?? words(value)

export function describeActivity(activity: AdminActivity, names: ActivityNames): ActivityView {
  const d = activity.details
  const label = activity.entityLabel
  const teacher = (value: unknown) =>
    typeof value === 'number' ? names.teacher(value) ?? `Teacher #${value}` : ''
  const classroom = (value: unknown) =>
    typeof value === 'number' ? names.classroom(value) ?? `Classroom #${value}` : 'No classroom'
  const changes: ActivityChange[] = []
  const notes: string[] = []
  const change = (changeLabel: string, from: string, to: string) => {
    if (from !== to) {
      changes.push({ label: changeLabel, from: from || '-', to: to || '-' })
    }
  }
  const note = (value: string) => {
    if (value) {
      notes.push(value)
    }
  }

  switch (activity.actionType) {
    case 'lead_created':
      note(d.source ? `Source: ${words(d.source)}` : '')
      return { title: `Added lead ${label}`, changes, notes }
    case 'lead_created_via_api':
      note(d.source ? `Source: ${words(d.source)}` : '')
      return { title: `New lead ${label} from the website`, changes, notes }
    case 'lead_updated':
    case 'lead_updated_via_api':
      note(d.status ? `Stage: ${stageLabel(d.status)}` : '')
      return { title: `Updated lead ${label}`, changes, notes }
    case 'lead_stage_changed':
      return { title: `Moved lead ${label} to ${stageLabel(d.status)}`, changes, notes }
    case 'lead_deleted':
      return { title: `Deleted lead ${label}`, changes, notes }
    case 'lead_converted':
      return { title: `Turned lead ${label} into a student`, changes, notes }
    case 'lead_follow_up_logged':
      return { title: `Logged follow-up #${text(d.follow_up_number)} for ${label}`, changes, notes }
    case 'lead_bulk_imported':
      return { title: `Imported ${text(d.count)} leads`, changes, notes }

    case 'student_created':
      note(d.classroom_id !== undefined ? `Classroom: ${classroom(d.classroom_id)}` : '')
      note(d.student_type ? `Type: ${words(d.student_type)}` : '')
      return { title: `Added student ${label}`, changes, notes }
    case 'student_updated':
      change('Classroom', classroom(d.previous_classroom_id), classroom(d.new_classroom_id))
      change('Teacher', teacher(d.previous_teacher_id), teacher(d.new_teacher_id))
      change('Type', words(d.previous_student_type), words(d.new_student_type))
      return { title: `Updated student ${label}`, changes, notes }
    case 'student_renewed':
      note(d.package ? `Package: ${text(d.package)}` : '')
      note(Number(d.classes_added) > 0 ? `+${text(d.classes_added)} classes` : '')
      note(d.lesson_expiry ? `Lessons until ${date(d.lesson_expiry)}` : '')
      note(d.account_fee_expiry ? `Account Fee until ${date(d.account_fee_expiry)}` : '')
      note(d.mirai_club_expiry ? `Mirai Club until ${date(d.mirai_club_expiry)}` : '')
      return { title: `Renewed ${label}`, changes, notes }
    case 'student_deactivated':
      return { title: `Deactivated student ${label}`, changes, notes }

    case 'classroom_created':
    case 'classroom_updated':
    case 'classroom_archived':
    case 'classroom_restored': {
      const verb = {
        classroom_created: 'Added',
        classroom_updated: 'Updated',
        classroom_archived: 'Archived',
        classroom_restored: 'Restored',
      }[activity.actionType]
      note(d.teacher_id !== undefined ? `Teacher: ${teacher(d.teacher_id)}` : '')
      note([text(d.age_group), text(d.program_level)].filter(Boolean).join(' · '))
      return { title: `${verb} classroom ${label}`, changes, notes }
    }
    case 'classroom_teacher_changed':
      change('Teacher', teacher(d.from_teacher_id), teacher(d.to_teacher_id))
      note(d.effective_date ? `From ${date(d.effective_date)}` : '')
      return { title: `Changed the teacher of ${label}`, changes, notes }

    case 'schedule_created':
    case 'schedule_updated':
      note(d.event_type ? `${words(d.event_type)} class` : '')
      note(d.teacher_id !== undefined ? `Teacher: ${teacher(d.teacher_id)}` : '')
      return {
        title: `${activity.actionType === 'schedule_created' ? 'Added' : 'Updated'} class ${label}`,
        changes,
        notes,
      }
    case 'schedule_cancelled':
      return { title: `Cancelled all of class ${label}`, changes, notes }
    case 'schedule_occurrence_cancelled':
      return { title: `Cancelled ${label} on ${date(d.occurrence_date)}`, changes, notes }
    case 'schedule_occurrence_restored':
      return { title: `Brought back ${label} on ${date(d.occurrence_date)}`, changes, notes }
    case 'schedule_moved':
      return { title: `Moved ${label} from ${date(d.from_date)} to ${date(d.to_date)}`, changes, notes }
    case 'trial_booked':
      return {
        title: `Booked a trial for ${text(d.child_name) || label} on ${date(d.booking_date)}`,
        changes,
        notes: [`Slot: ${label}`],
      }
    case 'trial_booking_cancelled':
      return {
        title: `Cancelled the trial of ${text(d.child_name) || label} on ${date(d.booking_date)}`,
        changes,
        notes: [`Slot: ${label}`],
      }
    case 'trial_moved': {
      const children = Array.isArray(d.children) ? d.children.join(', ') : text(d.children)
      note(children ? `Children: ${children}` : '')
      note(d.start_time ? `New time: ${text(d.start_time).slice(0, 5)}` : '')
      return { title: `Moved a trial from ${date(d.from_date)} to ${date(d.to_date)}`, changes, notes }
    }
    case 'makeup_planned':
    case 'makeup_updated':
    case 'makeup_deleted': {
      const who = text(d.student_name) || 'the whole class'
      const verb = activity.actionType === 'makeup_deleted' ? 'Deleted' : 'Planned'
      note(d.missed_date ? `Missed class: ${date(d.missed_date)}` : '')
      return { title: `${verb} a make-up for ${who} in ${label}`, changes, notes }
    }

    case 'teacher_created':
      return { title: `Added ${words(d.role) || 'an'} account ${label}`, changes, notes }
    case 'teacher_updated':
      change('Username', text(d.previous_username), text(d.new_username))
      change('Role', words(d.previous_role), words(d.new_role))
      return { title: `Updated account ${label}`, changes, notes }
    case 'teacher_deleted':
      note(typeof d.successor_teacher_id === 'number' ? `Classes moved to ${teacher(d.successor_teacher_id)}` : '')
      return { title: `Removed account ${label}`, changes, notes }
    case 'permissions_updated':
      change(
        'Can use',
        describePermissions(parseAccountPermissions(d.previous)),
        describePermissions(parseAccountPermissions(d.new)),
      )
      return { title: `Changed what ${label} can use`, changes, notes }

    default:
      for (const [key, value] of Object.entries(d)) {
        if (value !== null && value !== '' && typeof value !== 'object') {
          note(`${words(key)}: ${date(value)}`)
        }
      }
      return { title: `${words(activity.actionType)}: ${label}`, changes, notes }
  }
}

export function addDays(dayKey: string, days: number) {
  const [year, month, day] = dayKey.split('-').map(Number)
  const next = new Date(year, month - 1, day + days)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

// Day headings: Today, Yesterday, then the date.
export function getActivityDayLabel(dayKey: string, todayKey: string) {
  if (dayKey === todayKey) {
    return 'Today'
  }
  return dayKey === addDays(todayKey, -1) ? 'Yesterday' : formatDate(dayKey)
}
