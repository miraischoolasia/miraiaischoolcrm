import { describe, expect, it } from 'vitest'
import { answerText, lessonBoard, readLiveQuestionSettings, secondsLeft, type LiveAnswer } from './liveQuestions'

function answer(studentId: number, points: number, result: LiveAnswer['result']): LiveAnswer {
  return {
    id: studentId * 10 + points,
    liveQuestionId: 1,
    studentId,
    answeredBy: 'student',
    text: null,
    choices: null,
    filePath: null,
    submittedAt: '2026-10-16T10:00:00Z',
    secondsTaken: 3,
    pointsIfCorrect: points,
    result,
    points: result === 'correct' ? points : 0,
    markedBy: 'auto',
    aiSuggestion: null,
    aiFeedback: null,
    aiNote: null,
    aiCheckedAt: null,
    feedback: null,
  }
}

describe('live questions', () => {
  it('counts down to the closing time and stops at zero', () => {
    const question = { status: 'live' as const, closesAt: '2026-10-16T10:01:00Z' }
    expect(secondsLeft(question, Date.parse('2026-10-16T10:00:30.2Z'))).toBe(30)
    expect(secondsLeft(question, Date.parse('2026-10-16T10:02:00Z'))).toBe(0)
    expect(secondsLeft({ ...question, status: 'closed' }, Date.parse('2026-10-16T10:00:00Z'))).toBe(0)
  })

  it('shows what was answered', () => {
    const choice = { kind: 'choice' as const, options: ['repeat 10', 'forever'] }
    expect(answerText({ text: null, choices: [1], filePath: null }, choice)).toBe('B. forever')
    expect(answerText({ text: 'my cat', choices: null, filePath: 'x' }, { kind: 'screenshot', options: [] })).toBe('Picture · my cat')
  })

  it('ranks the lesson, sharing places on equal points', () => {
    const board = lessonBoard([answer(1, 10, 'correct'), answer(2, 10, 'correct'), answer(3, 10, 'wrong'), answer(1, 5, 'correct')])
    expect(board.map((row) => [row.studentId, row.points, row.place])).toEqual([
      [1, 15, 1],
      [2, 10, 2],
      [3, 0, 3],
    ])
    const tied = lessonBoard([answer(1, 10, 'correct'), answer(2, 10, 'correct')])
    expect(tied.map((row) => row.place)).toEqual([1, 1])
  })

  it('reads the school settings with safe defaults', () => {
    expect(readLiveQuestionSettings({ scoring: 'fixed', leaderboard_top: 0, ai_marking: false })).toEqual({
      scoring: 'fixed',
      leaderboardTop: 0,
      aiMarking: false,
    })
    expect(readLiveQuestionSettings(null)).toEqual({ scoring: 'speed', leaderboardTop: 3, aiMarking: true })
    expect(readLiveQuestionSettings({ leaderboard_top: 99 }).leaderboardTop).toBe(3)
  })
})
