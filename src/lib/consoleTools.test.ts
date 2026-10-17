import { describe, expect, it } from 'vitest'
import { formatClock, pickNext } from './consoleTools'
import { remarksWithNotes } from './classNotes'

describe('console tools', () => {
  it('formats the clock', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(3725)).toBe('1:02:05')
    expect(formatClock(-3)).toBe('0:00')
  })

  it('picks everyone once before starting again', () => {
    let picked: number[] = []
    const seen = new Set<number>()
    for (let turn = 0; turn < 3; turn += 1) {
      const next = pickNext([1, 2, 3], picked, () => 0)
      seen.add(next.studentId!)
      picked = next.picked
    }
    expect([...seen].sort()).toEqual([1, 2, 3])
    const again = pickNext([1, 2, 3], picked, () => 0.99)
    expect(again.studentId).not.toBe(picked[picked.length - 1])
    expect(again.picked).toHaveLength(1)
  })

  it('handles nobody and one child', () => {
    expect(pickNext([], [], () => 0).studentId).toBeNull()
    expect(pickNext([7], [7], () => 0).studentId).toBe(7)
  })
})

describe('notes into lesson remarks', () => {
  it('fills empty remarks and adds to others once', () => {
    const notes = new Map([
      [1, 'Great focus'],
      [2, 'Needs help with loops'],
      [3, 'Already there'],
      [4, '  '],
    ])
    const remarks: Record<number, string> = { 1: '', 2: 'Finished level 2', 3: 'Good. Already there', 4: '' }
    const changes = remarksWithNotes(notes, (id) => remarks[id] ?? '', [1, 2, 3, 4, 5])
    expect([...changes]).toEqual([
      [1, 'Great focus'],
      [2, 'Finished level 2\nNeeds help with loops'],
    ])
  })
})
