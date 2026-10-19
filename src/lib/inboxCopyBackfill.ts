import type { ChatwootClient } from './chatwootClient'
import type { Json } from '../types/database'
import type { ChatwootConversation, ChatwootMessage } from './whatsappInbox'
import { supabase } from './supabase'
import { copyChat, copyMessage, type CopyMessage } from '../../supabase/functions/chat-activity/copy'
import { addDays, dayOf } from '../../supabase/functions/team-replies/logic'

// "Copy old chats" (Team Replies page, admin only): reads every chat's history through the gateway and
// writes it into the inbox copy, then works out the kept days from it.
// - Carries on where it stopped: a chat read completely before, with nothing new since, is skipped; a chat
//   read before is only read back to the newest message already copied.
// - Running it twice changes nothing: the database keys messages by Chatwoot's id, and a day worked out
//   again replaces itself.

export type CopyProgress = {
  phase: 'listing' | 'chats' | 'days' | 'done'
  chatsTotal: number
  chatsDone: number
  chatsSkipped: number
  chatsFailed: number
  messages: number
  daysTotal: number
  daysDone: number
}

export type CopyStore = {
  state: () => Promise<Map<number, { copiedAt: number | null; needsCopy: boolean; newestMessageId: number | null }>>
  importChat: (accountId: number | null, chat: Json | null, messages: CopyMessage[], done: boolean) => Promise<void>
  firstMessageAt: () => Promise<string | null>
  computeDays: (first: string, last: string) => Promise<void>
}

const MAX_CONVERSATION_PAGES = 800
const MAX_MESSAGE_PAGES = 600
const MESSAGES_PER_SAVE = 400
const WORKERS = 3
const DAYS_PER_CALL = 31

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  return supabase
}

export const databaseCopyStore: CopyStore = {
  async state() {
    const { data, error } = await requireSupabase().rpc('inbox_copy_state')
    if (error) {
      throw error
    }
    return new Map(
      (data ?? []).map((row) => [
        row.conversation_id,
        {
          copiedAt: row.copied_at ? Date.parse(row.copied_at) / 1000 : null,
          needsCopy: row.needs_copy,
          newestMessageId: row.newest_message_id,
        },
      ]),
    )
  },
  async importChat(accountId, chat, messages, done) {
    const { error } = await requireSupabase().rpc('inbox_copy_import', {
      p_account: accountId,
      p_chat: chat,
      p_messages: messages as unknown as Json,
      p_done: done,
    })
    if (error) {
      throw error
    }
  },
  async firstMessageAt() {
    const { data, error } = await requireSupabase().rpc('inbox_copy_summary')
    if (error) {
      throw error
    }
    return data?.[0]?.first_message_at ?? null
  },
  async computeDays(first, last) {
    const { error } = await requireSupabase().rpc('team_reply_compute_range', { p_first: first, p_last: last })
    if (error) {
      throw error
    }
  },
}

