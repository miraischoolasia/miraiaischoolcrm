import { describe, expect, it } from 'vitest'
import type { LiveAnswer, LiveQuestion } from './liveQuestions'
import {
  careList,
  hardestQuestion,
  lessonSummary,
  lessonTotals,
  participationCurve,
  participationTone,
  questionDiagnosis,
  type LessonRecord,
} from './classEndReport'

const FROM = '2026-10-20T11:00:00.000Z'
const TO = '2026-10-20T12:00:00.000Z'
const at = (minute: number) => new Date(Date.parse(FROM) + minute * 60000).toISOString()

function record(id: number, extra: Partial<LessonRecord> = {}): LessonRecord {
  return {
    sessionId: 1,
    status: 'ended',
    lessonFrom: FROM,
    lessonTo: TO,
    studentId: id,
    studentName: `Child ${id}`,
    studentCode: null,
    attendanceStatus: null,
    hasZoom: true,
    zoomMinutes: 60,
    lessonMinutes: 60,
    participationPercent: 100,
    onlineSpans: [{ from: FROM, to: TO }],
    leftPeriods: [],
    lateMinutes: 0,
    leftEarlyMinutes: 0,
    questionsTotal: 2,
    answered: 2,
    correct: 2,
    wrong: 0,
    pending: 0,
    points: 10,
    pickedCount: 0,
    isSilent: false,
    ...extra,
  }
}

function question(id: number, number: number, kind: LiveQuestion['kind'] = 'choice'): LiveQuestion {
  return {
    id,
    sessionId: 1,
    questionId: null,
    number,
    kind,
    prompt: `Q${number}`,
    options: ['Merah', 'Biru', 'Hijau'],
    points: 5,
    timeLimitSeconds: 30,
    scoring: 'fixed',
    status: 'closed',
    openedAt: FROM,
    closesAt: FROM,
    revealedAt: FROM,
  }
}

function answer(questionId: number, studentId: number, result: LiveAnswer['result'], choices: number[] | null, seconds: number): LiveAnswer {
  return {
    id: questionId * 100 + studentId,
    liveQuestionId: questionId,
    studentId,
    answeredBy: 'student',
    text: null,
    choices,
    filePath: null,
    submittedAt: FROM,
    secondsTaken: seconds,
    pointsIfCorrect: 5,
    result,
    points: result === 'correct' ? 5 : 0,
    markedBy: 'auto',
    aiSuggestion: null,
    aiFeedback: null,
    aiNote: null,
    aiCheckedAt: null,
    feedback: null,
  }
}

describe('class end report', () => {
  it('colours time in the lesson: red under 40, amber to 80, teal above', () => {
    expect([39, 40, 79, 80, 100].map(participationTone)).toEqual(['red', 'amber', 'amber', 'teal', 'teal'])
    expect(participationTone(null)).toBe('none')
  })

  it('finds the wrong answer most children chose (choice questions only)', () => {
    const questions = [question(1, 1), question(2, 2, 'fill')]
    const answers = [
      answer(1, 1, 'correct', [1], 4),
      answer(1, 2, 'wrong', [0], 8),
      answer(1, 3, 'wrong', [2], 6),
      answer(1, 4, 'wrong', [2], 10),
      answer(2, 1, 'wrong', null, 20),
      answer(2, 2, 'pending', null, 30),
    ]
    const [choice, fill] = questionDiagnosis(questions, answers, new Map([[1, [1]]]))
    expect(choice).toMatchObject({ answered: 4, right: 1, wrong: 3, rightPercent: 25, averageSeconds: 7, commonWrong: { option: 2, label: 'Hijau', count: 2 } })
    expect(fill).toMatchObject({ answered: 2, toMark: 1, rightPercent: 0, commonWrong: null })
    expect(hardestQuestion([choice, fill])?.number).toBe(2)
  })

  it('counts children online every 5 minutes and marks where most left', () => {
    const records = [
      record(1),
      record(2, { onlineSpans: [{ from: FROM, to: at(32) }] }),
      record(3, { onlineSpans: [{ from: FROM, to: at(32) }] }),
      record(4, { onlineSpans: [{ from: at(10), to: TO }] }),
    ]
    const { points, drops } = participationCurve(records)
    expect(points).toHaveLength(13)
    expect(points[0].online).toBe(3)
    expect(points[2].online).toBe(4)
    expect(points[7].online).toBe(2)
    expect(points[12].online).toBe(2)
    expect(drops).toEqual([{ at: at(35), lost: 2 }])
  })

  it('lists who needs the teacher with every reason, most serious first', () => {
    const records = [
      record(1, { studentName: 'Ana' }),
      record(2, { studentName: 'Ben', zoomMinutes: 0, participationPercent: 0, onlineSpans: [] }),
      record(3, { studentName: 'Cai', lateMinutes: 8, leftPeriods: [{ kind: 'late', from: FROM, to: at(8) }, { kind: 'away', from: at(20), to: at(32) }] }),
      record(4, { studentName: 'Dee', answered: 0, correct: 0, isSilent: true }),
      record(5, { studentName: 'Eve', correct: 0, wrong: 2, leftEarlyMinutes: 23 }),
    ]
    const list = careList(records)
    expect(list.map((entry) => entry.name)).toEqual(['Ben', 'Eve', 'Dee', 'Cai'])
    expect(list[1].reasons.map((reason) => reason.kind)).toEqual(['early', 'few_right'])
    expect(list[3].reasons).toEqual([
      { kind: 'late', minutes: 8 },
      { kind: 'away', from: at(20), to: at(32), minutes: 12 },
    ])
  })

  it('writes the top sentence from the numbers', () => {
    const records = [record(1), record(2, { zoomMinutes: 0, onlineSpans: [] })]
    const diagnosis = questionDiagnosis([question(1, 1)], [answer(1, 1, 'correct', [1], 4), answer(1, 2, 'wrong', [0], 8)], new Map([[1, [1]]]))
    const totals = lessonTotals(records, diagnosis)
    expect(totals).toMatchObject({ roster: 2, came: 1, absent: 1, rightPercent: 50, marked: 2 })
    expect(lessonSummary(totals, hardestQuestion(diagnosis))).toEqual({
      lead: 'An OK lesson: 1 of 2 came and 50% of answers were right.',
      hard: ' Question 1 was hard (50% right).',
    })
  })
})
