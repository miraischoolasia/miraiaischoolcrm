import { describe, expect, it } from 'vitest'
import {
  ALL_KINDS,
  defaultCalendarFilter,
  filterPeople,
  isFiltered,
  itemKind,
  itemShown,
  kindsWithClasses,
  pageFilter,
  pageKinds,
  readCalendarFilter,
  scheduleKind,
  scheduleShown,
} from './calendarFilter'
import type { Classroom, Schedule } from '../types/domain'

const classroom = (id: number, change: Partial<Classroom> = {}): Classroom => ({
  id,
  name: `Class ${id}`,
  category: 'regular',
  ageGroup: 'Form 1',
  programLevel: 'Regular',
  teacherId: 1,
  status: 'active',
  notes: null,
  archivedAt: null,
  ...change,
})

const schedule = (id: number, change: Partial<Schedule> = {}): Schedule => ({
  id,
  teacherId: 1,
  classroomId: 1,
  title: `Class ${id}`,
  eventType: 'regular',
  recurrenceType: 'weekly',
  dayOfWeek: 1,
  scheduledDate: null,
  startTime: '15:45',
  endTime: '17:00',
  startRecur: '2026-10-01',
  endRecur: null,
  status: 'active',
  notes: null,
  ...change,
})

const classrooms = new Map([
  [1, classroom(1, { teacherIds: [1, 3] })],
  [2, classroom(2, { category: 'trial', teacherId: 2 })],
])

describe('calendar filter', () => {
  it('sorts classes, trials and make-ups, and tells a follow-up from a task', () => {
    expect(scheduleKind(schedule(1), classrooms)).toBe('class')
    expect(scheduleKind(schedule(2, { classroomId: 2, teacherId: 2 }), classrooms)).toBe('trial')
    expect(scheduleKind(schedule(3, { eventType: 'replacement', classroomId: null }), classrooms)).toBe('makeup')
    expect(itemKind({ kind: 'task', leadId: 9 })).toBe('follow_up')
    expect(itemKind({ kind: 'task', leadId: null })).toBe('task')
    expect(itemKind({ kind: 'meeting', leadId: null })).toBe('meeting')
  })

  it('shows only my things, or the people picked together with the team', () => {
    const teams = [{ id: 5, name: 'Science', memberIds: [3, 4] }]
    expect(filterPeople(defaultCalendarFilter(), 1, teams)).toBeNull()
    expect([...filterPeople({ ...defaultCalendarFilter(), mine: true, personIds: [7] }, 1, teams)!]).toEqual([1])
    expect([...filterPeople({ ...defaultCalendarFilter(), personIds: [7], teamId: 5 }, 1, teams)!].sort()).toEqual([3, 4, 7])
    // A team that is gone shows nobody rather than everybody.
    expect([...filterPeople({ ...defaultCalendarFilter(), teamId: 99 }, 1, teams)!]).toEqual([])
  })

  it('shows a class to the teachers of its class (the assistant too), and only the kinds ticked', () => {
    const people = new Set([3])
    expect(scheduleShown(schedule(1), classrooms, defaultCalendarFilter(), people)).toBe(true)
    expect(scheduleShown(schedule(1), classrooms, defaultCalendarFilter(), new Set([2]))).toBe(false)
    expect(scheduleShown(schedule(1), classrooms, { ...defaultCalendarFilter(), kinds: ['trial'] }, null)).toBe(false)
  })

  it('shows a task to the person it is given to, and a school-wide event to everyone', () => {
    const filter = defaultCalendarFilter()
    const people = new Set([1])
    expect(itemShown({ kind: 'task', leadId: null, assigneeId: 1 }, filter, people)).toBe(true)
    expect(itemShown({ kind: 'task', leadId: null, assigneeId: 2 }, filter, people)).toBe(false)
    expect(itemShown({ kind: 'event', leadId: null, assigneeId: null }, filter, people)).toBe(true)
    expect(itemShown({ kind: 'task', leadId: 4, assigneeId: 1 }, { ...filter, kinds: ['task'] }, people)).toBe(false)
  })

  it('reads a saved filter, dropping what it does not know, and says when anything is narrowed', () => {
    const fallback = defaultCalendarFilter()
    expect(readCalendarFilter(null, fallback)).toBe(fallback)
    expect(readCalendarFilter('not json', fallback)).toBe(fallback)
    expect(readCalendarFilter(JSON.stringify({ mine: true, personIds: [2, 'x'], kinds: ['class', 'party'] }), fallback)).toEqual({
      mine: true,
      teamId: null,
      personIds: [2],
      kinds: ['class'],
    })
    expect(isFiltered(defaultCalendarFilter())).toBe(false)
    expect(isFiltered({ ...defaultCalendarFilter(), kinds: ALL_KINDS.slice(1) })).toBe(true)
  })
})

