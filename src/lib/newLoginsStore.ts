import { useSyncExternalStore } from 'react'
import type { FamilyLogins } from './portalLogins'

// Logins made in this browser tab, with their passwords, until they are sent
// (each password is shown only once). Kept outside the page so going to the
// Inbox to send one and coming back does not lose the rest. Only in memory:
// a reload or "Clear" forgets them.

export type SentFamily = FamilyLogins & { opened: boolean }

let families: SentFamily[] = []
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function addNewLogins(next: FamilyLogins[]) {
  if (next.length === 0) return
  const merged = new Map(families.map((family) => [family.family, family]))
  for (const family of next) {
    const existing = merged.get(family.family)
    if (existing) {
      // A newer password for the same login replaces the old one.
      const logins = [...existing.logins.filter((login) => !family.logins.some((entry) => entry.username === login.username)), ...family.logins]
      merged.set(family.family, { ...existing, ...family, logins, opened: false })
    } else {
      merged.set(family.family, { ...family, opened: false })
    }
  }
  families = [...merged.values()]
  emit()
}

export function markOpened(family: string) {
  families = families.map((entry) => (entry.family === family ? { ...entry, opened: true } : entry))
  emit()
}

export function clearNewLogins() {
  families = []
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useNewLogins() {
  return useSyncExternalStore(subscribe, () => families)
}
