import { supabase } from './supabase'

// What the AI brain can learn from the team: its reminders about missing information, and the replies
// the team really sent compared with what the AI drafted. Nothing here changes the AI by itself; an
// admin turns a reminder or an example into a knowledge note, and only then does the AI read it.

export type DraftCategory =
  'info' | 'schedule' | 'price' | 'enrol' | 'followup' | 'complaint' | 'refund' | 'health' | 'other'

export const CATEGORY_LABELS: Record<DraftCategory, string> = {
  info: 'School and courses',
  schedule: 'Times and days',
  price: 'Price and offers',
  enrol: 'Sign-up and payment',
  followup: 'Chat in the flow',
  complaint: 'Complaint',
  refund: 'Refund and changes',
  health: 'Health and safety',
  other: 'Other',
}

// Questions that must never be answered without a person, however well the drafts do.
export const ALWAYS_PERSON: DraftCategory[] = ['price', 'complaint', 'refund', 'health']

export type DraftRow = {
  id: number
  createdAt: string
  chatId: number
  draft: string | null
  skipped: boolean
  staffNote: string | null
  category: DraftCategory | null
  parentText: string | null
  sentText: string | null
  sentAt: string | null
  acceptedAt: string | null
  gapResolvedAt: string | null
  reviewedAt: string | null
}

type RawRow = {
  id: number
  created_at: string
  chat_id: number
  draft: string | null
  skipped: boolean
  staff_note: string | null
  category: string | null
  parent_text: string | null
  sent_text: string | null
  sent_at: string | null
  accepted_at: string | null
  gap_resolved_at: string | null
  reviewed_at: string | null
}

const COLUMNS =
  'id, created_at, chat_id, draft, skipped, staff_note, category, parent_text, sent_text, sent_at, accepted_at, gap_resolved_at, reviewed_at'

const CATEGORIES = Object.keys(CATEGORY_LABELS)
// The most recent drafts the page looks at.
export const LEARNING_WINDOW = 400

function rowOf(row: RawRow): DraftRow {
  return {
    id: row.id,
    createdAt: row.created_at,
    chatId: row.chat_id,
    draft: row.draft,
    skipped: row.skipped,
    staffNote: row.staff_note,
    category: row.category && CATEGORIES.includes(row.category) ? (row.category as DraftCategory) : null,
    parentText: row.parent_text,
    sentText: row.sent_text,
    sentAt: row.sent_at,
    acceptedAt: row.accepted_at,
    gapResolvedAt: row.gap_resolved_at,
    reviewedAt: row.reviewed_at,
  }
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  return supabase
}

export async function fetchDraftRows(): Promise<DraftRow[]> {
  const { data, error } = await requireSupabase()
    .from('ai_drafts')
    .select(COLUMNS)
    .order('id', { ascending: false })
    .limit(LEARNING_WINDOW)
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => rowOf(row as RawRow))
}

// The reminder is done: every draft that asked for the same missing information is closed.
export async function resolveGap(note: string): Promise<void> {
  const { error } = await requireSupabase().rpc('resolve_ai_gap', {
    p_note: note,
  })
  if (error) {
    throw error
  }
}

// The sent reply was used as an example, or put away: it leaves the list.
export async function reviewExample(id: number): Promise<void> {
  const { error } = await requireSupabase().rpc('review_ai_example', {
    p_id: id,
  })
  if (error) {
    throw error
  }
}

// ---------------------------------------------------------------------------------------------------
// Comparing a draft with what was sent

// Two texts compared by the pairs of characters they share (works for Chinese as for English):
// 1 is the same text, 0 shares nothing.
export function similarity(a: string, b: string): number {
  const clean = (text: string) => text.replace(/\s+/g, '').toLowerCase()
  const left = clean(a)
  const right = clean(b)
  if (left === right) {
    return 1
  }
  if (left.length < 2 || right.length < 2) {
    return 0
  }
  const pairs = new Map<string, number>()
  for (let index = 0; index < left.length - 1; index += 1) {
    const pair = left.slice(index, index + 2)
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1)
  }
  let shared = 0
  for (let index = 0; index < right.length - 1; index += 1) {
    const pair = right.slice(index, index + 2)
    const count = pairs.get(pair) ?? 0
    if (count > 0) {
      pairs.set(pair, count - 1)
      shared += 1
    }
  }
  return (2 * shared) / (left.length - 1 + (right.length - 1))
}

// At or above this the team kept most of the draft and fixed it; below it they wrote their own.
export const EDITED_THRESHOLD = 0.55

export type Outcome = 'as-is' | 'edited' | 'replaced' | 'unused'

// What the team did with a draft: sent it as written, changed it, wrote something else, or has not
// answered the message (yet) or answered it somewhere this page cannot see.
export function outcomeOf(row: Pick<DraftRow, 'draft' | 'sentText' | 'skipped'>): Outcome {
  if (row.skipped || !row.draft || !row.sentText) {
    return 'unused'
  }
  const score = similarity(row.draft, row.sentText)
  if (score === 1) {
    return 'as-is'
  }
  return score >= EDITED_THRESHOLD ? 'edited' : 'replaced'
}