describe('the Timetable and the Planner', () => {
  it('gives the Timetable the classes and make-ups, and the Planner the rest', () => {
    expect(pageKinds('timetable', false)).toEqual(['class', 'makeup'])
    expect(pageKinds('timetable', true)).toEqual(['class', 'makeup'])
    expect(pageKinds('planner', false)).toEqual(['trial', 'task', 'meeting', 'event', 'follow_up'])
    expect(pageKinds('planner', true)).toEqual(ALL_KINDS)
  })

  it('cuts a saved filter down to the kinds the page has, and starts again when none is left', () => {
    const timetable = pageKinds('timetable', false)
    expect(pageFilter(defaultCalendarFilter(), timetable).kinds).toEqual(['class', 'makeup'])
    expect(pageFilter({ ...defaultCalendarFilter(), kinds: ['class', 'task'] }, timetable).kinds).toEqual(['class'])
    expect(pageFilter({ ...defaultCalendarFilter(), kinds: ['task'] }, timetable).kinds).toEqual(['class', 'makeup'])
    expect(pageFilter({ ...defaultCalendarFilter(), mine: true }, timetable).mine).toBe(true)
  })

  it('is not "filtered" just because the page has fewer kinds', () => {
    const timetable = pageKinds('timetable', false)
    expect(isFiltered(pageFilter(defaultCalendarFilter(), timetable), timetable)).toBe(false)
    expect(isFiltered({ ...defaultCalendarFilter(), kinds: ['class'] }, timetable)).toBe(true)
  })

  it('hides a task on the Timetable and a class on the Planner (until classes are switched on)', () => {
    const timetable = pageFilter(defaultCalendarFilter(), pageKinds('timetable', false))
    const planner = pageFilter(defaultCalendarFilter(), pageKinds('planner', false))
    const plannerWithClasses = pageFilter(defaultCalendarFilter(), pageKinds('planner', true))
    const task = { kind: 'task' as const, leadId: null, assigneeId: null }
    const followUp = { kind: 'task' as const, leadId: 5, assigneeId: null }
    expect(itemShown(task, timetable, null)).toBe(false)
    expect(itemShown(followUp, timetable, null)).toBe(false)
    expect(itemShown(task, planner, null)).toBe(true)
    expect(itemShown(followUp, planner, null)).toBe(true)
    expect(scheduleShown(schedule(1), new Map([[1, classroom(1)]]), timetable, null)).toBe(true)
    expect(scheduleShown(schedule(1), new Map([[1, classroom(1)]]), planner, null)).toBe(false)
    expect(scheduleShown(schedule(1), new Map([[1, classroom(1)]]), plannerWithClasses, null)).toBe(true)
  })

  it('adds the class kinds when "Show classes" goes on, and takes them away when it goes off', () => {
    const everything = defaultCalendarFilter()
    expect(kindsWithClasses(everything, pageKinds('planner', false), true)).toEqual(ALL_KINDS)
    const onlyTasks = { ...defaultCalendarFilter(), kinds: ['task' as const] }
    expect(kindsWithClasses(onlyTasks, pageKinds('planner', false), true)).toEqual(['task', 'class', 'makeup'])
    const withClasses = { ...defaultCalendarFilter(), kinds: ['task' as const, 'class' as const, 'makeup' as const] }
    expect(kindsWithClasses(withClasses, pageKinds('planner', true), false)).toEqual(['task'])
    expect(kindsWithClasses({ ...defaultCalendarFilter(), kinds: ['class' as const] }, pageKinds('planner', true), false)).toEqual(ALL_KINDS)
  })
})
