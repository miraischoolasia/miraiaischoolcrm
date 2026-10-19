import { beforeEach, describe, expect, it, vi } from 'vitest'

// What My Team > Teams answers in each test: the teams, or a failure.
const answer: { teams: { id: number; name: string; color: string | null; memberIds: number[] }[]; fail: boolean } = {
  teams: [],
  fail: false,
}
vi.mock('./staffTeams', () => ({
  fetchTeamsWithMembers: () => (answer.fail ? Promise.reject(new Error('offline')) : Promise.resolve(answer.teams)),
}))

import { fetchCalendarTeams } from './calendarFilter'

describe('fetchCalendarTeams (the Calendar Team filter reads My Team > Teams)', () => {
  beforeEach(() => {
    answer.teams = []
    answer.fail = false
  })

  it('gives every switched-on team and its people', async () => {
    answer.teams = [
      { id: 1, name: 'Sales', color: '#fc0c97', memberIds: [2, 3] },
      { id: 2, name: 'Office', color: null, memberIds: [] },
    ]
    expect(await fetchCalendarTeams()).toEqual([
      { id: 1, name: 'Sales', memberIds: [2, 3] },
      { id: 2, name: 'Office', memberIds: [] },
    ])
  })

  it('gives none when the teams cannot be read, so the calendar still works', async () => {
    answer.fail = true
    expect(await fetchCalendarTeams()).toEqual([])
  })
})