export type CategoryReport = {
  category: DraftCategory
  total: number
  asIs: number
  edited: number
  replaced: number
}

export type LearningReport = {
  // Drafts the AI wrote (not "no reply needed") in the window.
  drafts: number
  // Of those, how many the team has answered, and how.
  answered: number
  asIs: number
  edited: number
  replaced: number
  byCategory: CategoryReport[]
}

export function buildReport(rows: DraftRow[]): LearningReport {
  const report: LearningReport = {
    drafts: 0,
    answered: 0,
    asIs: 0,
    edited: 0,
    replaced: 0,
    byCategory: [],
  }
  const byCategory = new Map<DraftCategory, CategoryReport>()
  for (const row of rows) {
    if (row.skipped || !row.draft) {
      continue
    }
    report.drafts += 1
    const outcome = outcomeOf(row)
    if (outcome === 'unused') {
      continue
    }
    report.answered += 1
    if (outcome === 'as-is') {
      report.asIs += 1
    } else if (outcome === 'edited') {
      report.edited += 1
    } else {
      report.replaced += 1
    }
    const category = row.category ?? 'other'
    const entry = byCategory.get(category) ?? {
      category,
      total: 0,
      asIs: 0,
      edited: 0,
      replaced: 0,
    }
    entry.total += 1
    if (outcome === 'as-is') {
      entry.asIs += 1
    } else if (outcome === 'edited') {
      entry.edited += 1
    } else {
      entry.replaced += 1
    }
    byCategory.set(category, entry)
  }
  report.byCategory = [...byCategory.values()].sort((a, b) => b.total - a.total)
  return report
}

// A kind of question is a candidate for being answered without a person only when it is never one of
// the always-a-person kinds, there are enough answered drafts to trust the number, and nearly all of
// them went out as the AI wrote them. Nothing is sent automatically from this; it is a number to look at.
export const MIN_ANSWERED_FOR_AUTO = 30
export const MIN_SHARE_FOR_AUTO = 0.9

export function autoCandidate(entry: CategoryReport): boolean {
  return (
    !ALWAYS_PERSON.includes(entry.category) &&
    entry.total >= MIN_ANSWERED_FOR_AUTO &&
    entry.asIs / entry.total >= MIN_SHARE_FOR_AUTO
  )
}

// ---------------------------------------------------------------------------------------------------
// Reminders about missing information

export type Gap = {
  note: string
  count: number
  lastAt: string
  // One parent question that hit the gap, to show what was being asked.
  example: string | null
}

// The unresolved reminders, the same sentence counted together, the most often repeated first.
export function openGaps(rows: DraftRow[]): Gap[] {
  const gaps = new Map<string, Gap>()
  for (const row of rows) {
    const note = row.staffNote?.trim()
    if (!note || row.gapResolvedAt) {
      continue
    }
    const entry = gaps.get(note)
    if (entry) {
      entry.count += 1
      if (row.createdAt > entry.lastAt) {
        entry.lastAt = row.createdAt
      }
      entry.example = entry.example ?? row.parentText
    } else {
      gaps.set(note, {
        note,
        count: 1,
        lastAt: row.createdAt,
        example: row.parentText,
      })
    }
  }
  return [...gaps.values()].sort((a, b) => b.count - a.count || (a.lastAt < b.lastAt ? 1 : -1))
}

// ---------------------------------------------------------------------------------------------------
// Replies to learn from

export type Example = {
  id: number
  createdAt: string
  category: DraftCategory
  parentText: string | null
  draft: string
  sentText: string
  outcome: 'edited' | 'replaced'
}

// Drafts the team changed or replaced and nobody has looked at yet, the newest first. Replies that went
// out exactly as drafted teach nothing new, so they are not listed.
export function learnableExamples(rows: DraftRow[]): Example[] {
  const found: Example[] = []
  for (const row of rows) {
    if (row.reviewedAt || !row.draft || !row.sentText) {
      continue
    }
    const outcome = outcomeOf(row)
    if (outcome === 'edited' || outcome === 'replaced') {
      found.push({
        id: row.id,
        createdAt: row.createdAt,
        category: row.category ?? 'other',
        parentText: row.parentText,
        draft: row.draft,
        sentText: row.sentText,
        outcome,
      })
    }
  }
  return found
}

// The lines added to a note to teach the AI one example.
export function exampleBlock(example: Pick<Example, 'parentText' | 'sentText'>): string {
  const lines = ['例子（家长问 → 我们回）：']
  if (example.parentText) {
    lines.push(`家长：${example.parentText}`)
  }
  lines.push(`我们：${example.sentText}`)
  return lines.join('\n')
}

export function percent(part: number, whole: number): string {
  return whole === 0 ? '-' : `${Math.round((part / whole) * 100)}%`
}

// A small count after a tab's name, or nothing when there is nothing waiting.
export function countLabel(count: number): string {
  return count > 0 ? ` (${count})` : ''
}
