import { describe, expect, it } from 'vitest'
import { groupMembers, mapTeam, membersOf, sortTeams, teamDraftError, teamsOf, type Team } from './staffTeams'

const team = (id: number, name: string, sortOrder: number, isActive = true): Team => ({
  id,
  name,
  color: null,
  description: null,
  permissions: {},
  isActive,
  sortOrder,
})

describe('teams', () => {
  it('reads a team row and keeps only valid ticks', () => {
    const mapped = mapTeam({
      id: 1,
      name: 'Sales',
      color: '#fc0c97',
      description: null,
      permissions: { leads: { level: 'edit', scope: 'own' }, money: { level: 'edit' } },
      is_active: true,
      sort_order: 0,
    })
    expect(mapped.permissions).toEqual({ leads: { level: 'edit', delete: false, scope: 'own' } })
  })

  it('groups members and finds the teams of a person, switched-off teams left out', () => {
    const members = groupMembers([
      { team_id: 1, teacher_id: 9 },
      { team_id: 2, teacher_id: 9 },
      { team_id: 2, teacher_id: 3 },
      { team_id: 3, teacher_id: 9 },
    ])
    expect(membersOf(2, members)).toEqual([3, 9])
    expect(membersOf(7, members)).toEqual([])
    const teams = [team(1, 'Office', 2), team(2, 'Sales', 1), team(3, 'Old', 0, false)]
    expect(teamsOf(9, teams, members).map((entry) => entry.name)).toEqual(['Sales', 'Office'])
    expect(sortTeams(teams).map((entry) => entry.id)).toEqual([3, 2, 1])
  })

  it('checks a team before it is saved', () => {
    const teams = [team(1, 'Sales', 0)]
    const draft = { id: null, name: '', color: null, description: '', permissions: {}, isActive: true }
    expect(teamDraftError(draft, teams)).toMatch(/name/)
    expect(teamDraftError({ ...draft, name: ' sales ' }, teams)).toMatch(/already/)
    expect(teamDraftError({ ...draft, id: 1, name: 'Sales' }, teams)).toBeNull()
    expect(teamDraftError({ ...draft, name: 'Office', color: 'pink' }, teams)).toMatch(/colour/)
    expect(teamDraftError({ ...draft, name: 'Office' }, teams)).toBeNull()
  })
})
