import { guessSourceAndTags, type SourceGuess } from './chatLink'
import type { SourceRule } from './sourceRules'
import type { LeadOption } from '../types/domain'
import type { ChatwootMessage } from './whatsappInbox'

// A chat whose first message matches a source rule becomes a lead by itself. Chats whose first message
// came before this moment (seconds since epoch) are left alone. It is 0: the chats that were already
// there are looked at too, as long as they are open, not a lead, not a student and have a real number.
export const AUTO_LEADS_FROM = 0

// What to make a lead from, or null when this chat should not become one by itself: the first thing in the
// chat must be a message from the parent (not one the school started), written after the cut-off, and
// must match one of the source rules.
export function autoLeadFor(
  messages: ChatwootMessage[],
  options: LeadOption[],
  rules: SourceRule[],
  from: number = AUTO_LEADS_FROM,
): { guess: SourceGuess; rule: string; firstText: string } | null {
  const first = [...messages]
    .sort((a, b) => a.created_at - b.created_at)
    .find(
      (message) =>
        (message.message_type === 0 || message.message_type === 1) && !message.private && !message.content_attributes?.deleted,
    )
  if (!first || first.message_type !== 0 || first.created_at < from) {
    return null
  }
  const text = (first.content ?? '').trim()
  const guess = guessSourceAndTags(text, options, rules)
  if (!guess.rule) {
    return null
  }
  return { guess, rule: guess.rule, firstText: text }
}
