import { useState } from 'react'
import { CaretDown, ChatCircleText } from '@phosphor-icons/react'
import type { FirstMessage, SourceGuess } from '../../lib/chatLink'
import { formatDayLabel, formatMessageTime } from '../../lib/whatsappInbox'

type FirstMessageCardProps = {
  first: FirstMessage | null
  guess: SourceGuess
  // The chat has older messages that are not loaded, so this may not be the very first.
  hasOlder: boolean
  onLoadOlder: () => void
  // Only for people who may edit source rules. The phrase is what to start the rule from.
  onManageRules?: (phrase: string) => void
}

// "How they first contacted you": what the parent wrote first, so whoever adds
// the lead can tell which advert it came from.
export function FirstMessageCard({ first, guess, hasOlder, onLoadOlder, onManageRules }: FirstMessageCardProps) {
  const guessed = [guess.source?.label, ...guess.tags.map((tag) => tag.label)].filter(Boolean)
  // Closed until someone wants to read it, so the form is what they see first.
  const [isOpen, setIsOpen] = useState(false)

  return (
    <section className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950">
      <h4>
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          className="flex w-full items-center gap-1.5 text-left font-semibold"
        >
          <ChatCircleText size={14} aria-hidden="true" />
          <span className="flex-1">How they first contacted you</span>
          <CaretDown size={12} aria-hidden="true" className={isOpen ? 'rotate-180 transition' : 'transition'} />
        </button>
      </h4>
      {isOpen && (
        <div>
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
            {guess.rule
              ? `Matched your rule "${guess.rule}": ${guessed.join(', ') || 'nothing to pick'}.`
              : guessed.length > 0
                ? `Looks like it came from: ${guessed.join(', ')}.`
                : "Can't tell where they came from. Choose the source yourself."}
          </p>
          {onManageRules && (
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-medium">
              {first?.text && !guess.rule && (
                <button type="button" onClick={() => onManageRules(first.text)} className="underline hover:text-sky-700">
                  Make a rule from this message
                </button>
              )}
              <button type="button" onClick={() => onManageRules('')} className="underline hover:text-sky-700">
                Source rules
              </button>
            </p>
          )}
        </div>
      )}
    </section>
  )
}
