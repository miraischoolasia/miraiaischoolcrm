// Quick replies: ready-made WhatsApp messages with optional photos, videos or
// PDFs. This file holds the rules (search, filling in names, which files are
// allowed) apart from the screens so they are easy to test.

export type QuickReplyMedia = { path: string; name: string; type: string; size: number }

// One row of a quick reply: a text, or a file. Each is sent to the parent as its own message.
export type QuickReplyStep = { kind: 'text'; text: string } | { kind: 'media'; media: QuickReplyMedia }

export type QuickReply = {
  id: number
  title: string
  // In the order they are sent.
  steps: QuickReplyStep[]
  isActive: boolean
}

export const MAX_QUICK_REPLY_STEPS = 5
// The most WhatsApp accepts for a video or document.
export const MAX_QUICK_REPLY_FILE_BYTES = 16 * 1024 * 1024
export const QUICK_REPLY_FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'application/pdf']

export const QUICK_REPLY_VARIABLES = [
  { token: '{parent name}', label: 'Parent name' },
  { token: '{child name}', label: 'Child name' },
  { token: '{trial date}', label: 'Trial date' },
  { token: '{my name}', label: 'My name' },
] as const

export type VariableValues = Partial<Record<(typeof QUICK_REPLY_VARIABLES)[number]['token'], string>>

// Null when the file may be used, otherwise a plain reason it may not.
export function checkQuickReplyFile(file: Pick<File, 'type' | 'size' | 'name'>): string | null {
  if (!QUICK_REPLY_FILE_TYPES.includes(file.type)) {
    return `${file.name} is not a photo (PNG, JPG, WebP), an MP4 video or a PDF.`
  }
  if (file.size > MAX_QUICK_REPLY_FILE_BYTES) {
    return `${file.name} is over 16 MB, which WhatsApp will not take.`
  }
  return null
}

const VARIABLE_PATTERN = /\{(parent name|child name|trial date|my name)\}/gi

// Puts each known name in place of its {tag}. A tag with no value is left as
// it is, so the person sending can see what is still missing.
export function fillVariables(text: string, values: VariableValues) {
  return text.replace(VARIABLE_PATTERN, (match, name: string) => {
    const value = values[`{${name.toLowerCase()}}` as keyof VariableValues]?.trim()
    return value ? value : match
  })
}

// The {tags} still in the text, so a message is not sent with one in it.
export function unfilledVariables(text: string) {
  return [...new Set((text.match(VARIABLE_PATTERN) ?? []).map((match) => match.toLowerCase()))]
}

// Active replies matching what was typed, titles that start with it first.
export function searchQuickReplies(replies: QuickReply[], query: string) {
  const text = query.trim().toLowerCase()
  const active = replies.filter((reply) => reply.isActive)
  if (!text) {
    return active
  }
  const starts = (reply: QuickReply) => reply.title.toLowerCase().startsWith(text)
  return active
    .filter(
      (reply) =>
        reply.title.toLowerCase().includes(text) || replyTexts(reply).some((message) => message.toLowerCase().includes(text)),
    )
    .sort((a, b) => Number(starts(b)) - Number(starts(a)))
}

export function replyTexts(reply: Pick<QuickReply, 'steps'>) {
  return reply.steps.flatMap((step) => (step.kind === 'text' ? [step.text] : []))
}

export function replyMedia(reply: Pick<QuickReply, 'steps'>) {
  return reply.steps.flatMap((step) => (step.kind === 'media' ? [step.media] : []))
}

// The rows as stored in the database, ignoring anything malformed.
export function parseSteps(value: unknown): QuickReplyStep[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item): QuickReplyStep[] => {
    if (typeof item !== 'object' || item === null) {
      return []
    }
    const { kind, text, media } = item as Record<string, unknown>
    if (kind === 'text' && typeof text === 'string') {
      return [{ kind: 'text', text }]
    }
    if (kind === 'media') {
      const [parsed] = parseMedia([media])
      return parsed ? [{ kind: 'media', media: parsed }] : []
    }
    return []
  })
}

// Moves one item of a list to another place, for drag and drop.
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return list
  }
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

// The attachment list as stored in the database, ignoring anything malformed.
export function parseMedia(value: unknown): QuickReplyMedia[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) {
      return []
    }
    const { path, name, type, size } = item as Record<string, unknown>
    if (typeof path !== 'string' || typeof name !== 'string' || typeof type !== 'string') {
      return []
    }
    return [{ path, name, type, size: typeof size === 'number' ? size : 0 }]
  })
}

export function mediaKind(type: string): 'image' | 'video' | 'file' {
  if (type.startsWith('image/')) {
    return 'image'
  }
  if (type.startsWith('video/')) {
    return 'video'
  }
  return 'file'
}
