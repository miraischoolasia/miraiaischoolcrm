import { createSettingStore } from './settingStore'
import { supabase } from './supabase'

// The school's own words for the two sales roles on the Today page (migration 20261102600000_today_by_role.sql):
// "EC" (the person who works the leads) and "LC" (the learning consultant who looks after the students). A school can
// rename them; the row is `role_names` in app_settings, changed with set_role_names (admin only).
export type RoleNames = { ec: string; lc: string }

export const defaultRoleNames: RoleNames = { ec: 'EC', lc: 'LC' }

export function readRoleNames(value: unknown): RoleNames {
  const names = { ...defaultRoleNames }
  if (value && typeof value === 'object') {
    for (const key of ['ec', 'lc'] as const) {
      const text = (value as Record<string, unknown>)[key]
      if (typeof text === 'string' && text.trim() !== '') {
        names[key] = text.trim().slice(0, 30)
      }
    }
  }
  return names
}

const store = createSettingStore<RoleNames>('role_names', readRoleNames, defaultRoleNames)

export const reloadRoleNames = store.reload

export async function saveRoleNames(names: RoleNames): Promise<string | null> {
  if (!supabase) {
    return 'Not connected.'
  }
  const { error } = await supabase.rpc('set_role_names', { p_ec: names.ec, p_lc: names.lc })
  if (error) {
    return error.message
  }
  await reloadRoleNames()
  return null
}

export const useRoleNames = store.use
