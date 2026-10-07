import { X } from '@phosphor-icons/react'
import { DEFAULT_TAG_COLOR, isTagColor } from '../lib/leadTags'
import type { LeadOption } from '../types/domain'

// A tag as a small coloured pill. With `onRemove` it has an x to take it off.
export function LeadTagChip({
  tag,
  onRemove,
}: {
  tag: Pick<LeadOption, 'label' | 'color' | 'isActive'>
  onRemove?: () => void
}) {
  const color = tag.color && isTagColor(tag.color) ? tag.color : DEFAULT_TAG_COLOR

  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold text-slate-700"
      style={{ backgroundColor: `${color}1f`, borderColor: `${color}66` }}
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{tag.label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove tag ${tag.label}`}
          className="-mr-0.5 rounded-full p-0.5 text-slate-500 transition hover:bg-white hover:text-slate-800"
        >
          <X size={10} weight="bold" aria-hidden="true" />
        </button>
      )}
    </span>
  )
}
