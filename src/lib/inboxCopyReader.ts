import { supabase } from './supabase'
import type { Json } from '../types/database'
import type { ChatwootConversation, ChatwootMessage } from './whatsappInbox'
import { copyChat, copyMessage } from '../../supabase/functions/chat-activity/copy'

// Reads the CRM's copy of the inbox (inbox_chats / inbox_messages) in the same shapes Chatwoot's API gives, so the
// Inbox page shows a copied chat exactly like one read from Chatwoot. Everything here may fail (no copy in this
// database yet, the connection down): the callers then read Chatwoot as before.

type Raw = Record<string, unknown>

function asRaw(value: unknown): Raw | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Raw) : null
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  return supabase
}

// A copied message, or null when it was copied before raw was kept (the caller reads Chatwoot instead).
export function messageFromCopy(raw: unknown): ChatwootMessage | null {
  const message = asRaw(raw)
  if (!message || typeof message.id !== 'number' || typeof message.message_type !== 'number' || typeof message.created_at !== 'number') {
    return null
  }
  return message as unknown as ChatwootMessage
}

// A copied chat with its newest message, or null when it has no raw yet.
export function conversationFromCopy(raw: unknown, lastMessage: unknown): ChatwootConversation | null {
  const chat = asRaw(raw)
  const meta = asRaw(chat?.meta)
  if (!chat || typeof chat.id !== 'number' || !meta || !asRaw(meta.sender)) {
    return null
  }
  return {
    ...(chat as unknown as ChatwootConversation),
    unread_count: typeof chat.unread_count === 'number' ? chat.unread_count : 0,
    waiting_since: typeof chat.waiting_since === 'number' ? chat.waiting_since : 0,
    last_non_activity_message: messageFromCopy(lastMessage),
  }
}

export type CopyCursor = { at: string; id: number }

// One page of chats with this status, newest activity first, after `cursor`.
export async function fetchCopyChats(status: 'open' | 'resolved', cursor: CopyCursor | null, limit = 25) {
  let query = requireSupabase()
    .from('inbox_chats')
    .select('conversation_id, last_activity_at, raw, last_message_raw', cursor ? undefined : { count: 'exact' })
    .eq('status', status)
    .not('raw', 'is', null)
    .order('last_activity_at', { ascending: false, nullsFirst: false })
    .order('conversation_id', { ascending: false })
    .limit(limit)
  if (cursor) {
    query = query.or(`last_activity_at.lt.${cursor.at},and(last_activity_at.eq.${cursor.at},conversation_id.lt.${cursor.id})`)
  }
  const { data, error, count } = await query
  if (error) {
    throw error
  }
  const rows = data ?? []
  const conversations = rows
    .map((row) => conversationFromCopy(row.raw, row.last_message_raw))
    .filter((conversation): conversation is ChatwootConversation => conversation !== null)
  const last = rows[rows.length - 1]
  return {
    conversations,
    next: rows.length === limit && last?.last_activity_at ? { at: last.last_activity_at, id: last.conversation_id } : null,
    total: count ?? null,
  }
}

// The newest messages of a chat (before the message `beforeId`), as Chatwoot pages them: 20 at a time.
// complete is false when a copied message has no raw yet: then Chatwoot has to be asked.
export async function fetchCopyMessages(conversationId: number, beforeId?: number, limit = 20) {
  let query = requireSupabase()
    .from('inbox_messages')
    .select('id, raw')
    .eq('conversation_id', conversationId)
    .order('id', { ascending: false })
    .limit(limit)
  if (beforeId !== undefined) {
    query = query.lt('id', beforeId)
  }
  const { data, error } = await query
  if (error) {
    throw error
  }
  const messages = (data ?? []).map((row) => messageFromCopy(row.raw))
  return {
    messages: messages.filter((message): message is ChatwootMessage => message !== null),
    complete: messages.every((message) => message !== null),
  }
}

