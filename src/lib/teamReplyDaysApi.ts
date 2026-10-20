import { supabase } from './supabase'
import type { DayRow, ReplierKey } from '../../supabase/functions/team-replies/logic'

export type KeptDays = {
  rows: DayRow[]
  // The days of the period that have been worked out (a quiet day is done but has no rows).
  doneDays: Set<string>
}

const REPLIER = /^(staff:[1-9][0-9]*|automation|phone)$/

export const SETUP_MISSING = 'Team Replies is not set up in the database yet. Ask the admin to update the database.'

// Turns a database failure into something the team can act on.
export function teamRepliesErrorMessage(error: unknown) {
  const { code, message } = (error ?? {}) as { code?: string; message?: string }
  if (code === '42P01' || code === '42883' || code === 'PGRST202' || code === 'PGRST205' || message?.includes('team_reply') || message?.includes('inbox_copy')) {
    return SETUP_MISSING
  }
  return message || "Couldn't read the kept days."
}

type DbDayRow = {
  day: string
  replier: string
  staff_id: number | null
  replies: number
  chat_ids: number[] | null
  waits: number[] | null
  within_target: number
  slowest: number | null
  // The same waits counting only working time (20261026030000).
  duty_waits?: number[] | null
  duty_within_target?: number | null
  duty_slowest?: number | null
  // The channel and the chats marked Done (20261026900000).
  inbox_id?: number | null
  done_chat_ids?: number[] | null
}

// workingTime: use the waits that count only the time the person who answered was working.
function toDayRows(rows: DbDayRow[], workingTime = false): DayRow[] {
  const result: DayRow[] = []
  for (const row of rows) {
    if (!REPLIER.test(row.replier)) {
      continue
    }
    result.push({
      day: row.day,
      replier: row.replier as ReplierKey,
      staffId: row.staff_id,
      replies: row.replies,
      chatIds: (row.chat_ids ?? []).map(Number),
      waits: ((workingTime ? row.duty_waits : row.waits) ?? []).map(Number),
      withinTarget: workingTime ? (row.duty_within_target ?? 0) : row.within_target,
      slowest: workingTime ? (row.duty_slowest ?? null) : row.slowest,
      inboxId: Number(row.inbox_id ?? 0),
      doneChatIds: (row.done_chat_ids ?? []).map(Number),
    })
  }
  return result
}

// Today, worked out on the spot from the inbox copy (today is never kept).
export async function fetchToday(workingTime = false): Promise<DayRow[]> {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  const { data, error } = await supabase.rpc('team_reply_today')
  if (error) {
    throw error
  }
  return toDayRows(data ?? [], workingTime)
}


export type CopySummary = {
  chats: number
  messages: number
  copiedChats: number
  chatsToCopy: number
  firstMessageAt: string | null
}

// How full the inbox copy is.
export async function fetchCopySummary(): Promise<CopySummary | null> {
  if (!supabase) {
    return null
  }
  const { data, error } = await supabase.rpc('inbox_copy_summary')
  if (error) {
    throw error
  }
  const row = data?.[0]
  return row
    ? {
        chats: row.chats,
        messages: Number(row.messages),
        copiedChats: row.copied_chats,
        chatsToCopy: row.chats_to_copy,
        firstMessageAt: row.first_message_at,
      }
    : null
}

// The kept days from first to last (both "YYYY-MM-DD", Malaysian days).
export async function fetchKeptDays(first: string, last: string, workingTime = false): Promise<KeptDays> {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  const client = supabase
  const columns = workingTime
    ? 'day, replier, staff_id, replies, chat_ids, waits, within_target, slowest, duty_waits, duty_within_target, duty_slowest'
    : 'day, replier, staff_id, replies, chat_ids, waits, within_target, slowest'
  const readDays = (select: string) =>
    client.from('team_reply_days').select(select).gte('day', first).lte('day', last).order('day', { ascending: true }).limit(5000)
  const [split, runs] = await Promise.all([
    readDays(`${columns}, inbox_id, done_chat_ids`),
    client.from('team_reply_day_runs').select('day').gte('day', first).lte('day', last).limit(1000),
  ])
  // Before 20261026900000 is in the database the days have no channel: read them without.
  const days = split.error && isMissingColumn(split.error) ? await readDays(columns) : split
  if (days.error) {
    throw days.error
  }
  if (runs.error) {
    throw runs.error
  }
  return { rows: toDayRows((days.data ?? []) as unknown as DbDayRow[], workingTime), doneDays: new Set((runs.data ?? []).map((run) => run.day)) }
}

function isMissingColumn(error: { code?: string; message?: string }) {
  return error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist/i.test(error.message ?? '')
}

// One channel (Chatwoot inbox) on one day: what came in, what was cleared, how long the first answer took.
export type ChannelDayRow = {
  day: string
  inboxId: number
  incomingMessages: number
  incomingChatIds: number[]
  repliedChatIds: number[]
  doneChatIds: number[]
  firstWaits: number[]
}

type DbChannelRow = {
  day: string
  inbox_id: number
  incoming_messages: number
  incoming_chat_ids: number[] | null
  replied_chat_ids: number[] | null
  done_chat_ids: number[] | null
  first_waits: number[] | null
  duty_first_waits: number[] | null
}

function toChannelRows(rows: DbChannelRow[], workingTime: boolean): ChannelDayRow[] {
  return rows.map((row) => ({
    day: row.day,
    inboxId: Number(row.inbox_id ?? 0),
    incomingMessages: row.incoming_messages ?? 0,
    incomingChatIds: (row.incoming_chat_ids ?? []).map(Number),
    repliedChatIds: (row.replied_chat_ids ?? []).map(Number),
    doneChatIds: (row.done_chat_ids ?? []).map(Number),
    firstWaits: ((workingTime ? row.duty_first_waits : row.first_waits) ?? []).map(Number),
  }))
}

// null: the channel numbers are not in the database yet, or this person may see only their own rows.
export type ChannelDays = ChannelDayRow[] | null

const CHANNEL_COLUMNS =
  'day, inbox_id, incoming_messages, incoming_chat_ids, replied_chat_ids, done_chat_ids, first_waits, duty_first_waits'

function isMissingSetup(error: { code?: string; message?: string }) {
  return ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code ?? '') || isMissingColumn(error)
}

export async function fetchChannelDays(first: string, last: string, workingTime = false): Promise<ChannelDays> {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  const { data, error } = await supabase
    .from('team_channel_days')
    .select(CHANNEL_COLUMNS)
    .gte('day', first)
    .lte('day', last)
    .order('day', { ascending: true })
    .limit(5000)
  if (error) {
    if (isMissingSetup(error)) {
      return null
    }
    throw error
  }
  return toChannelRows((data ?? []) as unknown as DbChannelRow[], workingTime)
}

export async function fetchChannelToday(workingTime = false): Promise<ChannelDays> {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  const { data, error } = await supabase.rpc('team_channel_today')
  if (error) {
    if (isMissingSetup(error)) {
      return null
    }
    throw error
  }
  return toChannelRows((data ?? []) as unknown as DbChannelRow[], workingTime)
}

// Whose Team Replies this person sees ('all', 'own', ...), as the database decides. Unknown: 'all', and the
// database's own rules still keep out what is not theirs.
export async function fetchTeamRepliesScope(): Promise<string | null> {
  if (!supabase) {
    return null
  }
  const { data, error } = await supabase.rpc('permission_scope', { p_module: 'team_replies', p_action: 'view' })
  return error ? 'all' : (data ?? null)
}
