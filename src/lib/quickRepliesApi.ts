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

async function currentUserId() {
  const { data } = await requireSupabase().auth.getUser()
  if (!data.user) {
    throw new Error('Sign in again to save quick replies.')
  }
  return data.user.id
}

export async function fetchQuickReplies(): Promise<QuickReply[]> {
  type Row = { id: number; title: string; steps: unknown; is_active: boolean; owner_id: string | null; followup_step?: number | null }
  const read = (columns: string) =>
    requireSupabase()
      .from('quick_replies')
      .select(columns)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true }) as unknown as PromiseLike<{ data: Row[] | null; error: { code?: string } | null }>
  let { data, error } = await read('id, title, steps, is_active, owner_id, followup_step')
  // Before the follow-up templates (20261102500000) there is no followup_step.
  if (error?.code === '42703') {
    ;({ data, error } = await read('id, title, steps, is_active, owner_id'))
  }

  if (error) {
    throw error
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    steps: parseSteps(row.steps),
    isActive: row.is_active,
    ownerId: row.owner_id ?? null,
    followupStep: row.followup_step ?? null,
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
  // A new reply that only its writer sees. Left out for the team's replies; an existing reply keeps its owner.
  personal?: boolean
  // A follow-up template for this follow-up of a round (null: not a template). Left out: unchanged.
  followupStep?: number | null
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
  // A personal reply keeps its files under the person's own folder, which nobody else can read.
  const ownerId = existing ? (existing.ownerId ?? null) : draft.personal ? await currentUserId() : null

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
        const path = `${ownerId ? `u/${ownerId}/` : ''}${crypto.randomUUID()}.${extension}`
        const { error } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type })
        if (error) {
          throw error
        }
        const media = { path, name: file.name, type: file.type, size: file.size }
        uploaded.push(media)
        steps.push({ kind: 'media', media })
      }
    }

    const row = {
      title: draft.title.trim(),
      steps,
      is_active: draft.isActive,
      ...(draft.followupStep !== undefined ? { followup_step: draft.followupStep } : {}),
    }
    if (existing) {
      const { error } = await client.from('quick_replies').update(row).eq('id', existing.id)
      if (error) {
        throw error
      }
    } else {
      // A new reply goes to the end of its own list (the person's, or the team's).
      const scope = client.from('quick_replies').select('sort_order')
      const { data: last } = await (ownerId ? scope.eq('owner_id', ownerId) : scope.is('owner_id', null))
        .order('sort_order', { ascending: false })
        .limit(1)
      const { error } = await client
        .from('quick_replies')
        .insert({ ...row, owner_id: ownerId, sort_order: (last?.[0]?.sort_order ?? 0) + 10 })
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

// A copy of a quick reply, saved at once, for the team to change: "<title> (copy)" (or "(copy 2)"... when that
// title is taken), the same rows, and its own copies of the photos, videos and voice messages, so deleting or
// changing either one never takes the other's files. It stays in the same list (the team's, or the person's own).
export async function duplicateQuickReply(reply: QuickReply): Promise<QuickReply> {
  const client = requireSupabase()
  const ownerId = reply.ownerId ?? null
  const copied: string[] = []
  try {
    const steps: QuickReplyStep[] = []
    for (const step of reply.steps) {
      if (step.kind === 'text') {
        steps.push(step)
        continue
      }
      const extension = step.media.path.includes('.') ? step.media.path.split('.').pop() : 'bin'
      const path = `${ownerId ? `u/${ownerId}/` : ''}${crypto.randomUUID()}.${extension}`
      const { error } = await client.storage.from(BUCKET).copy(step.media.path, path)
      if (error) {
        throw error
      }
      copied.push(path)
      steps.push({ kind: 'media', media: { ...step.media, path } })
    }

    const scope = client.from('quick_replies').select('sort_order')
    const { data: last } = await (ownerId ? scope.eq('owner_id', ownerId) : scope.is('owner_id', null))
      .order('sort_order', { ascending: false })
      .limit(1)
    const sortOrder = (last?.[0]?.sort_order ?? 0) + 10
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const title = copyTitle(reply.title, attempt)
      const { data, error } = await client
        .from('quick_replies')
        .insert({ title, steps, is_active: reply.isActive, owner_id: ownerId, sort_order: sortOrder })
        .select('id')
        .single()
      if (!error && data) {
        return { id: data.id, title, steps, isActive: reply.isActive, ownerId }
      }
      // That title is taken: try the next number.
      if (error?.code !== '23505') {
        throw error
      }
    }
    throw new Error('There are too many copies of this quick reply already.')
  } catch (error) {
    await removeFiles(copied).catch(() => undefined)
    throw error
  }
}

// "Hello (copy)", then "Hello (copy 2)", "Hello (copy 3)"... A long title is cut so the whole fits in 80 letters.
export function copyTitle(title: string, attempt: number) {
  const suffix = ` (copy${attempt > 1 ? ` ${attempt}` : ''})`
  return `${title.trim().slice(0, 80 - suffix.length).trimEnd()}${suffix}`
}

// Saves the order the quick replies were dragged into (the team's for everyone, a person's own for them).
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
