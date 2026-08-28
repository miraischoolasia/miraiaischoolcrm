import { cn } from '../lib/cn'
import type { StatusTag } from '../domain/studentStatus'

export function StatusChip({ label, tone }: StatusTag) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide',
        tone === 'critical' && 'border-[#fecdd3] bg-[#fff1f8] text-[#be185d]',
        tone === 'healthy' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
      )}
    >
      {label}
    </span>
  )
}
