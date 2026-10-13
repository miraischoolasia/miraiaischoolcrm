import { supabase } from './supabase'

// What each flow has done: how many messages it made, how many were sent, and how many of the parents
// wrote back after one was sent.

export type FlowStats = {
  flowId: number
  queued: number
  sent: number
  pending: number
  skipped: number
  expired: number
  failed: number
  replied: number
}

type StatsRow = {
  flow_id: number
  queued: number
  sent: number
  pending: number
  skipped: number
  expired: number
  failed: number
  replied: number
}

export async function fetchFlowStats(): Promise<Map<number, FlowStats>> {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  const { data, error } = await supabase.rpc('automation_flow_stats')
  if (error) {
    throw error
  }
  const stats = new Map<number, FlowStats>()
  for (const row of (data ?? []) as StatsRow[]) {
    stats.set(row.flow_id, {
      flowId: row.flow_id,
      queued: row.queued,
      sent: row.sent,
      pending: row.pending,
      skipped: row.skipped,
      expired: row.expired,
      failed: row.failed,
      replied: row.replied,
    })
  }
  return stats
}

// The line under a flow in the list, or null when it has done nothing yet.
export function describeStats(stats: FlowStats | undefined): string | null {
  if (!stats || stats.queued === 0) {
    return null
  }
  const parts = [`${stats.sent} sent`]
  if (stats.sent > 0 && stats.replied > 0) {
    parts.push(`${stats.replied} replied (${Math.round((stats.replied / stats.sent) * 100)}%)`)
  } else if (stats.sent > 0) {
    parts.push('0 replied')
  }
  if (stats.pending > 0) {
    parts.push(`${stats.pending} waiting`)
  }
  if (stats.skipped > 0) {
    parts.push(`${stats.skipped} skipped`)
  }
  if (stats.failed > 0) {
    parts.push(`${stats.failed} failed`)
  }
  return parts.join(' · ')
}
