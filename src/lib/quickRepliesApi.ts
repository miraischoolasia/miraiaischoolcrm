import { supabase } from './supabase'
import { parseSteps, replyMedia, type QuickReply, type QuickReplyMedia, type QuickReplyStep } from './quickReplies'

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
    .select('id, title, steps, is_active')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true })

  if (error) {
    throw error
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    steps: parseSteps(row.steps),
    isActive: row.is_active,
  }))
}

// A row being edited: a text, a file already stored, or a file chosen just now.
export type QuickReplyDraftStep =
  | { kind: 'text'; text: string }
  | { kind: 'media'; media: QuickReplyMedia }
  | { kind: 'file'; file: File }

export type QuickReplyDraft = {
  title: string
  steps: QuickReplyDraftStep[]
  isActive: boolean
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
    const steps: QuickReplyStep[] = []
    for (const step of draft.steps) {
      if (step.kind === 'text') {
        steps.push({ kind: 'text', text: step.text })
      } else if (step.kind === 'media') {
        steps.push({ kind: 'media', media: step.media })
      } else {
        const { file } = step
        const extension = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
        const path = `${crypto.randomUUID()}.${extension}`
        const { error } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type })
        if (error) {
          throw error
        }
        const media = { path, name: file.name, type: file.type, size: file.size }
        uploaded.push(media)
        steps.push({ kind: 'media', media })
      }
    }

    const row = { title: draft.title.trim(), steps, is_active: draft.isActive }
    if (existing) {
      const { error } = await client.from('quick_replies').update(row).eq('id', existing.id)
      if (error) {
        throw error
      }
    } else {
      // A new reply goes to the end of the list.
      const { data: last } = await client
        .from('quick_replies')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
      const { error } = await client.from('quick_replies').insert({ ...row, sort_order: (last?.[0]?.sort_order ?? 0) + 10 })
      if (error) {
        throw error
      }
    }
  } catch (error) {
    await removeFiles(uploaded.map((item) => item.path)).catch(() => undefined)
    throw error
  }

  if (existing) {
    const kept = new Set(draft.steps.flatMap((step) => (step.kind === 'media' ? [step.media.path] : [])))
    await removeFiles(
      replyMedia(existing)
        .filter((item) => !kept.has(item.path))
        .map((item) => item.path),
    ).catch(() => undefined)
  }
}

// Saves the order the team dragged the quick replies into, for everyone.
export async function saveQuickReplyOrder(ids: number[]) {
  const client = requireSupabase()
  const results = await Promise.all(
    ids.map((id, index) => client.from('quick_replies').update({ sort_order: (index + 1) * 10 }).eq('id', id)),
  )
  const failed = results.find((result) => result.error)
  if (failed?.error) {
    throw failed.error
  }
}

export async function deleteQuickReply(reply: QuickReply) {
  const { error } = await requireSupabase().from('quick_replies').delete().eq('id', reply.id)
  if (error) {
    throw error
  }
  await removeFiles(replyMedia(reply).map((item) => item.path)).catch(() => undefined)
}

// Downloads a stored attachment as a File, ready to go out with the message.
export async function downloadQuickReplyMedia(media: QuickReplyMedia): Promise<File> {
  const { data, error } = await requireSupabase().storage.from(BUCKET).download(media.path)
  if (error || !data) {
    throw error ?? new Error(`Could not load ${media.name}.`)
  }
  return new File([data], media.name, { type: media.type })
}
