// Splitting the class into teams in one tap (the live class console's Teams
// tool): children are shuffled and dealt out like cards, so the teams differ
// by at most one child.

export type TeamColor = { key: string; label: string; card: string; text: string }

export const teamColors: TeamColor[] = [
  { key: 'red', label: 'Red', card: '#ef4444', text: '#ffffff' },
  { key: 'blue', label: 'Blue', card: '#3b82f6', text: '#ffffff' },
  { key: 'green', label: 'Green', card: '#22c55e', text: '#ffffff' },
  { key: 'orange', label: 'Orange', card: '#f97316', text: '#ffffff' },
  { key: 'purple', label: 'Purple', card: '#a855f7', text: '#ffffff' },
  { key: 'teal', label: 'Teal', card: '#14b8a6', text: '#ffffff' },
]

export type Team = { key: string; label: string; memberIds: number[]; score: number }

// A seeded shuffle, so a test (or a "shuffle again") is repeatable.
export function shuffle<T>(items: T[], random: () => number = Math.random) {
  const list = [...items]
  for (let index = list.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[list[index], list[other]] = [list[other], list[index]]
  }
  return list
}

export function splitTeams(studentIds: number[], count: number, random: () => number = Math.random): Team[] {
  const size = Math.max(2, Math.min(teamColors.length, Math.round(count)))
  const teams: Team[] = teamColors.slice(0, size).map((color) => ({ key: color.key, label: `${color.label} team`, memberIds: [], score: 0 }))
  shuffle(studentIds, random).forEach((id, index) => teams[index % size].memberIds.push(id))
  return teams
}

export function colorOf(key: string) {
  return teamColors.find((color) => color.key === key) ?? teamColors[0]
}
