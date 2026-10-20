import { supabase } from './supabase'

// These functions are not in the generated types yet (src/types/database.ts is
// regenerated after the migration is pushed), so they are called untyped.
type LooseRpc = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> }
const loose = () => supabase as unknown as LooseRpc

// The student app's daily check-in, daily tasks and daily practice, as the
// school sets them (Class Settings > Student app; the CRM's
// 20261027100000_student_daily.sql). The coins are points like any other.

export type DailyTaskKind = 'video' | 'live_right' | 'practice'

export const dailyTaskKinds: Array<{ kind: DailyTaskKind; label: string }> = [
  { kind: 'video', label: 'Watch learning videos (80% or more)' },
  { kind: 'live_right', label: 'Get live questions right in class' },
  { kind: 'practice', label: 'Do daily practice questions' },
]

export type DailySettings = {
  checkin_enabled: boolean
  checkin_coins: number
  tasks_enabled: boolean
  practice_enabled: boolean
  practice_per_day: number
  practice_coins: number
}

export type DailyTask = {
  id: number
  label: string
  kind: DailyTaskKind
  target: number
  coins: number
  is_active: boolean
  sort_order: number
}

export const defaultDailySettings: DailySettings = {
  checkin_enabled: true,
  checkin_coins: 2,
  tasks_enabled: true,
  practice_enabled: true,
  practice_per_day: 5,
  practice_coins: 1,
}

// Whole numbers in range, for the settings form.
export function dailySettingsProblem(settings: DailySettings) {
  const whole = (value: number, low: number, high: number) => Number.isInteger(value) && value >= low && value <= high
  if (!whole(settings.checkin_coins, 1, 100)) return 'Check-in coins: 1 to 100.'
  if (!whole(settings.practice_per_day, 1, 30)) return 'Practice questions a day: 1 to 30.'
  if (!whole(settings.practice_coins, 1, 100)) return 'Coins for a right practice answer: 1 to 100.'
  return null
}

export function dailyTaskProblem(task: Pick<DailyTask, 'label' | 'target' | 'coins'>) {
  if (!task.label.trim() || task.label.trim().length > 60) return 'Give the task a name (up to 60 letters).'
  if (!Number.isInteger(task.target) || task.target < 1 || task.target > 20) return 'How many times: 1 to 20.'
  if (!Number.isInteger(task.coins) || task.coins < 1 || task.coins > 100) return 'Coins: 1 to 100.'
  return null
}

export async function fetchDailySettings(): Promise<{ settings: DailySettings; tasks: DailyTask[] }> {
  if (!supabase) return { settings: defaultDailySettings, tasks: [] }
  const { data, error } = await loose().rpc('student_daily_settings')
  if (error) throw new Error(error.message)
  const value = (data ?? {}) as { settings?: Partial<DailySettings>; tasks?: DailyTask[] }
  return { settings: { ...defaultDailySettings, ...(value.settings ?? {}) }, tasks: value.tasks ?? [] }
}

export async function saveDailySettings(settings: DailySettings) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await loose().rpc('set_student_daily_settings', { p_settings: settings })
  return error ? error.message || 'Failed to save.' : null
}

export async function saveDailyTask(task: Omit<DailyTask, 'id' | 'sort_order'> & { id: number | null; sort_order?: number | null }) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await loose().rpc(
    'save_daily_task',
    {
      p_id: task.id,
      p_label: task.label.trim(),
      p_kind: task.kind,
      p_target: task.target,
      p_coins: task.coins,
      p_is_active: task.is_active,
      p_sort_order: task.sort_order ?? null,
    },
  )
  return error ? error.message || 'Failed to save.' : null
}
