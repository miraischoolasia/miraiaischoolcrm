import { Check } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { CHANNEL_COLORS, SHORT_NAME_MAX, type ChannelLabel } from '../../lib/channelLabels'

// The short name and colour of one channel (a WhatsApp number, a Page), as the Inbox's channel bar, chat list and
// "Sending from" show it.
export function ChannelLabelFields({
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  value: ChannelLabel
  onChange: (next: ChannelLabel) => void
  // What shows when no short name is written (the last 4 digits, or the start of the name).
  placeholder: string
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Short name (up to {SHORT_NAME_MAX} characters)</span>
        <input
          value={value.shortName ?? ''}
          maxLength={SHORT_NAME_MAX}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onChange({ ...value, shortName: event.target.value })}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97] disabled:bg-slate-50"
        />
        <span className="mt-1 block text-xs text-slate-500">Shown on the Inbox's channel buttons and beside each chat.</span>
      </label>
      <div role="radiogroup" aria-label="Colour" className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-700">Colour</span>
        {CHANNEL_COLORS.map((entry) => {
          const on = value.color === entry.color
          return (
            <button
              key={entry.color}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={entry.name}
              title={entry.name}
              disabled={disabled}
              onClick={() => onChange({ ...value, color: on ? null : entry.color })}
              style={{ backgroundColor: entry.color }}
              className={cn('flex h-7 w-7 items-center justify-center rounded-full text-white', on && 'ring-2 ring-slate-900 ring-offset-2')}
            >
              {on && <Check size={14} weight="bold" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
