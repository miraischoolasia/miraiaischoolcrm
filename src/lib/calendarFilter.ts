import { getScheduleClassKind } from './schedule'
import { teachesSchedule } from './attendanceTakers'
import type { CalendarItem } from './calendarItems'
import type { Classroom, Schedule } from '../types/domain'
import { fetchTeamsWithMembers } from './staffTeams'

// What the Calendar shows (both the day list and the month / week / agenda calendar): only my own things,
// a team, some people, and which kinds of things. Kept in the browser per login.

export type CalendarKind = 'class' | 'trial' | 'makeup' | 'task' | 'meeting' | 'event' | 'follow_up'

export const CALENDAR_KINDS: { key: CalendarKind; label: string }[] = [
  { key: 'class', label: 'Classes' },
  { key: 'trial', label: 'Trials' },
  { key: 'makeup', label: 'Make-ups' },
  { key: 'task', label: 'Tasks' },
  { key: 'meeting', label: 'Meetings' },
  { key: 'event', label: 'Events' },
  { key: 'follow_up', label: 'Follow-ups' },
]

export type CalendarFilter = {
  // Only what I teach (my classes, the ones I assist, the days I cover) and what is mine to do.
  mine: boolean
  // Only that team's people (Admin > Teams); null for every team.
  teamId: number | null
  // Only these teachers or staff; empty for everyone.
  personIds: number[]
  // The kinds shown; all of them by default.
  kinds: CalendarKind[]
}

export type CalendarTeam = { id: number; name: string; memberIds: number[] }

export const ALL_KINDS = CALENDAR_KINDS.map((kind) => kind.key)

export function defaultCalendarFilter(mine = false): CalendarFilter {
  return { mine, teamId: null, personIds: [], kinds: ALL_KINDS }
}

// `kinds` = the kinds the page can show at all (a page that shows fewer is not "filtered" by that).
export function isFiltered(filter: CalendarFilter, kinds: CalendarKind[] = ALL_KINDS) {
  return filter.mine || filter.teamId !== null || filter.personIds.length > 0 || filter.kinds.length < kinds.length
}

// The two calendar pages: the Timetable shows the classes (and make-ups); the Planner shows the rest (trials, tasks,
// meetings, events, follow-ups) and the classes only when the person switches "Show classes" on.
export type CalendarPage = 'timetable' | 'planner'

export function pageKinds(page: CalendarPage, showClasses: boolean): CalendarKind[] {
  const keep: CalendarKind[] =
    page === 'timetable'
      ? ['class', 'makeup']
      : showClasses
        ? ALL_KINDS
        : ['trial', 'task', 'meeting', 'event', 'follow_up']
  return ALL_KINDS.filter((kind) => keep.includes(kind))
}

// The saved filter as the page shows it: only the kinds the page has (all of them when none of the saved ones is here).
export function pageFilter(filter: CalendarFilter, kinds: CalendarKind[]): CalendarFilter {
  const shown = filter.kinds.filter((kind) => kinds.includes(kind))
  return { ...filter, kinds: shown.length > 0 ? shown : kinds }
}

// The saved kinds after "Show classes" is switched on or off: from "everything" it stays everything.
export function kindsWithClasses(filter: CalendarFilter, before: CalendarKind[], on: boolean): CalendarKind[] {
  const classKinds: CalendarKind[] = ['class', 'makeup']
  const everything = before.every((kind) => filter.kinds.includes(kind))
  if (on) return everything ? ALL_KINDS : [...new Set([...filter.kinds, ...classKinds])]
  const rest = filter.kinds.filter((kind) => !classKinds.includes(kind))
  return rest.length > 0 ? rest : ALL_KINDS
}

// A weekly class (and a camp) is a class, a trial slot a trial, a one-off replacement day a make-up.
export function scheduleKind(schedule: Schedule, classroomMap: Map<number, Classroom>): CalendarKind {
  const kind = getScheduleClassKind(schedule, classroomMap)
  return kind === 'trial' ? 'trial' : kind === 'replacement' ? 'makeup' : 'class'
}

// A task tied to a lead is a follow-up reminder (Inbox > Follow up).
export function itemKind(item: Pick<CalendarItem, 'kind' | 'leadId'>): CalendarKind {
  return item.kind === 'task' && item.leadId !== null ? 'follow_up' : item.kind
}

// The people whose things show, or null for everyone. "Only mine" wins; otherwise the people picked and
// the team's members together.
export function filterPeople(filter: CalendarFilter, me: number | null, teams: CalendarTeam[]): Set<number> | null {
  if (filter.mine) return new Set(me === null ? [] : [me])
  const team = filter.teamId === null ? null : teams.find((entry) => entry.id === filter.teamId) ?? null
  const ids = [...filter.personIds, ...(team?.memberIds ?? [])]
  return filter.teamId === null && ids.length === 0 ? null : new Set(ids)
}

export function scheduleShown(
  schedule: Schedule,
  classroomMap: Map<number, Classroom>,
  filter: CalendarFilter,
  people: Set<number> | null,
) {
  if (!filter.kinds.includes(scheduleKind(schedule, classroomMap))) return false
  if (people === null) return true
  const classroom = schedule.classroomId !== null ? classroomMap.get(schedule.classroomId) ?? null : null
  return [...people].some((id) => teachesSchedule(schedule, classroom, id))
}

// A task, meeting, event or follow-up. One nobody is given (a school-wide event) shows to everyone.
export function itemShown(item: Pick<CalendarItem, 'kind' | 'leadId' | 'assigneeId'>, filter: CalendarFilter, people: Set<number> | null) {
  if (!filter.kinds.includes(itemKind(item))) return false
  return people === null || item.assigneeId === null || people.has(item.assigneeId)
}

const KINDS = new Set<string>(ALL_KINDS)

export function readCalendarFilter(raw: string | null, fallback: CalendarFilter): CalendarFilter {
  if (!raw) return fallback
  try {
    const value = JSON.parse(raw) as Partial<CalendarFilter>
    return {
      mine: value.mine === true,
      teamId: typeof value.teamId === 'number' ? value.teamId : null,
      personIds: Array.isArray(value.personIds) ? value.personIds.filter((id): id is number => typeof id === 'number') : [],
      kinds: Array.isArray(value.kinds) ? value.kinds.filter((kind): kind is CalendarKind => KINDS.has(kind)) : fallback.kinds,
    }
  } catch {
    return fallback
  }
}

const storageKey = (login: string) => `mirai.calendarFilter.${login}`

// The browser can refuse storage (private window); the filter then lasts until the page is closed.
export function loadCalendarFilter(login: string, fallback: CalendarFilter) {
  try {
    return readCalendarFilter(window.localStorage.getItem(storageKey(login)), fallback)
  } catch {
    return fallback
  }
}

export function saveCalendarFilter(login: string, filter: CalendarFilter) {
  try {
    window.localStorage.setItem(storageKey(login), JSON.stringify(filter))
  } catch {
    // Not kept; nothing else to do.
  }
}

// The school's teams for the Team filter (My Team > Teams, docs/teams-permissions-design.md): every switched-on
// team and its people. A database without teams yet gives none, and the Team filter says so.
export async function fetchCalendarTeams(): Promise<CalendarTeam[]> {
  try {
    const teams = await fetchTeamsWithMembers()
    return teams.map((team) => ({ id: team.id, name: team.name, memberIds: team.memberIds }))
  } catch {
    // Only a filter: without the teams the calendar still works.
    return []
  }
}
