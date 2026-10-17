import { describe, expect, it } from 'vitest'
import { filterGrid, gridCounts, needsAttention, shortName } from './gridFilters'
import type { GridChild } from '../components/console/StudentGrid'

const child = (studentId: number, name: string, over: Partial<GridChild> = {}): GridChild => ({
  studentId,
  name,
  state: 'here',
  late: false,
  dropped: false,
  answer: 'right',
  points: 0,
  note: null,
  picked: false,
  background: null,
  remindedAt: null,
  canRemind: false,
  ...over,
})

describe('big class grid', () => {
  const items = [
    child(1, 'Lim Loke Yan'),
    child(2, 'Tan Tian Ying', { answer: 'pending' }),
    child(3, 'Ali', { state: 'not_yet', answer: 'none' }),
    child(4, 'Siti Aminah', { state: 'waiting', answer: 'none', note: 'quiet today' }),
    child(5, 'Ben', { answer: 'none' }),
  ]

  it('shows only who needs the teacher by default', () => {
    expect(items.filter(needsAttention).map((entry) => entry.studentId)).toEqual([2, 3, 4])
    expect(filterGrid(items, 'attention', '').map((entry) => entry.studentId)).toEqual([2, 3, 4])
  })

  it('counts each filter', () => {
    expect(gridCounts(items)).toMatchObject({ all: 5, here: 3, waiting: 1, not_yet: 1, answered: 2, not_answered: 3, to_mark: 1, notes: 1, attention: 3 })
  })

  it('searches every child by name', () => {
    expect(filterGrid(items, 'attention', 'lokeyan').map((entry) => entry.studentId)).toEqual([1])
    expect(filterGrid(items, 'here', ' ben ').map((entry) => entry.studentId)).toEqual([5])
  })

  it('shortens names for small tiles', () => {
    expect(shortName('Lim Loke Yan')).toBe('Lim L.')
    expect(shortName('Ali')).toBe('Ali')
  })
})
