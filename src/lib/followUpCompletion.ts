import { supabase } from './supabase'

// One person's automatic follow-ups in one month (view followup_completion, 20261102500000). Cancelled ones (the lead
// became Converted or Lost) are not counted.
export type FollowUpCompletionRow = {
  assigneeId: number | null
  month: string
  scheduled: number
  done: number
  onTime: number
  overdue: number
}

export function percent(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : null
}

export async function fetchFollowUpCompletion(month: string): Promise<FollowUpCompletionRow[]> {
  if (!supabase) {
    return []
  }
  try {
    const { data, error } = await supabase
      .from('followup_completion' as never)
      .select('assignee_id, month, scheduled, done, on_time, overdue')
      .eq('month', month)
    if (error) {
      return []
    }
    return ((data ?? []) as { assignee_id: number | null; month: string; scheduled: number; done: number; on_time: number; overdue: number }[]).map(
      (row) => ({
        assigneeId: row.assignee_id,
        month: row.month,
        scheduled: Number(row.scheduled),
        done: Number(row.done),
        onTime: Number(row.on_time),
        overdue: Number(row.overdue),
      }),
    )
  } catch {
    return []
  }
}

