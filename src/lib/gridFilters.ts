import type { GridChild } from '../components/console/StudentGrid'

// Big classes (100-200 children): the console shows the counts first and,
// by default, only the children who need the teacher.

export type GridFilter = 'attention' | 'all' | 'here' | 'waiting' | 'not_yet' | 'left' | 'answered' | 'not_answered' | 'to_mark' | 'notes'

// Above this many children the grid starts compact and on "needs you".
export const BIG_CLASS = 40

// Not in the lesson (late, waiting, gone), an answer to mark or wrong, or picked.
export function needsAttention(child: GridChild) {
  return (
    child.state !== 'here' ||
    child.answer === 'pending' ||
    child.answer === 'wrong' ||
    child.picked
  )
}

const tests: Record<GridFilter, (child: GridChild) => boolean> = {
  attention: needsAttention,
  all: () => true,
  here: (child) => child.state === 'here',
  waiting: (child) => child.state === 'waiting',
  not_yet: (child) => child.state === 'not_yet',
  left: (child) => child.state === 'left',
  answered: (child) => child.answer === 'right' || child.answer === 'wrong' || child.answer === 'pending',
  not_answered: (child) => child.answer === 'none',
  to_mark: (child) => child.answer === 'pending',
  notes: (child) => child.note !== null,
}

export function gridCounts(items: GridChild[]): Record<GridFilter, number> {
  const counts = {} as Record<GridFilter, number>
  for (const key of Object.keys(tests) as GridFilter[]) counts[key] = items.filter(tests[key]).length
  return counts
}

// Search matches any part of the name, ignoring case and spaces.
export function filterGrid(items: GridChild[], filter: GridFilter, search: string) {
  const words = search.trim().toLowerCase().replace(/\s+/g, '')
  return items.filter((child) => (words ? child.name.toLowerCase().replace(/\s+/g, '').includes(words) : tests[filter](child)))
}

// "Lim Loke Yan" -> "Lim L.", for the small tiles.
export function shortName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return parts[0] ?? name
  return `${parts[0]} ${parts[1][0]}.`
}
