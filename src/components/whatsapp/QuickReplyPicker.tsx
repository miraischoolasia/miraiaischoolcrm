import { useEffect, useRef, useState } from 'react'
import { FileText, Image, MagnifyingGlass, VideoCamera } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { mediaKind, replyMedia, replyTexts, searchQuickReplies, type QuickReply } from '../../lib/quickReplies'

type QuickReplyPickerProps = {
  replies: QuickReply[]
  isLoading: boolean
  error: string | null
  onPick: (reply: QuickReply) => void
  onClose: () => void
  // Only for people who may edit them.
  onManage?: () => void
}

function MediaBadges({ reply }: { reply: QuickReply }) {
  const media = replyMedia(reply)
  if (media.length === 0) {
    return null
  }
  const kinds = [...new Set(media.map((item) => mediaKind(item.type)))]
  return (
    <span className="ml-2 inline-flex shrink-0 items-center gap-1 text-slate-500">
      {kinds.map((kind) =>
        kind === 'image' ? (
          <Image key={kind} size={13} aria-label="Has a photo" />
        ) : kind === 'video' ? (
          <VideoCamera key={kind} size={13} aria-label="Has a video" />
        ) : (
          <FileText key={kind} size={13} aria-label="Has a file" />
        ),
      )}
    </span>
  )
}

// A search box over the team's quick replies, opened from the bolt button.
export function QuickReplyPicker({ replies, isLoading, error, onPick, onClose, onManage }: QuickReplyPickerProps) {
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const results = searchQuickReplies(replies, query)
  const current = Math.min(highlighted, Math.max(0, results.length - 1))

  useEffect(() => {
    input.current?.focus()
  }, [])

  return (
    <div className="absolute inset-x-3 bottom-full z-20 mb-2 overflow-hidden sm:inset-x-4 rounded-xl border border-slate-200 bg-white shadow-lg">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <MagnifyingGlass size={16} className="text-slate-400" aria-hidden="true" />
        <input
          ref={input}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setHighlighted(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
            } else if (event.key === 'ArrowDown') {
              event.preventDefault()
              setHighlighted(Math.min(current + 1, results.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setHighlighted(Math.max(current - 1, 0))
            } else if (event.key === 'Enter' && !event.nativeEvent.isComposing && results[current]) {
              event.preventDefault()
              onPick(results[current])
            }
          }}
          placeholder="Search quick replies"
          aria-label="Search quick replies"
          className="min-w-0 flex-1 text-sm outline-none"
        />
        <button type="button" onClick={onClose} className="text-xs font-medium text-slate-500 hover:text-slate-800">
          Close
        </button>
      </div>

      <ul className="max-h-[12rem] overflow-y-auto" role="listbox" aria-label="Quick replies">
        {isLoading && <li className="px-3 py-3 text-sm text-slate-500">Loading...</li>}
        {!isLoading && error && <li className="px-3 py-3 text-sm text-red-600">{error}</li>}
        {!isLoading && !error && results.length === 0 && (
          <li className="px-3 py-3 text-sm text-slate-500">
            {replies.length === 0 ? 'No quick replies yet.' : 'No quick reply matches that.'}
          </li>
        )}
        {results.map((reply, index) => (
          <li key={reply.id} role="presentation">
            <button
              type="button"
              role="option"
              ref={(element) => {
                if (index === current) {
                  element?.scrollIntoView?.({ block: 'nearest' })
                }
              }}
              aria-selected={index === current}
              onClick={() => onPick(reply)}
              onMouseEnter={() => setHighlighted(index)}
              className={cn('block h-16 w-full overflow-hidden px-3 py-2 text-left', index === current ? 'bg-pink-50' : 'hover:bg-slate-50')}
            >
              <span className="flex items-center text-sm font-medium text-slate-900">
                <span className="truncate">{reply.title}</span>
                <MediaBadges reply={reply} />
              </span>
              {replyTexts(reply)[0] && (
                <span className="mt-0.5 line-clamp-1 block text-xs text-slate-500">
                  {replyTexts(reply)[0]}
                  {reply.steps.length > 1 && ` (+${reply.steps.length - 1} more)`}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {onManage && (
        <div className="border-t border-slate-100 px-3 py-2">
          <button type="button" onClick={onManage} className="text-xs font-semibold text-[#c2077a] hover:underline">
            Manage quick replies
          </button>
        </div>
      )}
    </div>
  )
}
