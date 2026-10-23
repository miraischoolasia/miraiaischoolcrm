import { describe, expect, it } from 'vitest'
import {
  DEFAULT_QUALITY_SETTINGS,
  monthBounds,
  readQualitySettings,
  retentionByTeacher,
  retentionFor,
  scoreTeachers,
  shiftMonth,
  type QualityLesson,
  type QualityPeriod,
} from './classQuality'

const lesson = (extra: Partial<QualityLesson>): QualityLesson => ({
  sessionId: 1,
  lessonDate: '2026-10-20',
  status: 'ended',
  startsAt: '2026-10-20T11:00:00Z',
  endsAt: '2026-10-20T12:15:00Z',
  classroomId: 1,
  classroomName: 'F1 Math',
  teacherId: 2,
  substitute: false,
  hasZoom: true,
  marked: 0,
  attended: 0,
  participationSum: 0,
  participationCount: 0,
  correct: 0,
  wrong: 0,
  questions: 0,
  teacherJoinedAt: null,
  startedOnTime: null,
  recordingAt: null,
  recordingOnTime: null,
  attendanceSentAt: null,
  attendanceOnTime: null,
  presentLogged: 0,
  commented: 0,
  ...extra,
})

const NOW = Date.parse('2026-10-23T00:00:00Z')

describe('the scorecard', () => {
  it('adds up each teacher’s lessons', () => {
    const [score] = scoreTeachers(
      [
        lesson({ sessionId: 1, marked: 10, attended: 8, participationSum: 170, participationCount: 2, correct: 6, wrong: 4, startedOnTime: true, recordingOnTime: true, attendanceOnTime: true, presentLogged: 8, commented: 8 }),
        lesson({ sessionId: 2, marked: 10, attended: 6, participationSum: 60, participationCount: 1, correct: 2, wrong: 8, startedOnTime: false, recordingOnTime: false, attendanceOnTime: true, presentLogged: 6, commented: 3 }),
      ],
      NOW,
    )
    expect(score).toMatchObject({
      teacherId: 2,
      lessons: 2,
      attendance: { part: 14, whole: 20, percent: 70 },
      participation: { percent: 77 },
      right: { part: 8, whole: 20, percent: 40 },
      onTime: { part: 1, whole: 2, percent: 50 },
      recording: { part: 1, whole: 2, percent: 50 },
      feedback: { part: 2, whole: 2, percent: 100 },
      comments: { part: 11, whole: 14, percent: 79 },
    })
  })

  it('counts a substitute’s lesson for the substitute, and leaves out lessons not over yet', () => {
    const scores = scoreTeachers(
      [
        lesson({ sessionId: 1, teacherId: 3, substitute: true }),
        lesson({ sessionId: 2, status: 'live', endsAt: '2026-10-24T12:00:00Z' }),
      ],
      NOW,
    )
    expect(scores.map((score) => [score.teacherId, score.lessons])).toEqual([[3, 1]])
  })

  it('shows no % where there is nothing to count (no Zoom, no answers)', () => {
    const [score] = scoreTeachers([lesson({ hasZoom: false })], NOW)
    expect(score.right.percent).toBeNull()
    expect(score.onTime.percent).toBeNull()
    expect(score.participation.percent).toBeNull()
  })
})

const stay = (extra: Partial<QualityPeriod>): QualityPeriod => ({
  periodId: 1,
  studentId: 1,
  studentName: 'Aiden',
  studentCode: null,
  classroomId: 1,
  classroomName: 'F1 Math',
  teacherId: 2,
  startDate: '2026-08-01',
  endDate: null,
  ...extra,
})

describe('retention (the roster table’s rule)', () => {
  it('counts who was there, who stopped and who was added in the month', () => {
    const month = retentionFor(
      [
        stay({ periodId: 1 }),
        stay({ periodId: 2, studentId: 2, endDate: '2026-10-15' }),
        stay({ periodId: 3, studentId: 3, startDate: '2026-10-05' }),
        stay({ periodId: 4, studentId: 4, endDate: '2026-09-20' }),
      ],
      '2026-10-01',
      null,
    )
    expect(month).toMatchObject({ atStart: 2, stayed: 2, rate: 67 })
    expect(month.stopped.map((period) => period.studentId)).toEqual([2])
    expect(month.added.map((period) => period.studentId)).toEqual([3])
  })

  it('a class change is one stopped (old teacher) and one added (new teacher)', () => {
    const periods = [
      stay({ periodId: 1, teacherId: 2, endDate: '2026-10-10' }),
      stay({ periodId: 2, teacherId: 3, classroomId: 2, startDate: '2026-10-10' }),
    ]
    const byTeacher = retentionByTeacher(periods, ['2026-10-01'], null)
    expect(byTeacher.get(2)?.[0]).toMatchObject({ atStart: 1, stayed: 0, rate: 0 })
    expect(byTeacher.get(3)?.[0]).toMatchObject({ atStart: 0, stayed: 1, rate: 100 })
  })

  it('does not count changes before the roster’s start day (EduHero’s import)', () => {
    const month = retentionFor([stay({ startDate: '2026-10-21' }), stay({ periodId: 2, endDate: '2026-10-20' })], '2026-10-01', '2026-10-21')
    expect(month.added).toHaveLength(1)
    expect(month.stopped).toHaveLength(0)
  })
})

describe('months and settings', () => {
  it('works out month edges', () => {
    expect(monthBounds('2026-02-01')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01')
    expect(shiftMonth('2026-10-01', 2)).toBe('2026-12-01')
  })

  it('reads the settings, with the defaults for anything missing or odd', () => {
    const settings = readQualitySettings({ low_score_percent: 40, alerts: { first_place: false }, red: { right: 30 }, card_text: '' })
    expect(settings.low_score_percent).toBe(40)
    expect(settings.alerts.first_place).toBe(false)
    expect(settings.alerts.low_score).toBe(true)
    expect(settings.red).toMatchObject({ right: 30, attendance: 80 })
    expect(settings.card_text).toBe(DEFAULT_QUALITY_SETTINGS.card_text)
    expect(readQualitySettings(null)).toEqual(DEFAULT_QUALITY_SETTINGS)
  })
})
