// Pure parts of the portal-accounts function, shared with the CRM's tests.

// The student app signs in with a login name; Supabase Auth needs an email,
// so each name becomes <name>@portal.internal (never a real mailbox). Staff
// use @mirai.internal, so the two never clash.
export const PORTAL_EMAIL_DOMAIN = 'portal.internal'

export function portalEmail(username: string) {
  return `${username}@${PORTAL_EMAIL_DOMAIN}`
}

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,39}$/

// "Ethan Lim" -> "ethan.lim"; a name with no Latin letters (e.g. Chinese)
// gives the fallback, so the admin can type a better one.
export function suggestUsername(fullName: string, fallback: string) {
  const base = fullName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 30)
  return base.length >= 3 ? base : fallback
}

// The first free name: ali.tan, ali.tan2, ali.tan3, ...
export function firstFreeUsername(base: string, taken: Set<string>) {
  if (!taken.has(base)) return base
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base.slice(0, 36)}${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base.slice(0, 30)}${Date.now() % 100000}`
}

const WORDS_A = ['sunny', 'happy', 'brave', 'clever', 'lucky', 'bright', 'swift', 'kind', 'jolly', 'cosy', 'magic', 'super']
const WORDS_B = ['panda', 'tiger', 'rocket', 'mango', 'dolphin', 'koala', 'robot', 'comet', 'pixel', 'otter', 'falcon', 'turtle']

// An easy-to-say password like "sunny-panda-47" (12 x 12 x 90 choices, plus
// the login name; Supabase also limits how fast sign-ins can be tried).
export function friendlyPassword(random: () => number = Math.random) {
  const pick = (list: string[]) => list[Math.floor(random() * list.length) % list.length]
  const number = 10 + Math.floor(random() * 90)
  return `${pick(WORDS_A)}-${pick(WORDS_B)}-${number}`
}
