import { describe, expect, it } from 'vitest'
import { buildAttendanceSubmission } from './attendance'
import type { AttendanceReviewFormState } from '../types/domain'

const fullReview = (overrides: Partial<AttendanceReviewFormState> = {}): AttendanceReviewFormState => ({
  logicalThinkingScore: 4,
  logicalThinkingRemark: '',
  codingCreativityScore: 4,
  codingCreativityRemark: '',
  problemSolvingScore: 4,
  problemSolvingRemark: '',
  expressivenessScore: 4,
  expressivenessRemark: '',
  sustainedFocusScore: 4,
  sustainedFocusRemark: '',
  ...overrides,
})

describe('buildAttendanceSubmission', () => {
  it('builds present/absent/leave status payload for the whole roster', () => {
    const result = buildAttendanceSubmission(
      [1, 2, 3],
      { 1: 'present', 2: 'absent', 3: 'leave' },
      { 1: fullReview() },
      new Map(),
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
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reviewPayload).toHaveLength(1)
    expect(result.reviewPayload[0].student_id).toBe(1)
  })

  it('defaults an unset status to present', () => {
    const result = buildAttendanceSubmission(
      [1],
      {},
      { 1: fullReview() },
      new Map(),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload).toEqual([{ student_id: 1, status: 'present' }])
  })

  it('rejects submission when a present student is missing any metric score', () => {
    const result = buildAttendanceSubmission(
      [1],
      { 1: 'present' },
      { 1: fullReview({ codingCreativityScore: null }) },
      new Map(),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('Coding Creativity')
  })

  it('rejects a low score (<=2) with no remark, naming the student', () => {
    const result = buildAttendanceSubmission(
      [42],
      { 42: 'present' },
      { 42: fullReview({ problemSolvingScore: 2, problemSolvingRemark: '   ' }) },
      new Map([[42, 'Ethan Lim']]),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe(
      'Ethan Lim: Problem Solving requires a remark when the score is 1 or 2.',
    )
  })

  it('falls back to a generic label when the student name is unknown', () => {
    const result = buildAttendanceSubmission(
      [42],
      { 42: 'present' },
      { 42: fullReview({ problemSolvingScore: 1, problemSolvingRemark: '' }) },
      new Map(),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('this student:')
  })

  it('accepts a low score once a non-empty remark is provided', () => {
    const result = buildAttendanceSubmission(
      [1],
      { 1: 'present' },
      { 1: fullReview({ sustainedFocusScore: 1, sustainedFocusRemark: 'Lost focus after break.' }) },
      new Map(),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reviewPayload[0].sustainedFocusScore).toBe(1)
    expect(result.reviewPayload[0].sustainedFocusRemark).toBe('Lost focus after break.')
  })

  it('does not require a review at all for a non-present student', () => {
    const result = buildAttendanceSubmission(
      [1],
      { 1: 'absent' },
      {},
      new Map(),
    )

    expect(result.ok).toBe(true)
  })

  it('trims whitespace-only remarks to null in the payload', () => {
    const result = buildAttendanceSubmission(
      [1],
      { 1: 'present' },
      { 1: fullReview({ logicalThinkingRemark: '   ' }) },
      new Map(),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reviewPayload[0].logicalThinkingRemark).toBeNull()
  })
})
