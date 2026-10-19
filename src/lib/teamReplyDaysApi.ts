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
  const [days, runs] = await Promise.all([
    supabase
      .from('team_reply_days')
      .select(
        workingTime
          ? 'day, replier, staff_id, replies, chat_ids, waits, within_target, slowest, duty_waits, duty_within_target, duty_slowest'
          : 'day, replier, staff_id, replies, chat_ids, waits, within_target, slowest',
      )
      .gte('day', first)
      .lte('day', last)
      .order('day', { ascending: true })
      .limit(5000),
    supabase.from('team_reply_day_runs').select('day').gte('day', first).lte('day', last).limit(1000),
  ])
  if (days.error) {
    throw days.error
  }
  if (runs.error) {
    throw runs.error
  }
  return { rows: toDayRows((days.data ?? []) as unknown as DbDayRow[], workingTime), doneDays: new Set((runs.data ?? []).map((run) => run.day)) }
}
