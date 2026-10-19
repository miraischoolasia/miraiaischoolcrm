import { supabase } from './supabase'

// Who may see and who may answer each inbox channel (a WhatsApp number, a Messenger Page, an Instagram
// account): docs/teams-permissions-design.md, section 5. The database decides; this is what the pages show.

export type ChannelKind = 'whatsapp' | 'messenger' | 'instagram' | 'other'
export type ChannelAccess = 'open' | 'limited'
export type ChannelLevel = 'view' | 'reply'

export type InboxChannel = {
  inboxId: number
  kind: ChannelKind
  label: string
  access: ChannelAccess
  isActive: boolean
}

export type ChannelGrant = { teamId: number; level: ChannelLevel } | { teacherId: number; level: ChannelLevel }

export const channelKindLabels: Record<ChannelKind, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  other: 'Other',
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  return supabase
}

export async function fetchInboxChannels(): Promise<InboxChannel[]> {
  const { data, error } = await requireSupabase()
    .from('inbox_channels')
    .select('chatwoot_inbox_id, kind, label, access, is_active')
    .order('chatwoot_inbox_id')
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => ({
    inboxId: row.chatwoot_inbox_id,
    kind: row.kind,
    label: row.label,
    access: row.access,
    isActive: row.is_active,
  }))
}

// inboxId -> who may use it (an admin reads every grant; anyone else only their own).
export async function fetchChannelGrants(): Promise<Map<number, ChannelGrant[]>> {
  const { data, error } = await requireSupabase()
    .from('inbox_channel_access')
    .select('chatwoot_inbox_id, team_id, teacher_id, level')
    .order('id')
  if (error) {
    throw error
  }
  const result = new Map<number, ChannelGrant[]>()
  for (const row of data ?? []) {
    const grant: ChannelGrant | null =
      row.team_id !== null
        ? { teamId: row.team_id, level: row.level }
        : row.teacher_id !== null
          ? { teacherId: row.teacher_id, level: row.level }
          : null
    if (grant) {
      result.set(row.chatwoot_inbox_id, [...(result.get(row.chatwoot_inbox_id) ?? []), grant])
    }
  }
  return result
}

export function channelDraftError(channel: InboxChannel, grants: ChannelGrant[]): string | null {
  if (!Number.isInteger(channel.inboxId) || channel.inboxId <= 0) {
    return 'Pick the Chatwoot inbox of this channel.'
  }
  const label = channel.label.trim()
  if (label === '' || label.length > 60) {
    return 'Give the channel a name of up to 60 letters.'
  }
  if (channel.access === 'limited' && grants.length === 0) {
    return 'A limited channel needs at least one team or person (an admin always sees it).'
  }
  const seen = new Set<string>()
  for (const grant of grants) {
    const key = 'teamId' in grant ? `team:${grant.teamId}` : `person:${grant.teacherId}`
    if (seen.has(key)) {
      return 'A team or person is listed twice.'
    }
    seen.add(key)
  }
  return null
}

export async function saveInboxChannel(channel: InboxChannel, grants: ChannelGrant[]) {
  const { error } = await requireSupabase().rpc('set_inbox_channel', {
    p_inbox_id: channel.inboxId,
    p_kind: channel.kind,
    p_label: channel.label.trim(),
    p_access: channel.access,
    p_grants: grants.map((grant) =>
      'teamId' in grant ? { team_id: grant.teamId, level: grant.level } : { teacher_id: grant.teacherId, level: grant.level },
    ),
    p_is_active: channel.isActive,
  })
  if (error) {
    throw error
  }
}

// What the signed-in person may do in each channel the school set up: inboxId -> 'reply' | 'view' | 'none'.
// A channel not in the map is open: the Inbox tick decides. For the reply box of the Inbox (department ①).
export async function fetchMyInboxAccess(): Promise<Map<number, ChannelLevel | 'none'>> {
  if (!supabase) {
    return new Map()
  }
  const { data, error } = await supabase.rpc('my_inbox_access')
  if (error) {
    // A database before 20261026020000: nothing is limited.
    if (error.code === 'PGRST202' || error.code === '42883') {
      return new Map()
    }
    throw error
  }
  const result = new Map<number, ChannelLevel | 'none'>()
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const inboxId = Number(key)
      if (Number.isInteger(inboxId) && (value === 'reply' || value === 'view' || value === 'none')) {
        result.set(inboxId, value)
      }
    }
  }
  return result
}

// May the person answer in this inbox? canEditInbox: their Inbox tick allows editing.
export function canReplyIn(access: Map<number, ChannelLevel | 'none'>, inboxId: number | null | undefined, canEditInbox: boolean) {
  if (!canEditInbox) {
    return false
  }
  if (inboxId === null || inboxId === undefined) {
    return true
  }
  const level = access.get(inboxId)
  return level === undefined || level === 'reply'
}
