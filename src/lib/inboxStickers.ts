import { createContext } from 'react'
import { supabase } from './supabase'

// The school's own sticker library (an admin adds them; each school's database has its own) and the stickers
// parents sent lately. Sending goes through WhatsApp's sticker message as before (Evolution turns the picture
// into WhatsApp's sticker format, WebP).

export type LibrarySticker = { id: number; name: string | null; url: string; path: string }
export type ReceivedSticker = { url: string; name: string | null }

// What the sticker picker needs from the Inbox page: how to reach a chat's file, and whether the person may
// change the library.
export const StickerSourceContext = createContext<{ mediaUrl: (url: string) => string; canManage: boolean }>({
  mediaUrl: (url) => url,
  canManage: false,
})

const BUCKET = 'inbox-stickers'
export const STICKER_MAX_BYTES = 1024 * 1024
const KINDS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  return supabase
}

export function stickerError(error: unknown) {
  const { code, message } = (error ?? {}) as { code?: string; message?: string }
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || message?.includes('inbox_stickers') || message?.includes('inbox_recent_stickers')) {
    return 'The sticker library is not set up yet. Ask the admin to update the database.'
  }
  if (code === '42501') {
    return 'Only an admin can change the sticker library.'
  }
  return message || "Couldn't load the stickers."
}

export async function listLibraryStickers(): Promise<LibrarySticker[]> {
  const db = requireSupabase()
  const { data, error } = await db
    .from('inbox_stickers')
    .select('id, path, name')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) {
    throw error
  }
  const rows = data ?? []
  if (rows.length === 0) {
    return []
  }
  const signed = await db.storage.from(BUCKET).createSignedUrls(rows.map((row) => row.path), 3600)
  if (signed.error) {
    throw signed.error
  }
  const urlOf = new Map((signed.data ?? []).map((entry) => [entry.path, entry.signedUrl]))
  return rows.flatMap((row) => {
    const url = urlOf.get(row.path)
    return url ? [{ id: row.id, name: row.name, path: row.path, url }] : []
  })
}

// Problem with a picture for the library, or null when it can go in.
export function stickerFileProblem(file: File) {
  if (!KINDS[file.type]) {
    return 'A sticker must be a PNG, JPEG or WebP picture.'
  }
  if (file.size > STICKER_MAX_BYTES) {
    return 'A sticker must be under 1 MB.'
  }
  return null
}

export async function addLibrarySticker(file: File) {
  const problem = stickerFileProblem(file)
  if (problem) {
    throw new Error(problem)
  }
  const db = requireSupabase()
  const path = `${crypto.randomUUID()}.${KINDS[file.type]}`
  const upload = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (upload.error) {
    throw upload.error
  }
  const name = file.name.replace(/\.[^.]+$/, '').slice(0, 80) || null
  const { error } = await db.from('inbox_stickers').insert({ path, name })
  if (error) {
    throw error
  }
}

// Taken out of the list (kept, as everything the school sets up is).
export async function hideLibrarySticker(id: number) {
  const { error } = await requireSupabase().from('inbox_stickers').update({ is_active: false }).eq('id', id)
  if (error) {
    throw error
  }
}

export async function listReceivedStickers(): Promise<ReceivedSticker[]> {
  const { data, error } = await requireSupabase().rpc('inbox_recent_stickers', { p_limit: 40 })
  if (error) {
    throw error
  }
  return (data ?? []).flatMap((row) => (row.url ? [{ url: row.url, name: row.name }] : []))
}

// The picture as a file, to send as a sticker.
export async function stickerFile(url: string, name: string | null) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error("Couldn't get that sticker.")
  }
  const blob = await response.blob()
  const type = blob.type && KINDS[blob.type] ? blob.type : 'image/webp'
  return new File([blob], `${(name ?? 'sticker').replace(/\.[^.]+$/, '')}.${KINDS[type]}`, { type })
}
