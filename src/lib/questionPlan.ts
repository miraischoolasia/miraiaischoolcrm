import { supabase } from './supabase'
import type { LiveQuestion } from './liveQuestions'

// The lesson's question plan: bank questions lined up before class, popped
// one after another in class (20261023120000_live_class_tools.sql).

export async function fetchQuestionPlan(sessionId: number): Promise<number[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('class_session_question_plan')
    .select('question_id, position')
    .eq('session_id', sessionId)
    .order('position')
  if (error) return []
  return (data ?? []).map((row) => row.question_id)
}

export async function saveQuestionPlan(sessionId: number, questionIds: number[]) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_class_session_plan', { p_session_id: sessionId, p_question_ids: questionIds })
  return error ? error.message || 'Could not save the plan.' : null
}

// The first planned question not popped yet in this lesson.
export function nextPlanned(plan: number[], popped: Pick<LiveQuestion, 'questionId'>[]) {
  const done = new Set(popped.map((question) => question.questionId))
  return plan.find((id) => !done.has(id)) ?? null
}

export function moveInPlan(plan: number[], questionId: number, step: -1 | 1) {
  const index = plan.indexOf(questionId)
  const target = index + step
  if (index < 0 || target < 0 || target >= plan.length) return plan
  const next = [...plan]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
