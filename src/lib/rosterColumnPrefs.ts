// Which columns of the Students roster a staff member shows, and in which order. Kept per person.

export type RosterColumnPref = {
  // Column keys in the order the person wants them. Columns not listed (new ones) follow in their usual order.
  order: string[]
  // Column keys the person has switched off.
  hidden: string[]
}

export const EMPTY_COLUMN_PREF: RosterColumnPref = { order: [], hidden: [] }
export const ROSTER_COLUMNS_PREF_KEY = 'students.roster.columns'

// The student's name is always the first column and cannot be switched off.
export const LOCKED_COLUMN = 'name'

export function readColumnPref(raw: unknown): RosterColumnPref {
  const value = (raw ?? {}) as { order?: unknown; hidden?: unknown }
  const strings = (list: unknown) => (Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === 'string') : [])
  return { order: strings(value.order), hidden: strings(value.hidden) }
}

// The columns to show: the person's order first (only columns the school has), then the rest, the name first of all,
// minus the hidden ones. `available` is the school's columns in their usual order.
export function arrangeColumns<T extends { key: string }>(available: T[], pref: RosterColumnPref): T[] {
  return arrangeAll(available, pref).filter((column) => column.key === LOCKED_COLUMN || !pref.hidden.includes(column.key))
}

// Every column the school has in the person's order, hidden ones included (for the Manage columns list).
export function arrangeAll<T extends { key: string }>(available: T[], pref: RosterColumnPref): T[] {
  const byKey = new Map(available.map((column) => [column.key, column]))
  const placed = new Set<string>()
  const ordered: T[] = []
  for (const key of [LOCKED_COLUMN, ...pref.order]) {
    const column = byKey.get(key)
    if (column && !placed.has(key)) {
      placed.add(key)
      ordered.push(column)
    }
  }
  for (const column of available) {
    if (!placed.has(column.key)) {
      ordered.push(column)
    }
  }
  return ordered
}

// What Apply saves: the order of all columns and which are off (the name is never off).
export function preferenceFrom(orderedKeys: string[], visible: Set<string>): RosterColumnPref {
  return {
    order: orderedKeys,
    hidden: orderedKeys.filter((key) => key !== LOCKED_COLUMN && !visible.has(key)),
  }
}

export function moveKey(keys: string[], key: string, targetKey: string): string[] {
  if (key === targetKey || key === LOCKED_COLUMN || targetKey === LOCKED_COLUMN) {
    return keys
  }
  const from = keys.indexOf(key)
  const to = keys.indexOf(targetKey)
  if (from === -1 || to === -1) {
    return keys
  }
  const next = [...keys]
  next.splice(from, 1)
  next.splice(to, 0, key)
  return next
}
