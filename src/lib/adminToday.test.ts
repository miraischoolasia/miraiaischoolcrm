import { describe, expect, it } from 'vitest'
import { countUntouchedLeads, getLeadTasksDue, pickFollowUpStudents, summariseAttendance } from './adminToday'
import type { StudentRow } from './studentRows'
import type { AgendaItem, TeacherAgenda } from './teacherAgenda'
import type { Lead } from '../types/domain'

const today = '2026-10-13'

function item(overrides: Partial<AgendaItem>): AgendaItem {
  return {
    key: 'k', scheduleId: 1, teacherId: 9, date: today, title: 'TUE C001', subtitle: '', classroomId: 1, kind: 'regular',
    startTime: '16:00', endTime: '17:30', makeupMinutes: 0, isMakeupOnly: false, studentCount: 4, log: null,
    editableUntil: null, state: 'open', minutes: 90, ...overrides,
  }
}

function lead(overrides: Partial<Lead>): Lead {
  return {
    id: 1, fullName: 'Aisha', phone: '60123456789', sourceId: null, picId: null, state: null, tagIds: [],
    checks: {}, status: 'new', children: [], notes: null, followUps: [], tasks: [], convertedStudentId: null,
    addedDate: '2026-10-01', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...overrides,
  } as Lead
}

describe('summariseAttendance', () => {
  it('counts today and groups the missing attendance by teacher, the most owed first', () => {
    const agenda: TeacherAgenda = {
      today: [item({ key: 'a', state: 'submitted' }), item({ key: 'b', state: 'open' })],
      todo: [
        item({ key: 'c', teacherId: 3, date: '2026-10-08', state: 'missing' }),
        item({ key: 'd', teacherId: 9, date: '2026-10-06', state: 'missing' }),
        item({ key: 'e', teacherId: 9, date: '2026-10-10', state: 'missing' }),
      ],
      upcoming: [],
      week: { classes: 0, hours: 0 },
    }

    const overview = summariseAttendance(agenda)

    expect(overview.submittedToday).toBe(1)
    expect(overview.openToday).toBe(1)
    expect(overview.missingTotal).toBe(3)
    expect(overview.missingByTeacher).toEqual([
      { teacherId: 9, count: 2, oldest: '2026-10-06' },
      { teacherId: 3, count: 1, oldest: '2026-10-08' },
    ])
  })
})

describe('pickFollowUpStudents', () => {
  function row(id: number, issues: StudentRow['issues'], rank: number, needsFollowUp = true): StudentRow {
    return { student: { id, name: `Kid ${id}` }, issues, rank, needsFollowUp } as unknown as StudentRow
  }

  it('keeps only the students who need action, urgent first, and says why', () => {
    const picked = pickFollowUpStudents([
      row(1, [], 10, false),
      row(2, [{ label: 'Classes low', tone: 'warning', severity: 2 }], 2),
      row(3, [{ label: 'Package ended', tone: 'critical', severity: 1 }], 1),
    ])

    expect(picked.total).toBe(2)
    expect(picked.critical).toBe(1)
    expect(picked.all.map((entry) => [entry.row.student.id, entry.reason, entry.critical])).toEqual([
      [3, 'Package ended', true],
      [2, 'Classes low', false],
    ])
  })
})

describe('getLeadTasksDue', () => {
  it('lists open tasks due today or late, the late ones first, and skips closed leads', () => {
    const rows = getLeadTasksDue(
      [
        lead({
          id: 1,
          tasks: [
            { id: 'a', title: 'Call back', dueDate: today, completed: false },
            { id: 'b', title: 'Done already', dueDate: '2026-10-01', completed: true },
            { id: 'c', title: 'Next week', dueDate: '2026-10-20', completed: false },
          ],
        }),
        lead({ id: 2, fullName: null, children: [{ name: 'Ben', age: 8, phone: null }], tasks: [{ id: 'd', title: 'Send invoice', dueDate: '2026-10-09', completed: false }] }),
        lead({ id: 3, status: 'lost', tasks: [{ id: 'e', title: 'Old', dueDate: '2026-09-01', completed: false }] }),
      ],
      today,
    )

    expect(rows.map((task) => [task.leadId, task.leadName, task.title, task.overdue])).toEqual([
      [2, 'Ben', 'Send invoice', true],
      [1, 'Aisha', 'Call back', false],
    ])
  })
})

describe('countUntouchedLeads', () => {
  it('counts new leads nobody has followed up', () => {
    expect(
      countUntouchedLeads([
        lead({ id: 1 }),
        lead({ id: 2, followUps: [{ date: today, note: 'Called' }] }),
        lead({ id: 3, status: 'contacted' }),
      ]),
    ).toBe(1)
  })
})
