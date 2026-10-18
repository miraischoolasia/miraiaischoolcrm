import { describe, expect, it } from 'vitest'
import { shuffle, splitTeams } from './teams'

const seeded = (seed: number) => () => {
  seed = (seed * 9301 + 49297) % 233280
  return seed / 233280
}

describe('teams', () => {
  it('deals every child into teams that differ by at most one', () => {
    const ids = Array.from({ length: 23 }, (_, index) => index + 1)
    const teams = splitTeams(ids, 4, seeded(7))
    expect(teams.map((team) => team.label)).toEqual(['Red team', 'Blue team', 'Green team', 'Orange team'])
    const sizes = teams.map((team) => team.memberIds.length)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
    expect(teams.flatMap((team) => team.memberIds).sort((a, b) => a - b)).toEqual(ids)
  })

  it('keeps between 2 and 6 teams', () => {
    expect(splitTeams([1, 2, 3], 1)).toHaveLength(2)
    expect(splitTeams([1, 2, 3], 9)).toHaveLength(6)
  })

  it('shuffles without losing anyone', () => {
    expect(shuffle([1, 2, 3, 4, 5], seeded(3)).sort()).toEqual([1, 2, 3, 4, 5])
  })
})
