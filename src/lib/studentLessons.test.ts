import { describe, expect, it } from 'vitest'
import { buildStudentLessons } from './studentLessons'
import type { LessonLogStudentReview, LessonLogSummary } from '../types/domain'

function log(id: number, lessonDate: string, revisionNumber = 1, scheduleId = 1): LessonLogSummary {
  return { id, scheduleId, teacherId: 1, lessonDate, lessonRemark: null, submittedAt: '', revisionNumber, parentLogId: null }
}

function review(lessonLogId: number, studentId: number, score: number | null): LessonLogStudentReview {
  return {
    id: lessonLogId * 10 + studentId, lessonLogId, studentId,
    logicalThinkingScore: score, logicalThinkingRemark: null, codingCreativityScore: score, codingCreativityRemark: null,
    problemSolvingScore: score, problemSolvingRemark: null, expressivenessScore: score, expressivenessRemark: null,
    sustainedFocusScore: score, sustainedFocusRemark: null,
  } as LessonLogStudentReview
}

const base = { studentId: 1, studentIsTrial: false, trialStudentIds: [], schedules: [] }

describe('buildStudentLessons', () => {
  it('lists present, absent and leave lessons newest first, with the review average', () => {
    const lessons = buildStudentLessons({
      ...base,
      lessonLogs: [log(1, '2026-10-01'), log(2, '2026-10-08'), log(3, '2026-10-15')],
      lessonReviews: [review(1, 1, 4), review(3, 1, 2)],
      attendance: [
        { lessonLogId: 1, status: 'present' },
        { lessonLogId: 2, status: 'absent' },
        { lessonLogId: 3, status: 'present' },
      ],
    })

    expect(lessons.map((lesson) => [lesson.log.lessonDate, lesson.status, lesson.average])).toEqual([
      ['2026-10-15', 'present', 2],
      ['2026-10-08', 'absent', null],
      ['2026-10-01', 'present', 4],
    ])
  })

  it('uses only the latest revision of a lesson', () => {
    const lessons = buildStudentLessons({
      ...base,
      lessonLogs: [log(1, '2026-10-01', 1), log(2, '2026-10-01', 2)],
      lessonReviews: [review(1, 1, 1), review(2, 1, 5)],
      attendance: [
        { lessonLogId: 1, status: 'present' },
        { lessonLogId: 2, status: 'present' },
      ],
    })

    expect(lessons).toHaveLength(1)
    expect(lessons[0].average).toBe(5)
  })

  it('counts a review with no attendance row as present, and skips a lesson with neither', () => {
    const lessons = buildStudentLessons({
      ...base,
      trialStudentIds: [9],
      lessonLogs: [log(1, '2026-10-01'), log(2, '2026-10-08')],
      lessonReviews: [review(1, 9, 3)],
      attendance: [],
    })

    expect(lessons).toHaveLength(1)
    expect(lessons[0]).toMatchObject({ status: 'present', isTrial: true })
  })
})