function accountOf(conversation: ChatwootConversation) {
  const id = Number((conversation as { account_id?: unknown }).account_id)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

// One chat, newest messages first, back to `stopAtId` (already copied) or to its first message.
async function copyOneChat(
  client: ChatwootClient,
  store: CopyStore,
  conversation: ChatwootConversation,
  stopAtId: number | null,
  cancelled: () => boolean,
  onMessages: (count: number) => void,
) {
  const chat = copyChat(conversation) as unknown as Json
  const accountId = accountOf(conversation)
  let waiting: CopyMessage[] = []
  let before: number | undefined
  for (let page = 0; page < MAX_MESSAGE_PAGES && !cancelled(); page += 1) {
    const messages: ChatwootMessage[] = await client.listMessages(conversation.id, before)
    if (messages.length === 0) {
      break
    }
    for (const message of messages) {
      const row = copyMessage(message, conversation.id, conversation.inbox_id ?? null)
      if (row) {
        waiting.push(row)
      }
    }
    if (waiting.length >= MESSAGES_PER_SAVE) {
      await store.importChat(accountId, chat, waiting, false)
      onMessages(waiting.length)
      waiting = []
    }
    const oldest = messages.reduce((first, message) => (message.id < first.id ? message : first))
    if ((stopAtId !== null && oldest.id <= stopAtId) || (before !== undefined && oldest.id >= before)) {
      break
    }
    before = oldest.id
  }
  if (cancelled()) {
    // Not marked as read completely: the next run reads it again.
    if (waiting.length > 0) {
      await store.importChat(accountId, chat, waiting, false)
      onMessages(waiting.length)
    }
    return
  }
  await store.importChat(accountId, chat, waiting, true)
  onMessages(waiting.length)
}

function emptyProgress(): CopyProgress {
  return { phase: 'listing', chatsTotal: 0, chatsDone: 0, chatsSkipped: 0, chatsFailed: 0, messages: 0, daysTotal: 0, daysDone: 0 }
}

// Every finished day from the copy's first message to yesterday, worked out again from the copy (31 days a call).
// No chat is read: this is what to press when the copy is complete but the days are not.
async function workOutDays({
  store,
  progress,
  report,
  cancelled,
  now,
}: {
  store: CopyStore
  progress: CopyProgress
  report: () => void
  cancelled: () => boolean
  now: Date
}) {
  const firstAt = await store.firstMessageAt()
  if (!firstAt) {
    return
  }
  const yesterday = addDays(dayOf(Math.floor(now.getTime() / 1000)), -1)
  const firstDay = dayOf(Math.floor(Date.parse(firstAt) / 1000))
  const spanDays = (first: string, last: string) => Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1
  progress.phase = 'days'
  progress.daysTotal = firstDay <= yesterday ? spanDays(firstDay, yesterday) : 0
  progress.daysDone = 0
  report()
  let day = firstDay
  while (day <= yesterday && !cancelled()) {
    const last = addDays(day, DAYS_PER_CALL - 1) < yesterday ? addDays(day, DAYS_PER_CALL - 1) : yesterday
    await store.computeDays(day, last)
    progress.daysDone = Math.min(progress.daysTotal, progress.daysDone + spanDays(day, last))
    report()
    day = addDays(last, 1)
  }
}

export async function workOutAllDays({
  store = databaseCopyStore,
  onProgress,
  cancelled = () => false,
  now = new Date(),
}: {
  store?: CopyStore
  onProgress: (progress: CopyProgress) => void
  cancelled?: () => boolean
  now?: Date
}): Promise<CopyProgress> {
  const progress = emptyProgress()
  const report = () => onProgress({ ...progress })
  await workOutDays({ store, progress, report, cancelled, now })
  if (!cancelled()) {
    progress.phase = 'done'
    report()
  }
  return progress
}

export async function copyOldChats({
  client,
  store = databaseCopyStore,
  onProgress,
  cancelled = () => false,
  now = new Date(),
}: {
  client: ChatwootClient
  store?: CopyStore
  onProgress: (progress: CopyProgress) => void
  cancelled?: () => boolean
  now?: Date
}): Promise<CopyProgress> {
  const progress = emptyProgress()
  const report = () => onProgress({ ...progress })
  report()

  const state = await store.state()
  const conversations = new Map<number, ChatwootConversation>()
  for (let page = 1; page <= MAX_CONVERSATION_PAGES && !cancelled(); page += 1) {
    const { conversations: found } = await client.listConversations('all', page)
    if (found.length === 0) {
      break
    }
    for (const conversation of found) {
      conversations.set(conversation.id, conversation)
    }
    progress.chatsTotal = conversations.size
    report()
  }

  // What still needs reading: never read completely, marked by the nightly check, or active since.
  const todo: Array<{ conversation: ChatwootConversation; stopAtId: number | null }> = []
  for (const conversation of conversations.values()) {
    const known = state.get(conversation.id)
    if (known?.copiedAt && !known.needsCopy && conversation.last_activity_at <= known.copiedAt) {
      progress.chatsSkipped += 1
      continue
    }
    todo.push({ conversation, stopAtId: known?.copiedAt && !known.needsCopy ? known.newestMessageId : null })
  }
  progress.phase = 'chats'
  progress.chatsDone = progress.chatsSkipped
  report()

  let next = 0
  async function worker() {
    while (!cancelled()) {
      const index = next
      next += 1
      if (index >= todo.length) {
        return
      }
      const { conversation, stopAtId } = todo[index]
      const onMessages = (count: number) => {
        progress.messages += count
        report()
      }
      try {
        await copyOneChat(client, store, conversation, stopAtId, cancelled, onMessages)
      } catch {
        // One more try; a chat that still fails is left for the next run.
        try {
          await copyOneChat(client, store, conversation, stopAtId, cancelled, onMessages)
        } catch {
          progress.chatsFailed += 1
        }
      }
      progress.chatsDone += 1
      report()
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, () => worker()))
  if (cancelled()) {
    return progress
  }

  // Then every finished day from the first message on.
  await workOutDays({ store, progress, report, cancelled, now })
  if (!cancelled()) {
    progress.phase = 'done'
    report()
  }
  return progress
}
