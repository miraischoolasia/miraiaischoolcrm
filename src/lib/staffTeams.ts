import { supabase } from './supabase'
import { parseAccountPermissions } from './permissions'
import type { AccountPermissions } from '../types/domain'

// Teams: a group of people with a set of ticks (docs/teams-permissions-design.md). Anyone on the staff reads
// them; only an admin changes them, through the database functions below.

export type Team = {
  id: number
  name: string
  color: string | null
  description: string | null
  permissions: AccountPermissions
  isActive: boolean
  sortOrder: number
}

// teamId -> the people (teachers.id) in it.
export type TeamMembers = Map<number, number[]>

export type TeamDraft = {
  id: number | null
  name: string
  color: string | null
  description: string
  permissions: AccountPermissions
  isActive: boolean
}

export const TEAM_SETUP_MISSING = 'Teams are not set up in the database yet. Ask the admin to update the database.'

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  return supabase
}

// A database without the teams tables yet (before 20261026000000).
export function isTeamsMissing(error: unknown) {
  const { code, message } = (error ?? {}) as { code?: string; message?: string }
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST202' ||
    code === '42883' ||
    Boolean(message && /(teams|team_members).*(does not exist|could not find)|could not find.*(teams|team_members)/i.test(message))
  )
}

type TeamRow = {
  id: number
  name: string
  color: string | null
  description: string | null
  permissions: unknown
  is_active: boolean
  sort_order: number
}

export function mapTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    description: row.description,
    permissions: parseAccountPermissions(row.permissions),
    isActive: row.is_active,
    sortOrder: row.sort_order,
  }
}

