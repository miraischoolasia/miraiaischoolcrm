import { describe, expect, it } from 'vitest'
import { buildAttendanceSubmission, countRatedMetrics, getReviewProgress, isReviewComplete } from './attendance'
import { defaultReviewCriteria, getReviewMetrics } from './reviewCriteria'
import type { AttendanceReviewFormState } from '../types/domain'

// The five starting criteria: ids 1-5.
const metrics = getReviewMetrics(defaultReviewCriteria)
const LOGIC = 1
const CODING = 2
const PROBLEM = 3
const FOCUS = 5

// Every criterion rated 4, then the given changes: a score, or [score, remark].
const fullReview = (
  changes: Record<number, number | null | [number, string]> = {},
  lessonRemark = '',
): AttendanceReviewFormState => {
  const form: AttendanceReviewFormState = { scores: {}, remarks: {}, lessonRemark }
  for (const metric of metrics) {
    form.scores[metric.id] = 4
    form.remarks[metric.id] = ''
  }
  for (const [id, change] of Object.entries(changes)) {
    if (Array.isArray(change)) {
      form.scores[Number(id)] = change[0]
      form.remarks[Number(id)] = change[1]
    } else {
      form.scores[Number(id)] = change
    }
  }
  return form
}

describe('buildAttendanceSubmission', () => {
  it('builds present/absent/leave status payload for the whole roster', () => {
    const result = buildAttendanceSubmission(
      [1, 2, 3],
      { 1: 'present', 2: 'absent', 3: 'leave' },
      { 1: fullReview() },
      new Map(),
      metrics,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload).toEqual([
      { student_id: 1, status: 'present' },
      { student_id: 2, status: 'absent' },
      { student_id: 3, status: 'leave' },
    ])
  })

  it('only includes review payload entries for present students', () => {
    const result = buildAttendanceSubmission(
      [1, 2],
      { 1: 'present', 2: 'absent' },
      { 1: fullReview() },
      new Map(),
      metrics,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reviewPayload).toHaveLength(1)
    expect(result.reviewPayload[0].student_id).toBe(1)
  })

  it('sends one score per criterion, in order', () => {
    const result = buildAttendanceSubmission([1], {}, { 1: fullReview({ [LOGIC]: 5 }) }, new Map(), metrics)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reviewPayload[0].scores).toEqual([
      { criterion_id: 1, score: 5, remark: null },
      { criterion_id: 2, score: 4, remark: null },
      { criterion_id: 3, score: 4, remark: null },
      { criterion_id: 4, score: 4, remark: null },
      { criterion_id: 5, score: 4, remark: null },
    ])
  })

  it('defaults an unset status to present', () => {
    const result = buildAttendanceSubmission([1], {}, { 1: fullReview() }, new Map(), metrics)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload).toEqual([{ student_id: 1, status: 'present' }])
  })

  it('rejects submission when a present student is missing any criterion score', () => {
    const result = buildAttendanceSubmission(
      [1],
      { 1: 'present' },
      { 1: fullReview({ [CODING]: null }) },
      new Map(),
      metrics,
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('Coding Creativity')
  })

  it('rejects a low score (<=2) with no remark, naming the student', () => {
    const result = buildAttendanceSubmission(
      [42],
      { 42: 'present' },
      { 42: fullReview({ [PROBLEM]: [2, '   '] }) },
      new Map([[42, 'Ethan Lim']]),
      metrics,
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('Ethan Lim: Problem Solving requires a remark when the score is 1 or 2.')
  })

  it('falls back to a generic label when the student name is unknown', () => {
    const result = buildAttendanceSubmission(
      [42],
      { 42: 'present' },
      { 42: fullReview({ [PROBLEM]: [1, ''] }) },
      new Map(),
      metrics,
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('this student:')
  })

  it('accepts a low score once a non-empty remark is provided', () => {
    const result = buildAttendanceSubmission(
      [1],
      { 1: 'present' },
      { 1: fullReview({ [FOCUS]: [1, 'Lost focus after break.'] }) },
      new Map(),
      metrics,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reviewPayload[0].scores.find((entry) => entry.criterion_id === FOCUS)).toEqual({
      criterion_id: FOCUS,
      score: 1,
      remark: 'Lost focus after break.',
    })
  })

  it('does not require a review at all for a non-present student', () => {
    const result = buildAttendanceSubmission([1], { 1: 'absent' }, {}, new Map(), metrics)

    expect(result.ok).toBe(true)
  })

  it('trims whitespace-only remarks to null in the payload', () => {
    const result = buildAttendanceSubmission(
      [1],
      { 1: 'present' },
      { 1: fullReview({ [LOGIC]: [4, '   '] }) },
      new Map(),
      metrics,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reviewPayload[0].scores[0].remark).toBeNull()
  })

  it("sends each present student's own lesson remark, trimmed, or null when blank", () => {
    const result = buildAttendanceSubmission(
      [1, 2],
      { 1: 'present', 2: 'present' },
      {
        1: fullReview({}, '  Finished the maze game.  '),
        2: fullReview({}, '   '),
      },
      new Map(),
      metrics,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reviewPayload.map((review) => review.lessonRemark)).toEqual(['Finished the maze game.', null])
  })

  it("follows a school's own criterion: its top score and its remark threshold", () => {
    const teamwork = getReviewMetrics([
      {
        id: 9,
        name: 'Teamwork',
        description: null,
        maxScore: 3,
        remarkRequiredAtOrBelow: 1,
        sortOrder: 10,
        isActive: true,
        legacyKey: null,
      },
    ])
    const form = (score: number, remark = ''): AttendanceReviewFormState => ({
      scores: { 9: score },
      remarks: { 9: remark },
      lessonRemark: '',
    })

    expect(buildAttendanceSubmission([1], {}, { 1: form(2) }, new Map(), teamwork).ok).toBe(true)
    const low = buildAttendanceSubmission([1], {}, { 1: form(1) }, new Map([[1, 'Mia']]), teamwork)
    expect(low).toEqual({ ok: false, error: 'Mia: Teamwork requires a remark when the score is 1.' })
  })
})

describe('review progress', () => {
  it('needs every rating, and a remark for every low score', () => {
    expect(isReviewComplete(fullReview(), metrics)).toBe(true)
    expect(isReviewComplete(undefined, metrics)).toBe(false)
    expect(isReviewComplete(fullReview({ [FOCUS]: null }), metrics)).toBe(false)
    expect(isReviewComplete(fullReview({ [CODING]: 2 }), metrics)).toBe(false)
    expect(isReviewComplete(fullReview({ [CODING]: [2, '  '] }), metrics)).toBe(false)
    expect(isReviewComplete(fullReview({ [CODING]: [2, 'Needs help'] }), metrics)).toBe(true)
  })

  it('counts rated criteria', () => {
    expect(countRatedMetrics(undefined, metrics)).toBe(0)
    expect(countRatedMetrics(fullReview({ [PROBLEM]: null, 4: null }), metrics)).toBe(3)
  })

  it('tells who is done, who still needs a review, and who is away', () => {
    const progress = getReviewProgress(
      [1, 2, 3, 4],
      { 1: 'present', 2: 'present', 3: 'absent' },
      { 1: fullReview(), 2: fullReview({ [LOGIC]: null }) },
      metrics,
    )

    expect(progress.presentIds).toEqual([1, 2, 4])
    expect(progress.doneIds).toEqual([1])
    expect(progress.pendingIds).toEqual([2, 4])
    expect(progress.awayCount).toBe(1)
  })
})
