import { cn } from '../../lib/cn'
import type { ColumnHandleProps } from '../../hooks/useInboxColumns'

// One of the two lines between the Inbox's columns: drag it (or use the arrow keys) to make the column next
// to it wider or narrower, double-click it to put the width back. Sits over the columns' border, so the
// columns themselves keep their own layout.
export function ColumnHandle({ handle, className }: { handle: ColumnHandleProps; className?: string }) {
  const { column, value, min, max, ...events } = handle
  const label = column === 'list' ? 'Chat list width' : 'Details panel width'
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`${label}: drag to change, double-click to reset`}
      {...events}
      className={cn(
        'group absolute inset-y-0 z-20 hidden w-3 -translate-x-1/2 cursor-col-resize touch-none select-none outline-none',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-transparent transition-colors group-hover:bg-slate-300 group-focus-visible:bg-[#fc0c97] group-data-[active=true]:bg-[#fc0c97] motion-reduce:transition-none"
      />
    </div>
  )
}
