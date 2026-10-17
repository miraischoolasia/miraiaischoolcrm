import { describe, expect, it } from 'vitest'
import { buildRoom, readRoomRules, type ZoomStay } from './zoomRoom'

const stay = (over: Partial<ZoomStay>): ZoomStay => ({
  id: 1,
  studentId: null,
  userName: null,
  joinedAt: '2026-10-21T12:30:00Z',
  leftAt: null,
  dropped: false,
  isHost: false,
  strangerCleared: false,
  ...over,
})

describe('buildRoom', () => {
  const roster = [
    { studentId: 1, name: 'Ali' },
    { studentId: 2, name: 'Bea' },
    { studentId: 3, name: 'Cai' },
    { studentId: 4, name: 'Dan' },
  ]
  const rules = { lateMinutes: 5, dropGraceSeconds: 0 }

  it('sorts children into here, left, waiting and not yet', () => {
    const room = buildRoom({
      roster,
      startsAt: '2026-10-21T12:30:00Z',
      rules,
      stays: [
        stay({ id: 1, isHost: true, userName: 'Teacher' }),
        stay({ id: 2, studentId: 1, joinedAt: '2026-10-21T12:31:00Z' }),
        stay({ id: 3, studentId: 2, joinedAt: '2026-10-21T12:40:00Z', leftAt: '2026-10-21T12:50:00Z', dropped: true }),
        stay({ id: 4, studentId: 1, joinedAt: '2026-10-21T12:20:00Z', leftAt: '2026-10-21T12:25:00Z' }),
      ],
      waiting: [{ id: 9, studentId: 3, userName: 'Cai', enteredAt: '2026-10-21T12:33:00Z', leftAt: null }],
    })
    expect(room.hostHere).toBe(true)
    expect(room.here.map((child) => [child.name, child.late])).toEqual([['Ali', false]])
    expect(room.left).toMatchObject([{ name: 'Bea', late: true, dropped: true }])
    expect(room.waiting.map((row) => row.name)).toEqual(['Cai'])
    expect(room.notYet.map((child) => child.name)).toEqual(['Dan'])
    expect(room.strangers).toEqual([])
  })

  it('shows strangers until cleared, never the host', () => {
    const room = buildRoom({
      roster,
      startsAt: null,
      rules,
      waiting: [],
      stays: [
        stay({ id: 5, userName: 'Uncle Lim' }),
        stay({ id: 6, userName: 'Gone', leftAt: '2026-10-21T12:35:00Z' }),
        stay({ id: 7, userName: 'Known', strangerCleared: true }),
        stay({ id: 8, userName: 'Teacher', isHost: true }),
      ],
    })
    expect(room.strangers.map((row) => [row.name, row.stillHere])).toEqual([
      ['Uncle Lim', true],
      ['Gone', false],
    ])
  })

  it('reads the school rules with safe defaults', () => {
    expect(readRoomRules(null)).toEqual({ lateMinutes: 5, dropGraceSeconds: 0 })
    expect(readRoomRules({ late_minutes: 10, drop_grace_seconds: 240 })).toEqual({ lateMinutes: 10, dropGraceSeconds: 240 })
    expect(readRoomRules({ late_minutes: 'x' })).toEqual({ lateMinutes: 5, dropGraceSeconds: 0 })
  })
})
