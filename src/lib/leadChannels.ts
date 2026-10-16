import { supabase } from './supabase'

// The chats a lead has, one row for each (person in the inbox, inbox): WhatsApp on number A, WhatsApp on
// number B, Messenger of a Page, Instagram. The database keeps these (the chat-activity webhook, and
// ensure_lead_channels as a backfill); a lead made from a Messenger chat has no phone number at all.

export type LeadChannelKind = 'whatsapp' | 'messenger' | 'instagram'

export type LeadChannel = {
  id: number
  leadId: number
  channel: LeadChannelKind
  contactId: number
  inboxId: number
  inboxName: string | null
  conversationId: number | null
  // The name on that channel (the Messenger name; the WhatsApp profile name).
  name: string | null
  // The Facebook Page they wrote to.
  pageName: string | null
  firstSeenAt: string
}

export const CHANNEL_LABEL: Record<LeadChannelKind, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
}

const ORDER: LeadChannelKind[] = ['whatsapp', 'messenger', 'instagram']

type Row = {
  id: number
  lead_id: number
  channel: LeadChannelKind
  chatwoot_contact_id: number
  inbox_id: number
  inbox_name: string | null
  conversation_id: number | null
  display_name: string | null
  page_name: string | null
  first_seen_at: string
}

export function toLeadChannel(row: Row): LeadChannel {
  return {
    id: row.id,
    leadId: row.lead_id,
    channel: row.channel,
    contactId: row.chatwoot_contact_id,
    inboxId: row.inbox_id,
    inboxName: row.inbox_name,
    conversationId: row.conversation_id,
    name: row.display_name,
    pageName: row.page_name,
    firstSeenAt: row.first_seen_at,
  }
}

export async function fetchLeadChannels(): Promise<LeadChannel[]> {
  if (!supabase) {
    return []
  }
  const { data, error } = await supabase
    .from('lead_channels')
    .select(
      'id, lead_id, channel, chatwoot_contact_id, inbox_id, inbox_name, conversation_id, display_name, page_name, first_seen_at',
    )
    .order('first_seen_at', { ascending: true })
    .limit(20000)
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => toLeadChannel(row as Row))
}

// A chat the inbox has open, as the database needs to know it.
export type ChatForChannel = {
  channel: LeadChannelKind
  contactId: number
  conversationId: number
  inboxId: number
  inboxName: string | null
  name: string | null
  phone: string | null
  pageName: string | null
  at: string | null
  text: string | null
}

// Lists these chats on their leads (making the lead of a Messenger / Instagram person that has none).
// Returns the lead of each contact that now sits on one.
export async function ensureLeadChannels(chats: ChatForChannel[]): Promise<Map<number, number>> {
  const found = new Map<number, number>()
  if (!supabase || chats.length === 0) {
    return found
  }
  const { data, error } = await supabase.rpc('ensure_lead_channels', {
    p_rows: chats.map((chat) => ({
      channel: chat.channel,
      contact_id: chat.contactId,
      conversation_id: chat.conversationId,
      inbox_id: chat.inboxId,
      inbox_name: chat.inboxName,
      name: chat.name,
      phone: chat.phone,
      page_name: chat.pageName,
      at: chat.at,
      text: chat.text,
    })),
  })
  if (error) {
    throw error
  }
  for (const [contact, lead] of Object.entries((data ?? {}) as Record<string, number>)) {
    found.set(Number(contact), Number(lead))
  }
  return found
}

// Joins two leads that are one family; the one with a phone number stays. Returns the lead that stays.
export async function mergeLeads(keepId: number, removeId: number): Promise<number> {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  const { data, error } = await supabase.rpc('merge_leads', { p_keep: keepId, p_remove: removeId })
  if (error) {
    throw error
  }
  return Number(data)
}

export function channelsByLead(rows: LeadChannel[]): Map<number, LeadChannel[]> {
  const map = new Map<number, LeadChannel[]>()
  for (const row of rows) {
    const list = map.get(row.leadId)
    if (list) {
      list.push(row)
    } else {
      map.set(row.leadId, [row])
    }
  }
  for (const list of map.values()) {
    list.sort(
      (a, b) =>
        ORDER.indexOf(a.channel) - ORDER.indexOf(b.channel) || a.firstSeenAt.localeCompare(b.firstSeenAt) || a.id - b.id,
    )
  }
  return map
}

// Where the chat sits: the Facebook Page for Messenger / Instagram, the WhatsApp number's name for WhatsApp.
export function placeOf(row: LeadChannel): string | null {
  const place = row.channel === 'whatsapp' ? row.inboxName : (row.pageName ?? row.inboxName)
  return place && place.trim() !== '' ? place.trim() : null
}

// The Messenger / Instagram names of a lead, in the order the lines should show under the phone number:
// Messenger first, then Instagram. The same person on two Pages is one line each.
export type SocialLine = {
  kind: 'messenger' | 'instagram'
  name: string
  place: string | null
  // To open the chat on the inbox page.
  conversationId: number | null
  contactId: number
}

export function socialLines(rows: LeadChannel[]): SocialLine[] {
  const lines: SocialLine[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (row.channel === 'whatsapp') {
      continue
    }
    const key = `${row.channel}:${row.contactId}:${placeOf(row) ?? ''}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    lines.push({
      kind: row.channel,
      name: row.name?.trim() || CHANNEL_LABEL[row.channel],
      place: placeOf(row),
      conversationId: row.conversationId,
      contactId: row.contactId,
    })
  }
  return lines
}

// The WhatsApp numbers (of the school) a lead wrote to, first contacted first.
export function whatsappPlaces(rows: LeadChannel[]): string[] {
  const places: string[] = []
  for (const row of rows) {
    const place = row.channel === 'whatsapp' ? placeOf(row) : null
    if (place && !places.includes(place)) {
      places.push(place)
    }
  }
  return places
}

export type ChannelFilter = { channel: 'all' | LeadChannelKind; place: 'all' | string }

export const NO_CHANNEL_FILTER: ChannelFilter = { channel: 'all', place: 'all' }

export function channelFilterIsOn(filter: ChannelFilter) {
  return filter.channel !== 'all' || filter.place !== 'all'
}

// The Pages / numbers to pick from once a channel is chosen (every one when none is).
export function placeChoices(rows: LeadChannel[], channel: ChannelFilter['channel']): string[] {
  const places = new Set<string>()
  for (const row of rows) {
    if (channel !== 'all' && row.channel !== channel) {
      continue
    }
    const place = placeOf(row)
    if (place) {
      places.add(place)
    }
  }
  return [...places].sort((a, b) => a.localeCompare(b))
}

// leadRows: the chats of one lead. A lead with a phone number counts as a WhatsApp lead even before
// any chat of it was seen.
export function matchesChannelFilter(
  filter: ChannelFilter,
  leadRows: LeadChannel[],
  hasPhone: boolean,
): boolean {
  if (!channelFilterIsOn(filter)) {
    return true
  }
  if (filter.channel === 'whatsapp' && filter.place === 'all' && hasPhone) {
    return true
  }
  return leadRows.some(
    (row) =>
      (filter.channel === 'all' || row.channel === filter.channel) &&
      (filter.place === 'all' || placeOf(row) === filter.place),
  )
}
