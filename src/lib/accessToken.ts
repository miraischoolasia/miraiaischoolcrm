import { supabase } from './supabase'

// The login token of whoever is using the CRM. The WhatsApp gateway asks Supabase
// about it to know the person is signed in and may see Leads.
export async function getSupabaseAccessToken() {
  if (!supabase) {
    return null
  }
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
