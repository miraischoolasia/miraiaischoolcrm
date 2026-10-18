import type { ChatwootMessage } from './whatsappInbox'

// Looking for words: in the open chat, and the yellow marks the found words get.

export type TextPart = { text: string; match: boolean }

// The text cut into pieces, the ones that are the searched words marked. Upper and lower case do not matter.
export function splitHighlight(text: string, query: string): TextPart[] {
  const wanted = query.trim().toLowerCase()
  if (!wanted || !text) {
    return [{ text, match: false }]
  }
  const lowered = text.toLowerCase()
  const parts: TextPart[] = []
  let from = 0
  for (;;) {
    const at = lowered.indexOf(wanted, from)
    if (at === -1) {
      break
    }
    if (at > from) {
      parts.push({ text: text.slice(from, at), match: false })
    }
    parts.push({ text: text.slice(at, at + wanted.length), match: true })
    from = at + wanted.length
  }
  if (from < text.length) {
    parts.push({ text: text.slice(from), match: false })
  }
  if (!parts.some((part) => part.match)) {
    return splitHighlightDigits(text, wanted) ?? [{ text, match: false }]
  }
  return parts
}

// A phone number is found whatever the spaces and dashes: "123456" marks the "12-345 6" of "+60 12-345 6789".
function splitHighlightDigits(text: string, wanted: string): TextPart[] | null {
  const digits = wanted.replace(/\D/g, '')
  if (digits.length < 3 || !/^[\d\s+()-]+$/.test(wanted)) {
    return null
  }
  const positions: number[] = []
  let all = ''
  for (let index = 0; index < text.length; index += 1) {
    if (/\d/.test(text[index])) {
      positions.push(index)
      all += text[index]
    }
  }
  const at = all.indexOf(digits)
  if (at === -1) {
    return null
  }
  const first = positions[at]
  const last = positions[at + digits.length - 1] + 1
  return [
    ...(first > 0 ? [{ text: text.slice(0, first), match: false }] : []),
    { text: text.slice(first, last), match: true },
    ...(last < text.length ? [{ text: text.slice(last), match: false }] : []),
  ]
}

// The ids of the messages that hold the words, oldest first. textOf gives the words each message shows
// (an edited text, say); a message with no words is never found.
export function findMessageMatches(
  messages: ChatwootMessage[],
  query: string,
  textOf: (message: ChatwootMessage) => string,
) {
  const wanted = query.trim().toLowerCase()
  if (!wanted) {
    return []
  }
  return messages
    .filter((message) => !message.content_attributes?.deleted && message.message_type !== 2)
    .filter((message) => textOf(message).toLowerCase().includes(wanted))
    .sort((a, b) => a.created_at - b.created_at || a.id - b.id)
    .map((message) => message.id)
}
