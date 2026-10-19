import { X } from '@phosphor-icons/react'
import { cn } from '../lib/cn'
import { DEFAULT_TAG_COLOR, isTagColor } from '../lib/leadTags'
import type { LeadOption } from '../types/domain'

// A tag as a small coloured pill. With `onRemove` it has an x to take it off.
// A long name shows in full on hover. Where it can be taken off (the lead's own tags) the name wraps
// instead of being cut, so it can be read on a phone too; in lists it stays on one line.
// compact: the Inbox's small size (chat list and side panel), so more fit on a line; a long name is cut
// (the whole name on hover).
export function LeadTagChip({
  tag,
  onRemove,
  compact = false,
}: {
  tag: Pick<LeadOption, 'label' | 'color' | 'isActive'>
  onRemove?: () => void
  compact?: boolean
}) {
  const color = tag.color && isTagColor(tag.color) ? tag.color : DEFAULT_TAG_COLOR

  return (
    <span
      title={tag.label}
      className={cn(
        'inline-flex max-w-full items-center border font-semibold text-slate-700',
        compact ? 'h-[18px] max-w-[10rem] gap-1 px-1.5 text-[10.5px] leading-none' : 'gap-1.5 px-2 py-0.5 text-xs',
        onRemove && !compact ? 'rounded-xl' : 'rounded-full',
      )}
      style={{ backgroundColor: `${color}1f`, borderColor: `${color}66` }}
    >
      <span
        aria-hidden="true"
        className={cn('shrink-0 rounded-full', compact ? 'h-1.5 w-1.5' : 'h-2 w-2')}
        style={{ backgroundColor: color }}
      />
      <span className={onRemove && !compact ? 'min-w-0 [overflow-wrap:anywhere]' : 'min-w-0 truncate'}>{tag.label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove tag ${tag.label}`}
          // min-h-0: phones make every button 40px tall, which made the whole pill tall.
          className="-mr-0.5 shrink-0 rounded-full p-0.5 text-slate-500 transition min-h-0! hover:bg-white hover:text-slate-800"
        >
          <X size={10} weight="bold" aria-hidden="true" />
        </button>
      )}
    </span>
  )
}