// The newest messages of many chats in one request (at most 60 chats), so a chat opens at once.
export async function fetchRecentMessages(conversationIds: number[], perChat = 20) {
  const { data, error } = await requireSupabase().rpc('inbox_recent_messages', {
    p_conversation_ids: conversationIds.slice(0, 60),
    p_per_chat: perChat,
  })
  if (error) {
    throw error
  }
  const byChat = new Map<number, ChatwootMessage[]>()
  for (const row of data ?? []) {
    const message = messageFromCopy(row.raw)
    if (message) {
      byChat.set(row.conversation_id, [...(byChat.get(row.conversation_id) ?? []), message])
    }
  }
  return byChat
}

// Messages either side of one message (a search result), so the chat can open on it.
export async function fetchCopyMessagesAround(conversationId: number, messageId: number, each = 25) {
  const db = requireSupabase()
  const [older, newer] = await Promise.all([
    db.from('inbox_messages').select('id, raw').eq('conversation_id', conversationId).lte('id', messageId).order('id', { ascending: false }).limit(each),
    db.from('inbox_messages').select('id, raw').eq('conversation_id', conversationId).gt('id', messageId).order('id', { ascending: true }).limit(each),
  ])
  if (older.error || newer.error) {
    throw older.error ?? newer.error
  }
  return [...(older.data ?? []), ...(newer.data ?? [])]
    .map((row) => messageFromCopy(row.raw))
    .filter((message): message is ChatwootMessage => message !== null)
}

// Every chat of these contacts (any number), like Chatwoot's contact conversations.
export async function fetchCopyContactChats(contactIds: number[]) {
  const { data, error } = await requireSupabase()
    .from('inbox_chats')
    .select('conversation_id, inbox_id, status, raw')
    .in('contact_id', contactIds)
  if (error) {
    throw error
  }
  return (data ?? []).flatMap((row) => {
    const raw = asRaw(row.raw)
    if (!raw || row.inbox_id === null) {
      return []
    }
    return [{
      id: row.conversation_id,
      status: row.status ?? String(raw.status ?? ''),
      inbox_id: row.inbox_id,
      created_at: typeof raw.created_at === 'number' ? raw.created_at : undefined,
    }]
  })
}

export type CopySearchHit = { snippet: string; messageId: number | null }

// People and words, in every chat the person may read. hits: chat -> the best match (a message beats a name).
export async function searchCopy(query: string) {
  const { data, error } = await requireSupabase().rpc('inbox_search', { p_query: query, p_limit: 40 })
  if (error) {
    throw error
  }
  const hits = new Map<number, CopySearchHit>()
  const chats = new Map<number, ChatwootConversation>()
  for (const row of data ?? []) {
    const conversation = conversationFromCopy(row.chat, row.last_message)
    if (conversation) {
      chats.set(conversation.id, conversation)
    }
    if (row.kind === 'message' && row.message_id !== null && !hits.has(row.conversation_id)) {
      hits.set(row.conversation_id, { snippet: (row.snippet ?? '').trim(), messageId: row.message_id })
    }
  }
  return { hits, chats: [...chats.values()] }
}

// Writes what was just read from Chatwoot for one chat into the copy (a message the webhook missed, a delivery
// tick that changed). Never in the way: a failure is ignored.
export async function fillCopy(conversation: ChatwootConversation, messages: ChatwootMessage[]) {
  const chat = copyChat(conversation)
  if (!chat) {
    return
  }
  const rows = messages
    .map((message) => copyMessage(message, conversation.id, conversation.inbox_id ?? null))
    .filter((row) => row !== null)
  const accountId = Number((conversation as { account_id?: unknown }).account_id)
  const { error } = await requireSupabase().rpc('inbox_copy_fill', {
    p_account: Number.isSafeInteger(accountId) && accountId > 0 ? accountId : null,
    p_chat: chat as unknown as Json,
    p_messages: rows.slice(-200) as unknown as Json,
  })
  if (error) {
    throw error
  }
}

// Which of Chatwoot's messages the copy does not have, or has with another delivery tick or text.
export function copyIsBehind(copied: ChatwootMessage[], chatwoot: ChatwootMessage[]) {
  const known = new Map(copied.map((message) => [message.id, message]))
  return chatwoot.filter((message) => {
    const mine = known.get(message.id)
    return !mine || mine.status !== message.status || mine.content !== message.content || mine.source_id !== message.source_id
  })
}

