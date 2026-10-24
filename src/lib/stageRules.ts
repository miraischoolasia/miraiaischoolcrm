import { supabase } from './supabase'
import { stageLabel } from './leadStages'

// The moves a lead makes by itself, as switches the school sets (public.lead_stage_rules). The database reads the
// same switches in every place that moves a lead, so what is shown here is what happens.

export type StageRuleKey =
  | 'contacted_on_reply'
  | 'trial_scheduled_on_booking'
  | 'converted_on_enrol'
  | 'converted_on_student_phone'

export type StageRule = {
  key: StageRuleKey
  enabled: boolean
  // contacted_on_reply: an automatic message counts as the school writing.
  countAutomated: boolean
  // converted_on_student_phone: every student with the lead's number counts, or only students in a regular class (not HOA trial, not without a class).
  students: 'all' | 'regular'
}

export const STAGE_RULE_KEYS: StageRuleKey[] = [
  'contacted_on_reply',
  'trial_scheduled_on_booking',
  'converted_on_enrol',
  'converted_on_student_phone',
]

// What the database does before anyone touches a switch.
export const DEFAULT_STAGE_RULES: StageRule[] = STAGE_RULE_KEYS.map((key) => ({
  key,
  enabled: true,
  countAutomated: true,
  students: 'all',
}))

export type StageRuleText = { title: string; detail: string }

// How a rule reads, with the school's own stage names.
export function stageRuleText(key: StageRuleKey): StageRuleText {
  switch (key) {
    case 'contacted_on_reply':
      return {
        title: `The school writes to a parent → ${stageLabel('contacted')}`,
        detail: `A lead in "${stageLabel('new')}" moves to "${stageLabel('contacted')}" when a message goes out in its chat. A lead further on is never moved back.`,
      }
    case 'trial_scheduled_on_booking':
      return {
        title: `An HOA trial is booked → ${stageLabel('trial_scheduled')}`,
        detail: `A lead in "${stageLabel('new')}" or "${stageLabel('contacted')}" moves to "${stageLabel('trial_scheduled')}" when a trial is booked for it. A booking for someone who is not a lead yet makes the lead there.`,
      }
    case 'converted_on_enrol':
      return {
        title: `A student is made from the lead, or an HOA student is converted → ${stageLabel('converted')}`,
        detail: `Adding a student from a lead (or converting an HOA student) ties the lead to the student. With this off the lead is tied but keeps its stage.`,
      }
    case 'converted_on_student_phone':
      return {
        title: `A student has the lead's phone number → ${stageLabel('converted')}`,
        detail: `When a student is saved with the same number as a lead (or as its second parent phone), that lead is the student's family and moves to "${stageLabel('converted')}". The family is tied either way.`,
      }
  }
}

export function stageRulesSummary(rules: StageRule[]) {
  const on = rules.filter((rule) => rule.enabled).length
  return on === rules.length ? `All ${rules.length} rules on` : `${on} of ${rules.length} rules on`
}

type Row = { key: string; enabled: boolean; options: Record<string, unknown> | null }

export function stageRulesFromRows(rows: Row[]): StageRule[] {
  return DEFAULT_STAGE_RULES.map((fallback) => {
    const row = rows.find((entry) => entry.key === fallback.key)
    if (!row) {
      return fallback
    }
    const options = row.options ?? {}
    return {
      key: fallback.key,
      enabled: row.enabled,
      countAutomated: options.count_automated !== false,
      students: options.students === 'regular' ? 'regular' : 'all',
    }
  })
}

// The table (and so the rules) does not exist before the database update; then there is nothing to show.
export function stageRulesMissing(error: { code?: string } | null) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === '42883' || error?.code === 'PGRST202'
}

export async function fetchStageRules(): Promise<StageRule[] | null> {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  const { data, error } = await supabase.from('lead_stage_rules' as never).select('key, enabled, options')
  if (error) {
    if (stageRulesMissing(error)) {
      return null
    }
    throw error
  }
  return stageRulesFromRows((data ?? []) as unknown as Row[])
}

export async function saveStageRule(rule: StageRule) {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  const options =
    rule.key === 'contacted_on_reply'
      ? { count_automated: rule.countAutomated }
      : rule.key === 'converted_on_student_phone'
        ? { students: rule.students }
        : {}
  const { error } = await supabase.rpc('set_lead_stage_rule' as never, {
    p_key: rule.key,
    p_enabled: rule.enabled,
    p_options: options,
  } as never)
  if (error) {
    throw error
  }
}

export function stageRuleErrorMessage(problem: unknown, fallback: string) {
  const code = (problem as { code?: string } | null)?.code
  if (code === '42501') {
    return 'Your account is not allowed to change these rules.'
  }
  const message = (problem as { message?: string } | null)?.message
  return message || fallback
}
