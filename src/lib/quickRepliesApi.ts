import { supabase } from './supabase'
import { parseMedia, type QuickReply, type QuickReplyMedia } from './quickReplies'

const BUCKET = 'quick-reply-media'

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  return supabase
}

// Turns a database failure into something the team can act on.
export function quickReplyErrorMessage(error: unknown, fallback: string) {
  const { code, message } = (error ?? {}) as { code?: string; message?: string }
  if (code === '23505') {
    return 'A quick reply with that title already exists.'
  }
  if (code === '42P01' || code === 'PGRST205' || message?.includes('quick_replies')) {
    return 'Quick replies are not set up yet. Ask the admin to update the database.'
  }
  if (code === '42501') {
    return 'Your account is not allowed to change quick replies.'
  }
  return message || fallback
}

export async function fetchQuickReplies(): Promise<QuickReply[]> {
  const { data, error } = await requireSupabase()
    .from('quick_replies')
    .select('id, title, messages, media, is_active')
    .order('title', { ascending: true })

  if (error) {
    throw error
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    messages: row.messages,
    media: parseMedia(row.media),
    isActive: row.is_active,
  }))
}

export type QuickReplyDraft = {
  title: string
  messages: string[]
  isActive: boolean
  // Files already stored that stay, and new ones to store.
  keep: QuickReplyMedia[]
  add: File[]
}

async function removeFiles(paths: string[]) {
  if (paths.length > 0) {
    await requireSupabase().storage.from(BUCKET).remove(paths)
  }
}

// Stores the new files, then saves the reply. If saving fails, the files just
// stored are taken back; if it works, files that were dropped are deleted.
export async function saveQuickReply(existing: QuickReply | null, draft: QuickReplyDraft) {
  const client = requireSupabase()
  const uploaded: QuickReplyMedia[] = []

  try {
    for (const file of draft.add) {
      const extension = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
      const path = `${crypto.randomUUID()}.${extension}`
      const { error } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type })
      if (error) {
        throw error
      }
      uploaded.push({ path, name: file.name, type: file.type, size: file.size })
    }

    const row = {
      title: draft.title.trim(),
      messages: draft.messages,
      is_active: draft.isActive,
      media: [...draft.keep, ...uploaded],
    }
    const { error } = existing
      ? await client.from('quick_replies').update(row).eq('id', existing.id)
      : await client.from('quick_replies').insert(row)
    if (error) {
      throw error
    }
  } catch (error) {
    await removeFiles(uploaded.map((item) => item.path)).catch(() => undefined)
    throw error
  }

  if (existing) {
    const kept = new Set(draft.keep.map((item) => item.path))
    await removeFiles(existing.media.filter((item) => !kept.has(item.path)).map((item) => item.path)).catch(
      () => undefined,
    )
  }
}

export async function deleteQuickReply(reply: QuickReply) {
  const { error } = await requireSupabase().from('quick_replies').delete().eq('id', reply.id)
  if (error) {
    throw error
  }
  await removeFiles(reply.media.map((item) => item.path)).catch(() => undefined)
}

// Downloads a stored attachment as a File, ready to go out with the message.
export async function downloadQuickReplyMedia(media: QuickReplyMedia): Promise<File> {
  const { data, error } = await requireSupabase().storage.from(BUCKET).download(media.path)
  if (error || !data) {
    throw error ?? new Error(`Could not load ${media.name}.`)
  }
  return new File([data], media.name, { type: media.type })
}
