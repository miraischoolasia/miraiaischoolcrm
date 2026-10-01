import { describe, expect, it } from 'vitest'
import { buildPathway, type PathwayReviewInput } from './pathway'

const review = (
  lessonDate: string,
  score: number,
  overrides: Partial<PathwayReviewInput> = {},
): PathwayReviewInput => ({
  lessonDate,
  revisionNumber: 1,
  isTrial: false,
  scores: {
    logicalThinkingScore: score,
    codingCreativityScore: score,
    problemSolvingScore: score,
    expressivenessScore: score,
    sustainedFocusScore: score,
  },
  remarks: {
    logicalThinkingRemark: null,
    codingCreativityRemark: null,
    problemSolvingRemark: null,
    expressivenessRemark: null,
    sustainedFocusRemark: null,
  },
  ...overrides,
})

describe('buildPathway', () => {
  it('returns no stages when there are no reviews', () => {
    expect(buildPathway([])).toEqual([])
  })

  it('groups regular lessons into stages of 4 in date order', () => {
    const entries = [
      review('2026-09-08', 2),
      review('2026-09-01', 2),
      review('2026-09-15', 2),
      review('2026-09-22', 2),
      review('2026-09-29', 4),
      review('2026-10-06', 4),
    ]
    const stages = buildPathway(entries)

    expect(stages.map((stage) => [stage.label, stage.lessonCount])).toEqual([
      ['Month 1', 4],
      ['Month 2', 2],
    ])
    expect(stages[0].startDate).toBe('2026-09-01')
    expect(stages[0].inProgress).toBe(false)
    expect(stages[1].inProgress).toBe(true)
  })

  it('averages each metric and reports the change vs the previous stage', () => {
    const entries = [
      review('2026-09-01', 2),
      review('2026-09-08', 2),
      review('2026-09-15', 2),
      review('2026-09-22', 2),
      review('2026-09-29', 4),
      review('2026-10-06', 3),
      review('2026-10-13', 3),
      review('2026-10-20', 4),
    ]
    const [first, second] = buildPathway(entries)

    expect(first.averages.logicalThinkingScore).toBe(2)
    expect(first.deltas.logicalThinkingScore).toBeNull()
    expect(second.averages.logicalThinkingScore).toBe(3.5)
    expect(second.deltas.logicalThinkingScore).toBe(1.5)
  })

  it('keeps trial lessons in their own stage and compares Month 1 against it', () => {
    const stages = buildPathway([
      review('2026-08-25', 3, { isTrial: true }),
      review('2026-09-01', 4),
    ])

    expect(stages.map((stage) => stage.label)).toEqual(['Trial', 'Month 1'])
    expect(stages[0].kind).toBe('trial')
    expect(stages[0].inProgress).toBe(false)
    expect(stages[1].deltas.sustainedFocusScore).toBe(1)
  })

  it('collects non-empty remarks with their metric and date', () => {
    const [stage] = buildPathway([
      review('2026-09-01', 2, {
        remarks: {
          logicalThinkingRemark: '  Struggled with loops ',
          codingCreativityRemark: null,
          problemSolvingRemark: '',
          expressivenessRemark: null,
          sustainedFocusRemark: null,
        },
      }),
    ])

    expect(stage.remarks).toEqual([
      {
        metricLabel: 'Logical & Algorithmic Thinking',
        lessonDate: '2026-09-01',
        text: 'Struggled with loops',
      },
    ])
  })

  it('ignores null scores when averaging', () => {
    const [stage] = buildPathway([
      review('2026-09-01', 4, {
        scores: {
          logicalThinkingScore: null,
          codingCreativityScore: 4,
          problemSolvingScore: 4,
          expressivenessScore: 4,
          sustainedFocusScore: 4,
        },
      }),
    ])

    expect(stage.averages.logicalThinkingScore).toBeNull()
    expect(stage.averages.codingCreativityScore).toBe(4)
  })
})
