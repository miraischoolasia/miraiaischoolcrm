import { computeRoute, pageLabel } from './formPages'
import type { FormField, FormPage, FormSubmission, FormTracking } from '../types/domain'

// Where visitors came from and where they stop: the numbers behind the
// Insights box on the Submissions tab.

const TRACKING_MAX_LENGTH = 100

function clean(value: string | null | undefined) {
  // Control characters are noise in a campaign name.
  return [...(value ?? '')]
    .filter((char) => char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127)
    .join('')
    .trim()
    .slice(0, TRACKING_MAX_LENGTH)
}

// Ad platforms add their own click id when they send someone to a link, even
// when nobody put ?utm_source on it; it still tells us the source.
const clickIdSources: [param: string, source: string][] = [
  ['fbclid', 'facebook'],
  ['gclid', 'google'],
  ['ttclid', 'tiktok'],
  ['msclkid', 'bing'],
]

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

// Reads where this visit came from, from the page's own address and the page
// that linked to it. Null when there is nothing to record.
export function readTracking(search: string, referrer: string, ownHost: string): FormTracking | null {
  const params = new URLSearchParams(search)
  const clickSource = clickIdSources.find(([param]) => params.get(param))?.[1] ?? ''
  const referrerHost = hostOf(referrer)

  const tracking: FormTracking = {
    source: clean(params.get('utm_source')) || clickSource,
    medium: clean(params.get('utm_medium')),
    campaign: clean(params.get('utm_campaign')),
    content: clean(params.get('utm_content')),
    referrer: referrerHost && referrerHost !== ownHost.replace(/^www\./, '').toLowerCase() ? referrerHost : '',
  }

  return Object.values(tracking).some(Boolean) ? tracking : null
}

// What to call a visit in lists: the campaign's source, else the website that
// sent them, else "Direct" (typed in, bookmarked, or a chat app that hides it).
export function trafficSourceLabel(tracking: FormTracking | null) {
  return tracking?.source || tracking?.referrer || 'Direct'
}

export type SourceRow = { source: string; campaign: string; count: number }

// Finished submissions grouped by where they came from, most first.
export function summarizeSources(submissions: FormSubmission[]): SourceRow[] {
  const groups = new Map<string, SourceRow>()
  for (const submission of submissions) {
    if (submission.status !== 'completed') {
      continue
    }
    const source = trafficSourceLabel(submission.tracking)
    const campaign = submission.tracking?.campaign ?? ''
    const key = `${source}\u0000${campaign}`
    const row = groups.get(key) ?? { source, campaign, count: 0 }
    row.count += 1
    groups.set(key, row)
  }
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || a.source.localeCompare(b.source) || a.campaign.localeCompare(b.campaign),
  )
}

export type FunnelRow = {
  pageId: string
  label: string
  // How many people got to this page.
  reached: number
  // How many of them stopped here (never finished).
  stoppedHere: number
}

// Answers are stored as text; a multiple-choice answer is "A, B", which the
// rules need as a list again.
function answersToObject(fields: FormField[], submission: FormSubmission) {
  const checkbox = new Set(fields.filter((field) => field.type === 'checkbox').map((field) => field.id))
  const answers: Record<string, string | string[]> = {}
  for (const answer of submission.answers) {
    answers[answer.id] = checkbox.has(answer.id.split('#')[0])
      ? answer.value.split(', ').filter(Boolean)
      : answer.value
  }
  return answers
}

// How far people get through a multi-page form. A finished submission went
// through every page its answers lead to; an unfinished one got as far as the
// page it stopped on. The first page also counts the people who opened the
// form and left before pressing Next (nothing is saved for them), worked out
// from the view count.
export function computePageFunnel(
  pages: FormPage[],
  fields: FormField[],
  submissions: FormSubmission[],
  viewCount: number,
): FunnelRow[] {
  const reached = pages.map(() => 0)
  const stopped = pages.map(() => 0)

  for (const submission of submissions) {
    const { visited } = computeRoute(pages, answersToObject(fields, submission))
    let indexes = visited.map((id) => pages.findIndex((page) => page.id === id)).filter((i) => i >= 0)

    if (submission.status === 'partial') {
      const lastPage = Math.max(submission.lastPage ?? 1, 1)
      indexes = indexes.filter((index) => index + 1 <= lastPage)
    }
    if (indexes.length === 0) {
      indexes = [0]
    }
    for (const index of indexes) {
      reached[index] += 1
    }
    if (submission.status === 'partial') {
      stopped[Math.max(...indexes)] += 1
    }
  }

  // People who opened the form but never pressed Next or Submit.
  const bounced = Math.max(0, viewCount - submissions.length)
  reached[0] += bounced
  stopped[0] += bounced

  return pages.map((page, index) => ({
    pageId: page.id,
    label: pageLabel(page, index),
    reached: reached[index],
    stoppedHere: stopped[index],
  }))
}
