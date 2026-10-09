import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

// One block of the side panel: a pink heading and a line above it, so the blocks read as a list.
export function PanelSection({
  title,
  aside,
  label,
  className,
  children,
}: {
  title: string
  // Small text at the right of the heading, such as a count.
  aside?: ReactNode
  label?: string
  className?: string
  children: ReactNode
}) {
  return (
    <section aria-label={label ?? title} className={cn('space-y-3 border-t border-pink-100 pt-4 text-xs', className)}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-[#be185d]">{title}</h4>
        {aside}
      </div>
      {children}
    </section>
  )
}
