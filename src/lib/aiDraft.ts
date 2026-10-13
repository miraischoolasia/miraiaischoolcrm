import { supabase } from './supabase'
import type { ChatwootMessage } from './whatsappInbox'
import { waIdOf } from './waActions'

// AI reply drafts: the last messages of a chat go to the `ai-draft` function, which asks the AI for the
// reply the team would write next. It comes back as a suggestion shown in grey in the message box;
// nothing is ever sent without a person.

export type AiDraftContext = {
  childName: string | null
  childAge: number | null
  // Who is writing, so the reply can introduce them.
  teamName: string | null
}

export type AiDraftSuggestion = { id: number | null; text: string; note: string }

export type AiDraftOutcome =
  { kind: 'draft'; suggestion: AiDraftSuggestion } | { kind: 'skip' } | { kind: 'error'; message: string }

// replyTo is the message this one quotes in WhatsApp: a bare "Yes" only means something next to the
// question it answers.
type RequestMessage = { from: 'parent' | 'team'; text: string; replyTo?: string }

export type AiDraftBody = {
  chatId: number
  lastMessageId: number
  messages: RequestMessage[]
  child: { name: string | null; age: number | null } | null
  teamName: string | null
  regenerate: boolean
}

// Phone numbers and email addresses typed in a chat stay on this computer.
export function scrubText(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\+?\d[\d\s-]{6,}\d/g, (match) => (match.replace(/\D/g, '').length >= 8 ? '[number]' : match))
}

const MAX_MESSAGES = 20

function textOf(message: ChatwootMessage): string {
  const written = (message.content ?? '').trim()
  if (written) {
    return scrubText(written).slice(0, 1500)
  }
  return message.attachments && message.attachments.length > 0 ? '[photo, video, voice or file]' : ''
}

function isConversationMessage(message: ChatwootMessage): boolean {
  return (
    !message.private &&
    (message.message_type === 0 || message.message_type === 1) &&
    message.content_attributes?.deleted !== true
  )
}

// The parent's last message when the team has not answered it yet and it says something in words;
// otherwise null (the team spoke last, or the parent only sent a photo or a voice message).
export function messageNeedingReply(messages: ChatwootMessage[]): ChatwootMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!isConversationMessage(message)) {
      continue
    }
    return message.message_type === 0 && (message.content ?? '').trim() !== '' ? message : null
  }
  return null
}

export function buildDraftBody(
  conversationId: number,
  messages: ChatwootMessage[],
  context: AiDraftContext,
  regenerate: boolean,
): AiDraftBody | null {
  const target = messageNeedingReply(messages)
  if (!target) {
    return null
  }
  const byId = new Map(messages.map((entry) => [entry.id, entry]))
  const byWaId = new Map(
    messages.flatMap((entry) => {
      const waId = waIdOf(entry.source_id)
      return waId ? [[waId, entry] as const] : []
    }),
  )
  const history: RequestMessage[] = []
  for (const message of messages) {
    if (!isConversationMessage(message)) {
      continue
    }
    const text = textOf(message)
    if (text) {
      const attributes = message.content_attributes
      const quoted =
        (attributes?.in_reply_to ? byId.get(attributes.in_reply_to) : undefined) ??
        (attributes?.in_reply_to_external_id ? byWaId.get(attributes.in_reply_to_external_id) : undefined)
      const replyTo = quoted ? textOf(quoted).slice(0, 300) : ''
      history.push({
        from: message.message_type === 0 ? 'parent' : 'team',
        text,
        ...(replyTo ? { replyTo } : {}),
      })
    }
  }
  const hasChild = Boolean(context.childName) || context.childAge !== null
  return {
    chatId: conversationId,
    lastMessageId: target.id,
    messages: history.slice(-MAX_MESSAGES),
    child: hasChild ? { name: context.childName, age: context.childAge } : null,
    teamName: context.teamName,
    regenerate,
  }
}

async function messageOfFailure(failure: unknown): Promise<string> {
  const fallback = "Couldn't get a reply suggestion. Try again in a moment."
  const context = (failure as { context?: unknown } | null)?.context
  if (context && typeof (context as Response).json === 'function') {
    try {
      const body = (await (context as Response).clone().json()) as { error?: unknown }
      if (typeof body.error === 'string' && body.error) {
        return body.error
      }
    } catch {
      // The answer was not JSON; use the general sentence.
    }
  }
  if (failure instanceof Error && /not found|FunctionsFetchError|Failed to send/i.test(failure.message)) {
    return 'AI reply suggestions are not switched on yet.'
  }
  return fallback
}

export async function requestAiDraft(body: AiDraftBody): Promise<AiDraftOutcome> {
  if (!supabase) {
    return { kind: 'error', message: 'Not connected to the database.' }
  }
  try {
    const { data, error } = await supabase.functions.invoke('ai-draft', { body })
    if (error) {
      return { kind: 'error', message: await messageOfFailure(error) }
    }
    const answer = data as {
      ok?: boolean
      error?: string
      id?: number | null
      reply?: string
      skip?: boolean
      staffNote?: string
    }
    if (!answer || answer.ok !== true) {
      return { kind: 'error', message: answer?.error || "Couldn't get a reply suggestion. Try again in a moment." }
    }
    const reply = typeof answer.reply === 'string' ? answer.reply.trim() : ''
    if (answer.skip === true || reply === '') {
      return { kind: 'skip' }
    }
    return {
      kind: 'draft',
      suggestion: {
        id: typeof answer.id === 'number' ? answer.id : null,
        text: reply,
        note: typeof answer.staffNote === 'string' ? answer.staffNote : '',
      },
    }
  } catch (failure) {
    return { kind: 'error', message: await messageOfFailure(failure) }
  }
}

// Records that someone used a suggestion, so how often it helps can be measured. Never blocks writing.
export async function markAiDraftAccepted(id: number): Promise<void> {
  if (!supabase) {
    return
  }
  try {
    await supabase.rpc('mark_ai_draft_accepted', { p_id: id })
  } catch {
    // Only a statistic; losing it changes nothing for the person writing.
  }
}
