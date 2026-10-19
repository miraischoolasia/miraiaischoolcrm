import { supabase } from './supabase'

type ProvisionResult = { ok: true } | { ok: false; error: string }

async function invokeProvision(
  body:
    | { action: 'create_login' | 'reset_password'; teacherId: number; password: string }
    | { action: 'sync_login_name'; teacherId: number },
): Promise<ProvisionResult> {
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' }
  }

  const { data, error } = await supabase.functions.invoke('provision-teacher-auth', {
    body,
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  if (!data?.ok) {
    return { ok: false, error: data?.error ?? 'Request failed.' }
  }

  return { ok: true }
}

export function provisionTeacherLogin(teacherId: number, password: string) {
  return invokeProvision({ action: 'create_login', teacherId, password })
}

export function resetTeacherPassword(teacherId: number, password: string) {
  return invokeProvision({ action: 'reset_password', teacherId, password })
}

// After the username is changed in My Team: the login name follows it (the password stays).
export function syncTeacherLoginName(teacherId: number) {
  return invokeProvision({ action: 'sync_login_name', teacherId })
}
