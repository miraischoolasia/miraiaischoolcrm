// Whether two values read from the server hold the same data (plain objects, arrays, Maps, Sets, primitives).
// A list read again every minute is usually unchanged: keeping the old one then spares the Inbox a redraw of every
// chat, which on a phone took seconds.
export function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) {
      return false
    }
    for (let i = 0; i < a.length; i++) {
      if (!sameData(a[i], b[i])) {
        return false
      }
    }
    return true
  }
  if (a instanceof Map) {
    if (!(b instanceof Map) || a.size !== b.size) {
      return false
    }
    for (const [key, value] of a) {
      if (!b.has(key) || !sameData(value, b.get(key))) {
        return false
      }
    }
    return true
  }
  if (a instanceof Set) {
    if (!(b instanceof Set) || a.size !== b.size) {
      return false
    }
    for (const value of a) {
      if (!b.has(value)) {
        return false
      }
    }
    return true
  }
  if (Array.isArray(b) || b instanceof Map || b instanceof Set || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) {
    return false
  }
  const keysA = Object.keys(a)
  if (keysA.length !== Object.keys(b).length) {
    return false
  }
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !sameData((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false
    }
  }
  return true
}

// For a setState updater: the old value when the new one holds the same data, so React skips the redraw.
export function keepIfSame<T>(next: T) {
  return (previous: T) => (sameData(previous, next) ? previous : next)
}
