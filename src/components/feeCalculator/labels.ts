import type { CycleTier } from '../../lib/feeCalculator/types'

// The words on the Fee Calculator's menus (English screens; the text for the parent stays in Chinese).
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const RATE_TIERS: { key: CycleTier; label: string }[] = [
  { key: 'monthly', label: 'Monthly' },
  { key: '3mo', label: '3 months at once' },
  { key: '6mo_plus', label: '6 months or more' },
]
