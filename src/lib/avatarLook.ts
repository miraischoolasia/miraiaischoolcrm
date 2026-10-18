// Each child's own little cartoon face, worked out from their id so it is
// always the same (later the child may pick their own in the app).

export type HairStyle = 'short' | 'bob' | 'spiky' | 'bun' | 'curly' | 'cap'

export type AvatarLook = {
  background: string
  skin: string
  hair: string
  hairStyle: HairStyle
  glasses: boolean
  blush: boolean
}

const backgrounds = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fbcfe8', '#ddd6fe', '#fed7aa', '#a5f3fc', '#fecaca']
const skins = ['#fde2c8', '#f5c9a1', '#e0a878', '#b9835a']
const hairs = ['#2b2118', '#4a3121', '#7a4a24', '#1f2937', '#a0522d']
const styles: HairStyle[] = ['short', 'bob', 'spiky', 'bun', 'curly', 'cap']

// A small, steady mix of the id so neighbours do not look alike.
function mix(value: number, salt: number) {
  let x = (Math.abs(Math.trunc(value)) + 1) * 2654435761 + salt * 40503
  x = (x ^ (x >>> 13)) >>> 0
  x = Math.imul(x, 1274126177) >>> 0
  return (x ^ (x >>> 16)) >>> 0
}

export function avatarLook(id: number): AvatarLook {
  return {
    background: backgrounds[mix(id, 1) % backgrounds.length],
    skin: skins[mix(id, 2) % skins.length],
    hair: hairs[mix(id, 3) % hairs.length],
    hairStyle: styles[mix(id, 4) % styles.length],
    glasses: mix(id, 5) % 5 === 0,
    blush: mix(id, 6) % 2 === 0,
  }
}

// "Lim Loke Yan" -> "LL", for screen readers and the fallback.
export function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => [...word][0] ?? '')
      .join('')
      .toUpperCase() || '?'
  )
}
