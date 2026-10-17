import { describe, expect, it } from 'vitest'
import { buildLessonReport } from './lessonReport'
import type { LiveAnswer, LiveQuestion } from './liveQuestions'

const question = (id: number, number: number): LiveQuestion => ({
  id,
  sessionId: 1,
  questionId: null,
  number,
  kind: 'choice',
  prompt: `Q ${number}`,
  options: ['a', 'b'],
  points: 10,
  timeLimitSeconds: 30,
  scoring: 'fixed',
  status: 'closed',
  openedAt: '2026-10-21T12:35:00Z',
  closesAt: '2026-10-21T12:35:30Z',
  revealedAt: null,
})

const answer = (id: number, liveQuestionId: number, studentId: number, result: LiveAnswer['result'], secondsTaken: number): LiveAnswer => ({
  id,
  liveQuestionId,
  studentId,
  answeredBy: 'student',
  text: null,
  choices: [0],
  filePath: null,
  submittedAt: '2026-10-21T12:35:10Z',
  secondsTaken,
  pointsIfCorrect: 10,
  result,
  points: result === 'correct' ? 10 : 0,
  markedBy: 'auto',
  aiSuggestion: null,
  aiFeedback: null,
  aiNote: null,
  aiCheckedAt: null,
  feedback: null,
})

describe('buildLessonReport', () => {
  it('sums up each question and each child', () => {
    const report = buildLessonReport({
      questions: [question(11, 2), question(10, 1)],
      answers: [answer(1, 10, 1, 'correct', 4), answer(2, 10, 2, 'wrong', 8), answer(3, 11, 1, 'pending', 20)],
      minutes: [
        { studentId: 1, minutes: 55, countsAsPresent: true },
        { studentId: 2, minutes: 20, countsAsPresent: false },
      ],
      room: {
        roster: [
          { studentId: 1, name: 'Ali' },
          { studentId: 2, name: 'Bea' },
          { studentId: 3, name: 'Cai' },
        ],
        startsAt: '2026-10-21T12:30:00Z',
        rules: { lateMinutes: 5, dropGraceSeconds: 0 },
        waiting: [],
        stays: [
          { id: 1, studentId: 1, userName: 'Ali', joinedAt: '2026-10-21T12:29:00Z', leftAt: null, dropped: false, isHost: false, strangerCleared: false },
          { id: 2, studentId: 2, userName: 'Bea', joinedAt: '2026-10-21T12:45:00Z', leftAt: '2026-10-21T13:05:00Z', dropped: true, isHost: false, strangerCleared: false },
        ],
      },
    })
    expect(report.questions.map((row) => [row.number, row.answered, row.rightPercent, row.toMark, row.averageSeconds])).toEqual([
      [1, 2, 50, 0, 6],
      [2, 1, null, 1, 20],
    ])
    expect(report.inZoom).toBe(2)
    expect(report.rosterSize).toBe(3)
    expect(report.rightPercent).toBe(50)
    expect(report.children.map((child) => [child.name, child.points, child.place, child.late, child.droppedOut, child.zoomMinutes])).toEqual([
      ['Ali', 10, 1, false, false, 55],
      ['Bea', 0, 2, true, true, 20],
      ['Cai', 0, null, false, false, null],
    ])
    expect(report.children[0].answers.map((row) => row.number)).toEqual([1, 2])
  })
})
