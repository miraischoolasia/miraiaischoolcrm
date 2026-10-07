import type { LeadCheckSlot, LeadOption } from '../types/domain'

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

export function isTagColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

export const CHECK_SLOTS: LeadCheckSlot[] = [1, 2, 3]

export type CheckColumn = { slot: LeadCheckSlot; label: string; option: LeadOption }

// The three tick columns, in order, named as the admin named them. Empty before
// the database has them, so the list shows no columns that could not be saved.
export function getCheckColumns(options: LeadOption[]): CheckColumn[] {
  return CHECK_SLOTS.flatMap((slot) => {
    const option = options.find((entry) => entry.kind === 'check' && entry.legacyKey === `check_${slot}`)
    return option ? [{ slot, label: option.label, option }] : []
  })
}

// 'on' = ticked, 'off' = not ticked, 'all' = no filter.
export type CheckFilter = 'all' | 'on' | 'off'
