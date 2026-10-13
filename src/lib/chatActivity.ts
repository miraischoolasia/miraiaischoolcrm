import { supabase } from './supabase'

// The address the WhatsApp inbox (Chatwoot) calls for every message, so the CRM knows when a parent
// last wrote and when the team last wrote. Two automation triggers read it: "a parent has not
// replied" and "a parent is waiting for a reply".

export type ChatWebhookInfo = {
  // The secret part of the address; only an admin can read it.
  key: string
  // When a message last arrived, or null if none has yet.
  lastReceivedAt: Date | null
  // How many chats are known.
  chats: number
}

type InfoRow = { webhook_key: string; last_received_at: string | null; chats: number }

export async function fetchChatWebhookInfo(): Promise<ChatWebhookInfo> {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  const { data, error } = await supabase.rpc('chat_webhook_info')
  if (error) {
    throw error
  }
  const row = (Array.isArray(data) ? data[0] : data) as InfoRow | null | undefined
  if (!row?.webhook_key) {
    throw new Error('The address is not set up in the database yet.')
  }
  return {
    key: row.webhook_key,
    lastReceivedAt: row.last_received_at ? new Date(row.last_received_at) : null,
    chats: row.chats ?? 0,
  }
}

// The whole address to paste into Chatwoot.
export function chatWebhookAddress(key: string, baseUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL) {
  const base = (baseUrl ?? '').trim().replace(/\/+$/, '')
  if (!base) {
    return ''
  }
  return `${base}/functions/v1/chat-activity?key=${encodeURIComponent(key)}`
}

// "just now", "5 minutes ago", "3 hours ago", "2 days ago".
export function describeAgo(time: Date, now: Date = new Date()) {
  const minutes = Math.max(0, Math.round((now.getTime() - time.getTime()) / 60000))
  if (minutes < 1) {
    return 'just now'
  }
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }
  const hours = Math.round(minutes / 60)
  if (hours < 48) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  const days = Math.round(hours / 24)
  return `${days} days ago`
}

// A message that arrived in the last day shows the link as working; older means nothing has come for a
// while (a quiet day is possible, but the admin should look).
export function isWebhookRecent(lastReceivedAt: Date | null, now: Date = new Date()) {
  return lastReceivedAt !== null && now.getTime() - lastReceivedAt.getTime() < 24 * 60 * 60 * 1000
}

export function chatWebhookErrorMessage(problem: unknown) {
  const text =
    problem instanceof Error
      ? problem.message
      : typeof problem === 'object' && problem && 'message' in problem
        ? String((problem as { message: unknown }).message)
        : ''
  if (/chat_webhook_info/.test(text) && /(does not exist|schema cache|Could not find)/.test(text)) {
    return 'Parent replies are not set up in the database yet.'
  }
  if (/Only an admin/i.test(text)) {
    return 'Only an admin can see this.'
  }
  return "Couldn't load the address."
}
