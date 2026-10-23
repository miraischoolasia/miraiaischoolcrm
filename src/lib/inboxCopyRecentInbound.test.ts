import { describe, expect, it, vi } from 'vitest'

// A database that hands over at most 1000 rows a request, like Supabase's API.
const rows = Array.from({ length: 1534 }, (_, index) => ({ conversation_id: index < 1500 ? 1 + (index % 300) : 4 }))
const ranges: [number, number][] = []
vi.mock('./supabase', () => {
  const query = {
    select: () => query,
    eq: () => query,
    gte: () => query,
    order: () => query,
    range: async (from: number, to: number) => {
      ranges.push([from, to])
      return { data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null }
    },
  }
  return { supabase: { from: () => query } }
})

describe('fetchRecentInboundChats (forward to Messenger, 2026-10-23)', () => {
  it('reads every page, so a chat past the first 1000 parent messages is not wrongly refused', async () => {
    const { fetchRecentInboundChats } = await import('./inboxCopyReader')
    const found = await fetchRecentInboundChats(24 * 3600)
    expect(found.has(4)).toBe(true)
    expect(found.size).toBe(300)
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })
})
