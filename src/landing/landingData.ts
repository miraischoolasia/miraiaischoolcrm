// A landing page as it is saved: Puck's JSON (the blocks in order, a block's columns holding blocks of their own)
// plus our own format number. Nothing here loads the editor, so the public page can use it.

// Our own block format. Raise it when a block or a field is renamed or reshaped, and add the step below that
// turns the older pages into the new shape; a page is brought up to date when it is shown or opened.
export const LANDING_DATA_VERSION = 1

// The editor version the pages are saved with (package.json pins exactly this one).
export const PUCK_VERSION = '0.23.0'

export type LandingBlock = {
  type: string
  props: Record<string, unknown> & { id?: string }
}

export type LandingData = {
  root: { props: Record<string, unknown> }
  content: LandingBlock[]
}

export const emptyLandingData = (): LandingData => ({ root: { props: {} }, content: [] })

// The steps from one format to the next: steps[1] turns a version 1 page into version 2, and so on.
const steps: Record<number, (data: LandingData) => LandingData> = {}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

// Anything read from the database, in the shape the page code expects (a broken row shows an empty page).
export function normalizeLandingData(raw: unknown): LandingData {
  const value = asObject(raw)
  const root = asObject(value.root)
  const content = Array.isArray(value.content) ? value.content : []
  return {
    root: { props: asObject(root.props) },
    content: content
      .map((block) => asObject(block))
      .filter((block) => typeof block.type === 'string')
      .map((block) => ({ type: block.type as string, props: asObject(block.props) })),
  }
}

// Brings a saved page up to today's format.
export function migrateLandingData(raw: unknown, fromVersion: number | null | undefined): LandingData {
  let data = normalizeLandingData(raw)
  for (let version = Math.max(1, fromVersion ?? 1); version < LANDING_DATA_VERSION; version += 1) {
    const step = steps[version]
    if (step) {
      data = step(data)
    }
  }
  return data
}

// The web address of a page: lower-case letters, digits and "-", 2 to 60 long, not one the site uses itself.
export const RESERVED_SLUGS = ['admin', 'api', 'app', 'assets', 'login', 'p', 'preview', 'www']

export function slugProblem(slug: string) {
  if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(slug)) {
    return '网址只能用小写英文、数字和「-」，2 到 60 个字，第一个字不能是「-」。'
  }
  if (RESERVED_SLUGS.includes(slug)) {
    return '这个网址系统自己要用，请换一个。'
  }
  return null
}

// A page name turned into a web address ("Book Fair 2026!" -> "book-fair-2026"); '' when nothing is left
// (a Chinese name), and the person types one.
export function slugFromTitle(title: string) {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

export function landingPageUrl(slug: string, origin = typeof window === 'undefined' ? '' : window.location.origin) {
  return `${origin}/p/${slug}`
}