// Every open chat of the copy the person may read (newest first), a thousand rows a request. Chats without
// Chatwoot's own shape yet are left out (see fillMissingCopyChats).
export async function fetchCopyOpenChats(max = 5000) {
  const db = requireSupabase()
  const found: ChatwootConversation[] = []
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await db
      .from('inbox_chats')
      .select('conversation_id, raw, last_message_raw')
      .eq('status', 'open')
      .not('raw', 'is', null)
      .order('last_activity_at', { ascending: false, nullsFirst: false })
      .order('conversation_id', { ascending: false })
      .range(from, from + 999)
    if (error) {
      throw error
    }
    const rows = data ?? []
    for (const row of rows) {
      const conversation = conversationFromCopy(row.raw, row.last_message_raw)
      if (conversation) {
        found.push(conversation)
      }
    }
    if (rows.length < 1000) {
      break
    }
  }
  return found
}

// Just enough of every open chat for the menu badges and the new-message bell (2026-10-23, EduHero was slow: every
// tab read every open chat whole, raw JSON and all, at start and every minute). The database picks the few fields
// out of the JSON, so a chat is about a tenth of a kilobyte here instead of several.
const BADGE_FIELDS = [
  'conversation_id',
  'inbox_id',
  'status',
  'unread:raw->unread_count',
  'waiting:raw->waiting_since',
  'activity:raw->last_activity_at',
  'channel:raw->meta->>channel',
  'sender_id:raw->meta->sender->id',
  'sender_name:raw->meta->sender->>name',
  'sender_phone:raw->meta->sender->>phone_number',
  'sender_identifier:raw->meta->sender->>identifier',
  'ghl_channel:raw->meta->sender->additional_attributes->>ghl_channel',
  'last_id:last_message_raw->id',
  'last_type:last_message_raw->message_type',
  'last_at:last_message_raw->created_at',
  'last_private:last_message_raw->private',
  'last_content:last_message_raw->>content',
].join(', ')

type BadgeRow = {
  conversation_id: number
  inbox_id: number | null
  status: string | null
  unread: unknown
  waiting: unknown
  activity: unknown
  channel: string | null
  sender_id: unknown
  sender_name: string | null
  sender_phone: string | null
  sender_identifier: string | null
  ghl_channel: string | null
  last_id: unknown
  last_type: unknown
  last_at: unknown
  last_private: unknown
  last_content: string | null
}

const asNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

// A badge row in Chatwoot's shape (what the counting and the bell read), or null when the chat has no shape yet.
export function conversationFromBadgeRow(row: BadgeRow): ChatwootConversation | null {
  const senderId = asNumber(row.sender_id)
  if (!senderId) {
    return null
  }
  const lastType = row.last_type === null || row.last_type === undefined ? null : asNumber(row.last_type)
  return {
    id: row.conversation_id,
    inbox_id: row.inbox_id ?? undefined,
    status: row.status ?? 'open',
    unread_count: asNumber(row.unread),
    waiting_since: asNumber(row.waiting),
    timestamp: asNumber(row.activity),
    last_activity_at: asNumber(row.activity),
    meta: {
      channel: row.channel ?? undefined,
      sender: {
        id: senderId,
        name: row.sender_name,
        phone_number: row.sender_phone,
        identifier: row.sender_identifier,
        additional_attributes: row.ghl_channel ? { ghl_channel: row.ghl_channel } : null,
      },
    },
    last_non_activity_message:
      lastType === null
        ? null
        : {
            id: asNumber(row.last_id),
            content: row.last_content,
            message_type: lastType,
            created_at: asNumber(row.last_at),
            private: row.last_private === true,
            status: 'sent',
          },
  }
}

// Every open chat this person may see, light (see BADGE_FIELDS), newest first.
export async function fetchBadgeChats(max = 5000) {
  const db = requireSupabase()
  const found: ChatwootConversation[] = []
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await db
      .from('inbox_chats')
      .select(BADGE_FIELDS)
      .eq('status', 'open')
      .not('raw', 'is', null)
      .order('last_activity_at', { ascending: false, nullsFirst: false })
      .order('conversation_id', { ascending: false })
      .range(from, from + 999)
    if (error) {
      throw error
    }
    const rows = (data ?? []) as unknown as BadgeRow[]
    for (const row of rows) {
      const conversation = conversationFromBadgeRow(row)
      if (conversation) {
        found.push(conversation)
      }
    }
    if (rows.length < 1000) {
      break
    }
  }
  return found
}

