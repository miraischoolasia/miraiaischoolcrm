import { cn } from '../../lib/cn'

export function Avatar({
  initials,
  tone,
  size = 'md',
  className,
}: {
  initials: string
  tone: string
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'sm' ? 'h-7 w-7 text-[11px]' : 'h-9 w-9 text-xs',
        tone,
        className,
      )}
    >
      {initials}
    </span>
  )
}
