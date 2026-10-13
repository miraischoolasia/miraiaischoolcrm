import { supabase } from './supabase'

// Numbers that asked not to be messaged again (the parent wrote STOP). No automation sends to them.

export type AutomationOptout = {
  // Digits only, with the country code.
  phone: string
  reason: string | null
  createdAt: string
}

type OptoutRow = { phone: string; reason: string | null; created_at: string }

function requireSupabase() {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  return supabase
}

export async function fetchOptouts(): Promise<AutomationOptout[]> {
  const { data, error } = await requireSupabase()
    .from('automation_optouts')
    .select('phone, reason, created_at')
    .order('created_at', { ascending: false })
  if (error) {
    throw error
  }
  return ((data ?? []) as OptoutRow[]).map((row) => ({
    phone: row.phone,
    reason: row.reason,
    createdAt: row.created_at,
  }))
}

export async function deleteOptout(phone: string) {
  const { data, error } = await requireSupabase().from('automation_optouts').delete().eq('phone', phone).select('phone')
  if (error) {
    throw error
  }
  if ((data ?? []).length === 0) {
    throw new Error('Only an admin can allow a number again.')
  }
}

export function optoutsErrorMessage(problem: unknown, fallback: string) {
  const text =
    problem instanceof Error
      ? problem.message
      : typeof problem === 'object' && problem && 'message' in problem
        ? String((problem as { message: unknown }).message)
        : ''
  if (/automation_optouts/.test(text) && /(does not exist|schema cache|Could not find)/.test(text)) {
    return 'The list of numbers that asked to stop is not set up in the database yet.'
  }
  if (/row-level security|permission denied|Only an admin/i.test(text)) {
    return 'Only an admin can allow a number again.'
  }
  return fallback
}
