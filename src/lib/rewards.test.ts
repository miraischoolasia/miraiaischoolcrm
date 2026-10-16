import { describe, expect, it } from 'vitest'
import { levelFor, pointsByStudent, totalPoints, undoneIds, type PointsEntry } from './rewards'

const levels = [
  { id: 1, name: 'Starter', minPoints: 0 },
  { id: 3, name: 'Builder', minPoints: 300 },
  { id: 2, name: 'Explorer', minPoints: 100 },
]

function entry(id: number, studentId: number, points: number, reversesId: number | null = null): PointsEntry {
  return {
    id,
    studentId,
    points,
    kind: reversesId ? 'adjust' : 'award',
    reason: 'x',
    scheduleId: null,
    lessonDate: null,
    reversesId,
    createdBy: 1,
    createdAt: '2026-10-16T00:00:00Z',
  }
}

describe('levelFor', () => {
  it('finds the level reached and how far to the next', () => {
    expect(levelFor(0, levels)).toMatchObject({ current: { name: 'Starter' }, next: { name: 'Explorer' }, progress: 0 })
    expect(levelFor(200, levels)).toMatchObject({ current: { name: 'Explorer' }, next: { name: 'Builder' }, progress: 0.5 })
  })

  it('is full at the top level', () => {
    expect(levelFor(999, levels)).toMatchObject({ current: { name: 'Builder' }, next: null, progress: 1 })
  })

  it('has no level without levels', () => {
    expect(levelFor(50, [])).toEqual({ current: null, next: null, progress: 1 })
  })
})

describe('points sums', () => {
  const entries = [entry(1, 7, 5), entry(2, 8, 3), entry(3, 7, -5, 1), entry(4, 7, 10)]

  it('adds up, undos included', () => {
    expect(totalPoints(entries)).toBe(13)
    expect(pointsByStudent(entries)).toEqual(new Map([[7, 10], [8, 3]]))
  })

  it('marks an undone entry and its undo', () => {
    expect(undoneIds(entries)).toEqual(new Set([1, 3]))
  })
})
