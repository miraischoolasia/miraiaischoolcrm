import { supabase } from './supabase'

// A short name and a colour for each inbox channel (20261027700000), so two WhatsApp numbers, or two Pages, are told
// apart in the Inbox's channel bar, chat list and "Sending from". Keyed like channel_avatars (channelKeyOf).

export type ChannelLabel = { shortName: string | null; color: string | null }
export type ChannelLabels = Map<string, ChannelLabel>

export const SHORT_NAME_MAX = 8

// The colours to pick from: clear apart from each other and from the WhatsApp / Messenger / Instagram logos.
export const CHANNEL_COLORS = [
  { color: '#2563eb', name: 'Blue' },
  { color: '#ea580c', name: 'Orange' },
  { color: '#7c3aed', name: 'Purple' },
  { color: '#db2777', name: 'Pink' },
  { color: '#0d9488', name: 'Teal' },
  { color: '#ca8a04', name: 'Gold' },
  { color: '#dc2626', name: 'Red' },
  { color: '#475569', name: 'Grey' },
] as const

type Row = { channel_key: string; short_name: string | null; color: string | null }

function requireSupabase() {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  return supabase
}

export async function fetchChannelLabels(): Promise<ChannelLabels> {
  const { data, error } = await requireSupabase().from('channel_labels').select('channel_key, short_name, color')
  if (error) {
    throw error
  }
  return new Map(((data ?? []) as Row[]).map((row) => [row.channel_key, { shortName: row.short_name, color: row.color }]))
}

// An empty short name and no colour removes the row.
export async function saveChannelLabel(key: string, label: ChannelLabel): Promise<void> {
  const shortName = label.shortName?.trim() || null
  const color = label.color || null
  const db = requireSupabase()
  if (!shortName && !color) {
    const { error } = await db.from('channel_labels').delete().eq('channel_key', key)
    if (error) {
      throw error
    }
    return
  }
  const { error } = await db
    .from('channel_labels')
    .upsert({ channel_key: key, short_name: shortName, color, updated_at: new Date().toISOString() }, { onConflict: 'channel_key' })
  if (error) {
    throw error
  }
}

export function channelLabelProblem(label: ChannelLabel): string | null {
  const shortName = label.shortName?.trim() ?? ''
  if ([...shortName].length > SHORT_NAME_MAX) {
    return `The short name can be at most ${SHORT_NAME_MAX} characters.`
  }
  return null
}

// What a channel button says: its short name, else the last 4 digits of the number, else the start of its name.
export function shortLabelOf(label: ChannelLabel | undefined, phone: string | null | undefined, name: string): string {
  const own = label?.shortName?.trim()
  if (own) {
    return own
  }
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length >= 4) {
    return digits.slice(-4)
  }
  return [...name.trim()].slice(0, SHORT_NAME_MAX).join('') || name
}

// The full name and number, for the tooltip (and a long press on a phone).
export function fullLabelOf(name: string, phone: string | null | undefined) {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits ? `${name} · +${digits}` : name
}
