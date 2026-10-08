import { supabase } from './supabase'
import type { SourceRule } from './sourceRules'

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  return supabase
}

export function sourceRuleErrorMessage(error: unknown, fallback: string) {
  const { code, message } = (error ?? {}) as { code?: string; message?: string }
  if (code === '23505') {
    return 'A rule with that phrase already exists.'
  }
  if (code === '42P01' || code === 'PGRST205' || message?.includes('lead_source_rules')) {
    return 'Source rules are not set up yet. Ask the admin to update the database.'
  }
  if (code === '42501') {
    return 'Your account is not allowed to change source rules.'
  }
  return message || fallback
}

export async function fetchSourceRules(): Promise<SourceRule[]> {
  const { data, error } = await requireSupabase()
    .from('lead_source_rules')
    .select('id, phrase, source_id, tag_ids, is_active')
    .order('id', { ascending: true })

  if (error) {
    throw error
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    phrase: row.phrase,
    sourceId: row.source_id,
    tagIds: row.tag_ids,
    isActive: row.is_active,
  }))
}

export type SourceRuleDraft = Omit<SourceRule, 'id'>

export async function saveSourceRule(existing: SourceRule | null, draft: SourceRuleDraft) {
  const client = requireSupabase()
  const row = {
    phrase: draft.phrase.trim(),
    source_id: draft.sourceId,
    tag_ids: draft.tagIds,
    is_active: draft.isActive,
  }
  const { error } = existing
    ? await client.from('lead_source_rules').update(row).eq('id', existing.id)
    : await client.from('lead_source_rules').insert(row)
  if (error) {
    throw error
  }
}

export async function deleteSourceRule(rule: SourceRule) {
  const { error } = await requireSupabase().from('lead_source_rules').delete().eq('id', rule.id)
  if (error) {
    throw error
  }
}
