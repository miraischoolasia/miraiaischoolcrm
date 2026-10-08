import { ChatCircleText } from '@phosphor-icons/react'
import type { FirstMessage, SourceGuess } from '../../lib/chatLink'
import { formatDayLabel, formatMessageTime } from '../../lib/whatsappInbox'

type FirstMessageCardProps = {
  first: FirstMessage | null
  guess: SourceGuess
  // The chat has older messages that are not loaded, so this may not be the very first.
  hasOlder: boolean
  onLoadOlder: () => void
}

// "How they first contacted you": what the parent wrote first, so whoever adds
// the lead can tell which advert it came from.
export function FirstMessageCard({ first, guess, hasOlder, onLoadOlder }: FirstMessageCardProps) {
  const guessed = [guess.source?.label, ...guess.tags.map((tag) => tag.label)].filter(Boolean)

  return (
    <section className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950">
      <h4 className="flex items-center gap-1.5 font-semibold">
        <ChatCircleText size={14} aria-hidden="true" />
        How they first contacted you
      </h4>
      {first ? (
        <>
          <p className="mt-2 whitespace-pre-wrap break-words rounded-md bg-white px-2.5 py-2 text-sm text-slate-900">
            {first.text || first.attachments.join(', ') || 'No words in this message.'}
          </p>
          {first.text && first.attachments.length > 0 && <p className="mt-1">With: {first.attachments.join(', ')}</p>}
          <p className="mt-1 text-sky-800">
            {formatDayLabel(first.at)}, {formatMessageTime(first.at)}
          </p>
        </>
      ) : (
        <p className="mt-2">The parent has not written yet.</p>
      )}
      {hasOlder && (
        <button type="button" onClick={onLoadOlder} className="mt-2 font-medium underline hover:text-sky-700">
          Show earlier messages to find the first one
        </button>
      )}
      <p className="mt-2">
        {guessed.length > 0
          ? `Looks like it came from: ${guessed.join(', ')}.`
          : "Can't tell where they came from. Choose the source yourself."}
      </p>
    </section>
  )
}