// The chats that changed since `sinceIso` (open or not), light: the badges catch up with these between whole reads.
export async function fetchBadgeChatsChangedSince(sinceIso: string, max = 1000) {
  const { data, error } = await requireSupabase()
    .from('inbox_chats')
    .select(BADGE_FIELDS)
    .gt('updated_at', sinceIso)
    .not('raw', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(max)
  if (error) {
    throw error
  }
  const rows = (data ?? []) as unknown as BadgeRow[]
  return {
    changed: rows.map(conversationFromBadgeRow).filter((conversation): conversation is ChatwootConversation => conversation !== null),
    complete: rows.length < max,
  }
}

// The chats that changed since `sinceIso` (open or not), whole: the Inbox page catches up with these when it is
// looked at again, instead of reading every open chat again.
export async function fetchCopyChatsChangedSince(sinceIso: string, max = 1000) {
  const { data, error } = await requireSupabase()
    .from('inbox_chats')
    .select('conversation_id, status, raw, last_message_raw')
    .gt('updated_at', sinceIso)
    .not('raw', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(max)
  if (error) {
    throw error
  }
  const rows = data ?? []
  return {
    changed: rows
      .map((row) => conversationFromCopy(row.raw, row.last_message_raw))
      .filter((conversation): conversation is ChatwootConversation => conversation !== null),
    // So many changed that some may be missing: read everything again instead.
    complete: rows.length < max,
  }
}

// Chats the copy has without Chatwoot's own shape (they were last active before the copy kept it). Until they have
// it, the copy cannot stand in for Chatwoot's list.
export async function fetchCopyChatsMissingShape(max = 5000) {
  const { data, error } = await requireSupabase()
    .from('inbox_chats')
    .select('conversation_id')
    .is('raw', null)
    .limit(max)
  if (error) {
    throw error
  }
  return new Set((data ?? []).map((row) => row.conversation_id))
}

// Gives those chats their shape from Chatwoot's list of chats (25 a page), with their newest message, so the copy
// can stand in for Chatwoot's list. One run reads each page once; only the chats missing it are written. Messages
// further back are not read (a chat's older messages come from Chatwoot when it is opened, as before).
export async function fillMissingCopyChats(
  client: { listConversations: (status: 'all', page: number) => Promise<{ conversations: ChatwootConversation[] }> },
  cancelled: () => boolean = () => false,
  maxPages = 200,
) {
  const missing = await fetchCopyChatsMissingShape()
  let filled = 0
  for (let page = 1; page <= maxPages && missing.size > 0 && !cancelled(); page += 1) {
    const { conversations } = await client.listConversations('all', page)
    if (conversations.length === 0) {
      break
    }
    const todo = conversations.filter((conversation) => missing.has(conversation.id))
    // A few at a time; a chat this person may not read (another number) is refused and left for someone who may.
    for (let start = 0; start < todo.length && !cancelled(); start += 5) {
      await Promise.all(
        todo.slice(start, start + 5).map((conversation) => {
          const newest = conversation.last_non_activity_message
          return fillCopy(conversation, newest ? [newest] : [])
            .then(() => {
              filled += 1
              missing.delete(conversation.id)
            })
            .catch(() => undefined)
        }),
      )
    }
  }
  return { filled, left: missing.size }
}

// The chats someone wrote in during the last `seconds` (from the copy), for Facebook's 24-hour rule.
export async function fetchRecentInboundChats(seconds: number) {
  const since = new Date(Date.now() - seconds * 1000).toISOString()
  const { data, error } = await requireSupabase()
    .from('inbox_messages')
    .select('conversation_id')
    .eq('message_type', 0)
    .gte('created_at', since)
    .limit(10000)
  if (error) {
    throw error
  }
  return new Set((data ?? []).map((row) => row.conversation_id))
}
