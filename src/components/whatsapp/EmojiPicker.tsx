import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import { EMOJI_GROUPS, readRecentEmoji } from '../../lib/emoji'

type EmojiPickerProps = {
  onPick: (emoji: string) => void
  onClose: () => void
}

// A small panel of emoji above the message box. It stays open so several can be added.
export function EmojiPicker({ onPick, onClose }: EmojiPickerProps) {
  const [groupId, setGroupId] = useState(() => (readRecentEmoji().length > 0 ? 'recent' : EMOJI_GROUPS[0].id))
  const recent = readRecentEmoji()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function closeOutside(event: MouseEvent) {
      const target = event.target as Node
      if (panel.current && !panel.current.contains(target) && !(target as HTMLElement).closest?.('[data-emoji-toggle]')) {
        onClose()
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  const groups = [
    ...(recent.length > 0 ? [{ id: 'recent', label: 'Recently used', icon: '🕘', emojis: recent }] : []),
    ...EMOJI_GROUPS,
  ]
  const group = groups.find((entry) => entry.id === groupId) ?? groups[0]

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label="Emoji"
      className="absolute bottom-full right-0 z-20 mb-2 w-[300px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
    >
      <div className="flex gap-0.5 border-b border-slate-100 px-1.5 py-1" role="tablist">
        {groups.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.id === group.id}
            aria-label={entry.label}
            title={entry.label}
            onClick={() => setGroupId(entry.id)}
            className={cn('rounded-lg px-2 py-1 text-lg leading-none', entry.id === group.id ? 'bg-pink-50' : 'hover:bg-slate-50')}
          >
            {entry.icon}
          </button>
        ))}
      </div>
      <p className="px-3 pt-2 text-[11px] font-medium text-slate-500">{group.label}</p>
      <div className="grid max-h-44 grid-cols-8 gap-0.5 overflow-y-auto p-2">
        {group.emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={emoji}
            onClick={() => onPick(emoji)}
            className="rounded-md p-1 text-xl leading-none hover:bg-slate-100"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