export function sortTeams(teams: Team[]) {
  return [...teams].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

export async function fetchTeams(): Promise<Team[]> {
  const { data, error } = await requireSupabase()
    .from('teams')
    .select('id, name, color, description, permissions, is_active, sort_order')
  if (error) {
    throw error
  }
  return sortTeams(((data ?? []) as TeamRow[]).map(mapTeam))
}

export async function fetchTeamMembers(): Promise<TeamMembers> {
  const { data, error } = await requireSupabase().from('team_members').select('team_id, teacher_id')
  if (error) {
    throw error
  }
  return groupMembers((data ?? []) as { team_id: number; teacher_id: number }[])
}

export function groupMembers(rows: { team_id: number; teacher_id: number }[]): TeamMembers {
  const result: TeamMembers = new Map()
  for (const row of rows) {
    result.set(row.team_id, [...(result.get(row.team_id) ?? []), row.teacher_id])
  }
  for (const [teamId, ids] of result) {
    result.set(teamId, [...ids].sort((a, b) => a - b))
  }
  return result
}

// The switched-on teams a person is in, in list order.
export function teamsOf(teacherId: number, teams: Team[], members: TeamMembers): Team[] {
  return sortTeams(teams).filter((team) => team.isActive && (members.get(team.id) ?? []).includes(teacherId))
}

export function membersOf(teamId: number, members: TeamMembers): number[] {
  return members.get(teamId) ?? []
}

// For the Calendar's Team filter (src/lib/calendarFilter.ts, CalendarTeam): every switched-on team and its
// people. A database without teams yet gives none, so the filter says "No teams yet".
export async function fetchTeamsWithMembers(): Promise<{ id: number; name: string; color: string | null; memberIds: number[] }[]> {
  if (!supabase) {
    return []
  }
  try {
    const [teams, members] = await Promise.all([fetchTeams(), fetchTeamMembers()])
    return teams
      .filter((team) => team.isActive)
      .map((team) => ({ id: team.id, name: team.name, color: team.color, memberIds: membersOf(team.id, members) }))
  } catch (error) {
    if (isTeamsMissing(error)) {
      return []
    }
    throw error
  }
}

export function teamDraftError(draft: TeamDraft, teams: Team[]): string | null {
  const name = draft.name.trim()
  if (name === '') {
    return 'Give the team a name, for example "Sales" or "Office".'
  }
  if (name.length > 60) {
    return 'A team name can have up to 60 letters.'
  }
  if (teams.some((team) => team.id !== draft.id && team.name.trim().toLowerCase() === name.toLowerCase())) {
    return 'There is already a team with this name.'
  }
  if (draft.color !== null && !/^#[0-9a-fA-F]{6}$/.test(draft.color)) {
    return 'Pick a colour from the list.'
  }
  if (draft.description.length > 300) {
    return 'The description can have up to 300 letters.'
  }
  return null
}

// Makes the team (draft.id null) or changes it; returns its id.
export async function saveTeam(draft: TeamDraft): Promise<number> {
  const { data, error } = await requireSupabase().rpc('save_team', {
    p_id: draft.id,
    p_name: draft.name.trim(),
    p_color: draft.color,
    p_description: draft.description.trim(),
    p_permissions: draft.permissions,
    p_is_active: draft.isActive,
  })
  if (error) {
    throw error
  }
  return Number(data)
}

export async function setTeamMembers(teamId: number, teacherIds: number[]) {
  const { error } = await requireSupabase().rpc('set_team_members', { p_team_id: teamId, p_teacher_ids: teacherIds })
  if (error) {
    throw error
  }
}

export async function setAccountTeams(teacherId: number, teamIds: number[]) {
  const { error } = await requireSupabase().rpc('set_account_teams', { p_teacher_id: teacherId, p_team_ids: teamIds })
  if (error) {
    throw error
  }
}

export async function reorderTeams(teamIds: number[]) {
  const { error } = await requireSupabase().rpc('reorder_teams', { p_team_ids: teamIds })
  if (error) {
    throw error
  }
}

export const TEAM_COLORS = ['#fc0c97', '#7c3aed', '#2563eb', '#0891b2', '#16a34a', '#ca8a04', '#ea580c', '#64748b']

// "Start with suggested teams": three empty teams with the ticks such a team usually needs. White-label: the
// admin renames them, changes the ticks or switches them off.
export const SUGGESTED_TEAMS: Omit<TeamDraft, 'id'>[] = [
  {
    name: 'Sales',
    color: '#fc0c97',
    description: 'Follows up leads and answers the chats.',
    isActive: true,
    permissions: {
      leads: { level: 'edit' },
      inbox: { level: 'edit' },
      forms: { level: 'view' },
      automations: { level: 'view' },
      ai_knowledge: { level: 'view' },
      calendar: { level: 'view' },
    },
  },
  {
    name: 'Teachers',
    color: '#2563eb',
    description: 'Teach classes. Every teacher already sees their own classes; tick anything extra here.',
    isActive: true,
    permissions: { questions: { level: 'view' }, videos: { level: 'view' } },
  },
  {
    name: 'Office',
    color: '#16a34a',
    description: 'Books trials, keeps the student list and the calendar.',
    isActive: true,
    permissions: {
      calendar: { level: 'edit' },
      classrooms: { level: 'view' },
      students: { level: 'edit' },
      app_logins: { level: 'edit' },
      leads: { level: 'view' },
    },
  },
]

// PIC names (Leads) and the account each stands for: "my leads" are the leads whose PIC is linked to me.
export type PicLink = { id: number; label: string; teacherId: number | null; isActive: boolean }

export async function fetchPicLinks(): Promise<PicLink[]> {
  const db = requireSupabase()
  const result = await db.from('lead_options').select('id, label, is_active, teacher_id').eq('kind', 'pic').order('label')
  if (result.error) {
    throw result.error
  }
  return ((result.data ?? []) as { id: number; label: string; is_active: boolean; teacher_id: number | null }[]).map((row) => ({
    id: row.id,
    label: row.label,
    teacherId: row.teacher_id,
    isActive: row.is_active,
  }))
}

export async function linkPic(optionId: number, teacherId: number | null) {
  const { error } = await requireSupabase().from('lead_options').update({ teacher_id: teacherId } as never).eq('id', optionId)
  if (error) {
    throw error
  }
}
