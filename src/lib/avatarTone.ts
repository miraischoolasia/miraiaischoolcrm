const staffTones = [
  'bg-sky-100 text-sky-800',
  'bg-violet-100 text-violet-800',
  'bg-amber-100 text-amber-800',
  'bg-emerald-100 text-emerald-800',
  'bg-rose-100 text-rose-800',
  'bg-teal-100 text-teal-800',
]

export const parentTone = 'bg-slate-200 text-slate-700'

// The same person always gets the same colour.
export function staffTone(name: string) {
  let hash = 0
  for (const character of name) {
    hash = (hash * 31 + character.charCodeAt(0)) % 997
  }
  return staffTones[hash % staffTones.length]
}
