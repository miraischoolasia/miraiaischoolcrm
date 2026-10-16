import type { ReviewMetric } from './reviewCriteria'

export const LESSONS_PER_STAGE = 4

export type PathwayReviewInput = {
  lessonDate: string
  revisionNumber: number
  isTrial: boolean
  // By criterion id.
  scores: Record<number, number | null>
  remarks: Record<number, string | null>
}

export type PathwayRemark = {
  metricLabel: string
  lessonDate: string
  text: string
}

export type PathwayStage = {
  // 'trial' is the trial class(es); 'regular' stages are numbered from 1.
  kind: 'trial' | 'regular'
  index: number
  label: string
  lessonCount: number
  startDate: string
  endDate: string
  // A regular stage with fewer than LESSONS_PER_STAGE reviewed lessons.
  inProgress: boolean
  // By criterion id, on the criterion's own scale.
  averages: Record<number, number | null>
  // Change against the previous stage (regular stages only; the first regular
  // stage compares to the trial when there is one).
  deltas: Record<number, number | null>
  remarks: PathwayRemark[]
}

const round1 = (value: number) => Number(value.toFixed(1))

function averageStage(
  entries: PathwayReviewInput[],
  metrics: ReviewMetric[],
): Record<number, number | null> {
  const result: Record<number, number | null> = {}
  for (const metric of metrics) {
    const values = entries
      .map((entry) => entry.scores[metric.id] ?? null)
      .filter((value): value is number => value !== null)
    result[metric.id] =
      values.length > 0
        ? round1(values.reduce((sum, value) => sum + value, 0) / values.length)
        : null
  }
  return result
}

function collectRemarks(entries: PathwayReviewInput[], metrics: ReviewMetric[]): PathwayRemark[] {
  const remarks: PathwayRemark[] = []
  for (const entry of entries) {
    for (const metric of metrics) {
      const text = entry.remarks[metric.id]?.trim()
      if (text) {
        remarks.push({ metricLabel: metric.label, lessonDate: entry.lessonDate, text })
      }
    }
  }
  return remarks
}

function buildStage(
  kind: PathwayStage['kind'],
  index: number,
  label: string,
  entries: PathwayReviewInput[],
  previous: PathwayStage | null,
  metrics: ReviewMetric[],
): PathwayStage {
  const averages = averageStage(entries, metrics)
  const deltas: Record<number, number | null> = {}
  for (const metric of metrics) {
    const now = averages[metric.id]
    const before = previous?.averages[metric.id] ?? null
    deltas[metric.id] =
      now !== null && before !== null ? round1(now - before) : null
  }

  return {
    kind,
    index,
    label,
    lessonCount: entries.length,
    startDate: entries[0].lessonDate,
    endDate: entries[entries.length - 1].lessonDate,
    inProgress: kind === 'regular' && entries.length < LESSONS_PER_STAGE,
    averages,
    deltas,
    remarks: collectRemarks(entries, metrics),
  }
}

/**
 * Groups a student's reviewed lessons into pathway stages: trial lessons form
 * their own "Trial" stage, then regular lessons are chunked every
 * LESSONS_PER_STAGE reviewed lessons in date order. Absent/leave lessons have
 * no review so they never take up a stage slot. Callers must pass the latest
 * revision of each lesson only.
 */
export function buildPathway(entries: PathwayReviewInput[], metrics: ReviewMetric[]): PathwayStage[] {
  const byDate = (left: PathwayReviewInput, right: PathwayReviewInput) =>
    `${left.lessonDate}-${String(left.revisionNumber).padStart(4, '0')}`.localeCompare(
      `${right.lessonDate}-${String(right.revisionNumber).padStart(4, '0')}`,
    )

  const trialEntries = entries.filter((entry) => entry.isTrial).sort(byDate)
  const regularEntries = entries.filter((entry) => !entry.isTrial).sort(byDate)

  const stages: PathwayStage[] = []

  if (trialEntries.length > 0) {
    stages.push(buildStage('trial', 0, 'Trial', trialEntries, null, metrics))
  }

  for (let start = 0; start < regularEntries.length; start += LESSONS_PER_STAGE) {
    const chunk = regularEntries.slice(start, start + LESSONS_PER_STAGE)
    const index = start / LESSONS_PER_STAGE + 1
    stages.push(
      buildStage(
        'regular',
        index,
        `Month ${index}`,
        chunk,
        stages[stages.length - 1] ?? null,
        metrics,
      ),
    )
  }

  return stages
}
