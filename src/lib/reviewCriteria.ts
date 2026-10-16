import type { ReviewCriterion } from '../types/domain'

// Colours for the charts, in criterion order. The first five are the ones the
// five original criteria always had.
export const reviewMetricPalette = [
  '#fc0c97',
  '#8b5cf6',
  '#0ea5e9',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#14b8a6',
  '#6366f1',
  '#84cc16',
  '#f97316',
]

// Short axis labels for the radar chart; a school's own criteria use their
// first word.
const legacyShortLabels: Record<string, string> = {
  logical_thinking: 'Logic',
  coding_creativity: 'Creative',
  problem_solving: 'Solve',
  expressiveness: 'Express',
  sustained_focus: 'Focus',
}

// What the charts, the attendance form and the reports need of a criterion.
export type ReviewMetric = {
  id: number
  label: string
  shortLabel: string
  color: string
  maxScore: number
  // A score at or below this needs a remark (0 = never).
  remarkRequiredAtOrBelow: number
}

// The five criteria every school starts with, used before the list has loaded
// and when Supabase is not configured. The ids are the ones the seeding
// migration gives them (first rows of review_criteria).
export const defaultReviewCriteria: ReviewCriterion[] = [
  ['Logical & Algorithmic Thinking', 'logical_thinking'],
  ['Coding Creativity', 'coding_creativity'],
  ['Problem Solving', 'problem_solving'],
  ['Expressiveness', 'expressiveness'],
  ['Sustained Focus', 'sustained_focus'],
].map(([name, legacyKey], index) => ({
  id: index + 1,
  name,
  description: null,
  maxScore: 5,
  remarkRequiredAtOrBelow: 2,
  sortOrder: (index + 1) * 10,
  isActive: true,
  legacyKey,
}))

function byOrder(left: ReviewCriterion, right: ReviewCriterion) {
  return left.sortOrder - right.sortOrder || left.id - right.id
}

function shortLabelFor(criterion: ReviewCriterion) {
  if (criterion.legacyKey && legacyShortLabels[criterion.legacyKey]) {
    return legacyShortLabels[criterion.legacyKey]
  }
  const firstWord = criterion.name.trim().split(/\s+/)[0] ?? criterion.name
  return firstWord.length > 10 ? `${firstWord.slice(0, 9)}…` : firstWord
}

// Criteria to show: every switched-on one, plus the switched-off ones that
// still hold scores in the given reviews or review forms (so history keeps
// its meaning). Only the keys of `scores` (criterion ids) are looked at.
export function getReviewMetrics(
  criteria: ReviewCriterion[],
  reviews: Array<{ scores: Record<number, unknown> }> = [],
): ReviewMetric[] {
  const used = new Set<number>()
  for (const review of reviews) {
    for (const [id, value] of Object.entries(review.scores)) {
      if (value !== null && value !== undefined) {
        used.add(Number(id))
      }
    }
  }

  const sorted = [...criteria].sort(byOrder)
  const colorById = new Map(sorted.map((criterion, index) => [criterion.id, reviewMetricPalette[index % reviewMetricPalette.length]]))

  return sorted
    .filter((criterion) => criterion.isActive || used.has(criterion.id))
    .map((criterion) => ({
      id: criterion.id,
      label: criterion.name,
      shortLabel: shortLabelFor(criterion),
      color: colorById.get(criterion.id) ?? reviewMetricPalette[0],
      maxScore: criterion.maxScore,
      remarkRequiredAtOrBelow: criterion.remarkRequiredAtOrBelow,
    }))
}

export function needsRemark(metric: ReviewMetric, score: number | null | undefined) {
  return score !== null && score !== undefined && score <= metric.remarkRequiredAtOrBelow
}

// A score on the 1-5 scale the charts draw, whatever the criterion's own top
// score (1 stays 1, the top score becomes 5).
export function toFivePointScale(score: number, maxScore: number) {
  if (maxScore <= 1) return 5
  return 1 + ((score - 1) * 4) / (maxScore - 1)
}

// Tables and bars read 1-5 by default; another top score is said out loud.
export function labelWithScale(metric: ReviewMetric) {
  return metric.maxScore === 5 ? metric.label : `${metric.label} (out of ${metric.maxScore})`
}
