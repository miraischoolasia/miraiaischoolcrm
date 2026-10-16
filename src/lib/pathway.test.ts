import { describe, expect, it } from 'vitest'
import { buildPathway as buildPathwayWith, type PathwayReviewInput } from './pathway'
import { defaultReviewCriteria, getReviewMetrics } from './reviewCriteria'

// The five starting criteria: ids 1 (Logical) to 5 (Sustained Focus).
const metrics = getReviewMetrics(defaultReviewCriteria)
const LOGIC = 1
const CODING = 2
const FOCUS = 5
const buildPathway = (entries: PathwayReviewInput[]) => buildPathwayWith(entries, metrics)

const review = (
  lessonDate: string,
  score: number,
  overrides: Partial<PathwayReviewInput> = {},
): PathwayReviewInput => ({
  lessonDate,
  revisionNumber: 1,
  isTrial: false,
  scores: { 1: score, 2: score, 3: score, 4: score, 5: score },
  remarks: { 1: null, 2: null, 3: null, 4: null, 5: null },
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

    expect(first.averages[LOGIC]).toBe(2)
    expect(first.deltas[LOGIC]).toBeNull()
    expect(second.averages[LOGIC]).toBe(3.5)
    expect(second.deltas[LOGIC]).toBe(1.5)
  })

  it('keeps trial lessons in their own stage and compares Month 1 against it', () => {
    const stages = buildPathway([
      review('2026-08-25', 3, { isTrial: true }),
      review('2026-09-01', 4),
    ])

    expect(stages.map((stage) => stage.label)).toEqual(['Trial', 'Month 1'])
    expect(stages[0].kind).toBe('trial')
    expect(stages[0].inProgress).toBe(false)
    expect(stages[1].deltas[FOCUS]).toBe(1)
  })

  it('collects non-empty remarks with their metric and date', () => {
    const [stage] = buildPathway([
      review('2026-09-01', 2, {
        remarks: { 1: '  Struggled with loops ', 2: null, 3: '', 4: null, 5: null },
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
        scores: { 1: null, 2: 4, 3: 4, 4: 4, 5: 4 },
      }),
    ])

    expect(stage.averages[LOGIC]).toBeNull()
    expect(stage.averages[CODING]).toBe(4)
  })

  it("averages a school's own criterion on its own scale", () => {
    const teamwork = getReviewMetrics([
      { id: 9, name: 'Teamwork', description: null, maxScore: 3, remarkRequiredAtOrBelow: 1, sortOrder: 10, isActive: true, legacyKey: null },
    ])
    const [stage] = buildPathwayWith(
      [
        { lessonDate: '2026-09-01', revisionNumber: 1, isTrial: false, scores: { 9: 3 }, remarks: { 9: null } },
        { lessonDate: '2026-09-08', revisionNumber: 1, isTrial: false, scores: { 9: 2 }, remarks: { 9: 'Shy' } },
      ],
      teamwork,
    )

    expect(stage.averages).toEqual({ 9: 2.5 })
    expect(stage.remarks).toEqual([{ metricLabel: 'Teamwork', lessonDate: '2026-09-08', text: 'Shy' }])
  })
})
