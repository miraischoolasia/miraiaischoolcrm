import { supabase } from './supabase'

// Where one lead is on the steps of their own that a programme has (not the form, class, receipt or Zoom
// steps, which keep their own records): a tick, a note and a date, saved by whoever works on the lead.

export const MAX_NOTE = 1000

export type LeadStepState = {
  stepId: number
  done: boolean
  note: string
  // YYYY-MM-DD, or empty.
  date: string
  updatedBy: string | null
}

type Row = {
  step_id: number
  done: boolean
  note: string | null
  step_date: string | null
  updated_by: string | null
}

const COLUMNS = 'step_id, done, note, step_date, updated_by'

function stateOf(row: Row): LeadStepState {
  return {
    stepId: row.step_id,
    done: row.done,
    note: row.note ?? '',
    date: row.step_date ?? '',
    updatedBy: row.updated_by,
  }
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  return supabase
}

// Sentence for a person when the database says no (or has no such table yet).
export function leadStepErrorMessage(problem: unknown, fallback: string) {
  const text =
    problem instanceof Error
      ? problem.message
      : typeof problem === 'object' && problem && 'message' in problem
        ? String((problem as { message: unknown }).message)
        : ''
  if (/lead_programme_steps/.test(text) && /(does not exist|schema cache|Could not find)/.test(text)) {
    return 'Programme steps are not set up in the database yet.'
  }
  if (/row-level security|permission denied/i.test(text)) {
    return "You can't change this lead."
  }
  return fallback
}

export async function fetchLeadSteps(leadId: number): Promise<LeadStepState[]> {
  const { data, error } = await requireSupabase().from('lead_programme_steps').select(COLUMNS).eq('lead_id', leadId)
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => stateOf(row as Row))
}

export async function saveLeadStep(
  leadId: number,
  stepId: number,
  next: { done: boolean; note: string; date: string },
  userName: string | null,
): Promise<LeadStepState> {
  const { data, error } = await requireSupabase()
    .from('lead_programme_steps')
    .upsert(
      {
        lead_id: leadId,
        step_id: stepId,
        done: next.done,
        note: next.note.trim() === '' ? null : next.note.trim().slice(0, MAX_NOTE),
        step_date: next.date === '' ? null : next.date,
        updated_by: userName,
      },
      { onConflict: 'lead_id,step_id' },
    )
    .select(COLUMNS)
    .single()
  if (error) {
    throw error
  }
  return stateOf(data as Row)
}
