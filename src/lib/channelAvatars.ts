import { supabase } from './supabase'

// The picture of the Page a Messenger / Instagram chat came through. The key names the channel: the Chatwoot
// inbox id, then "|" and the Page name when one inbox carries several Pages (the GoHighLevel bridge).

// A Page's name as it is compared: the same name written with other spaces, width or case is one Page.
export function normalizePageName(name: string | null | undefined) {
  return (name ?? '').normalize('NFKC').replace(/\p{Cf}/gu, '').replace(/\s+/g, '').toLowerCase()
}

// The Page an inbox stands for, from the Pages its chats are on (page id -> number of chats): the one that has the
// inbox's own name, else the one with the most chats (a tie goes to the first listed).
export function mainPageOf(counts: Map<string, number>, names: Map<string, string>, inboxName: string | null | undefined) {
  const wanted = normalizePageName(inboxName)
  const pageIds = [...counts.keys()]
  const named = wanted ? pageIds.find((pageId) => normalizePageName(names.get(pageId)) === wanted) : undefined
  return named ?? [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null
}

export function channelKeyOf(inboxId: number | undefined | null, pageName?: string | null) {
  const inbox = inboxId ?? 0
  const page = normalizePageName(pageName)
  return page ? `${inbox}|${page}` : String(inbox)
}

// A Facebook Page's public picture, by its id: no sign-in needed, so the list can show it as it is.
export function facebookPictureUrl(pageId: string | number) {
  return `https://graph.facebook.com/${encodeURIComponent(String(pageId))}/picture?type=square&width=96&height=96`
}

export type ChannelAvatars = Map<string, string>

type Row = { channel_key: string; avatar: string }

function requireSupabase() {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  return supabase
}

export async function fetchChannelAvatars(): Promise<ChannelAvatars> {
  const { data, error } = await requireSupabase().from('channel_avatars').select('channel_key, avatar')
  if (error) {
    throw error
  }
  return new Map(((data ?? []) as Row[]).map((row) => [row.channel_key, row.avatar]))
}

export async function saveChannelAvatar(key: string, avatar: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('channel_avatars')
    .upsert({ channel_key: key, avatar, updated_at: new Date().toISOString() }, { onConflict: 'channel_key' })
  if (error) {
    throw error
  }
}

export async function removeChannelAvatar(key: string): Promise<void> {
  const { error } = await requireSupabase().from('channel_avatars').delete().eq('channel_key', key)
  if (error) {
    throw error
  }
}

export const AVATAR_SIZE = 96

// Shrinks a chosen picture to a small square (the middle of it) and returns it as a data URL, so it can be kept
// in the database without a file store.
export function pictureToDataUrl(file: File, size = AVATAR_SIZE): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Choose a picture (PNG or JPG).'))
      return
    }
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      const side = Math.min(image.naturalWidth, image.naturalHeight)
      if (!side) {
        reject(new Error("That picture can't be read."))
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error("That picture can't be read."))
        return
      }
      context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, size, size)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("That picture can't be read."))
    }
    image.src = url
  })
}

export function channelAvatarError(problem: unknown, fallback: string) {
  const text = problem instanceof Error ? problem.message : typeof problem === 'object' && problem && 'message' in problem ? String((problem as { message: unknown }).message) : ''
  if (/channel_avatars/.test(text) && /(does not exist|schema cache|Could not find)/.test(text)) {
    return 'Channel pictures are not set up in the database yet.'
  }
  if (/row-level security|permission denied/i.test(text)) {
    return 'Only an admin can change the pictures.'
  }
  return text && !/^\{/.test(text) && text.length < 120 ? text : fallback
}
