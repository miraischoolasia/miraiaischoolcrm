import type { LeadOption } from '../types/domain'

// Colours a tag can have. A new tag takes the first one no tag uses yet.
export const TAG_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
] as const

export const DEFAULT_TAG_COLOR = '#fc0c97'

export function nextTagColor(tags: LeadOption[]) {
  const used = new Set(tags.map((tag) => tag.color?.toLowerCase()))
  return TAG_COLORS.find((color) => !used.has(color)) ?? TAG_COLORS[tags.length % TAG_COLORS.length]
}

// The school's own order (Leads settings > Sources, PIC & Tags): shown names first, then hidden ones; within each,
// the dragged order, then the never-moved ones by id (how they were made). Every tag list follows it.
export function orderLeadOptions<T extends Pick<LeadOption, 'id' | 'isActive' | 'sortOrder'>>(options: T[]) {
  const rank = (option: T) => option.sortOrder ?? Number.MAX_SAFE_INTEGER
  return [...options].sort(
    (left, right) => Number(right.isActive) - Number(left.isActive) || rank(left) - rank(right) || left.id - right.id,
  )
}

// The new order after moving one name onto another's place (dragging) or one step (the arrows).
export function moveLeadOption(ids: number[], movedId: number, targetId: number) {
  const from = ids.indexOf(movedId)
  const to = ids.indexOf(targetId)
  if (from < 0 || to < 0 || from === to) return ids
  const next = [...ids]
  next.splice(from, 1)
  next.splice(to, 0, movedId)
  return next
}

export function isTagColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}
