import { supabase } from './supabase'
import { toBase64 } from './voiceQuestion'
import type { AssistantAction, CommandContext, QuestionDraft as AiQuestion } from '../../supabase/functions/class-assistant/logic'
import type { QuestionDraft } from './questions'

export type { AssistantAction, AiQuestion }

// The live class console's AI assistant (class-assistant function): a spoken
// or typed request becomes suggested actions; a photo becomes lesson notes or
// question drafts. The teacher confirms each one; nothing happens by itself.

async function call<T>(body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.functions.invoke('class-assistant', { body })
  if (error) {
    let reason = error.message || 'The assistant did not answer.'
    try {
      const detail = await (error as { context?: Response }).context?.json()
      if (detail?.error) reason = String(detail.error)
    } catch {
      // keep the plain message
    }
    return { data: null, error: reason }
  }
  if (!data?.ok) return { data: null, error: data?.error ?? 'The assistant did not answer.' }
  return { data: data as T, error: null }
}

export async function askAssistant(input: { text?: string; audio?: Blob }, context: Omit<CommandContext, 'ageGroup'>, ageGroup: string | null) {
  const body: Record<string, unknown> = { mode: 'command', context, ageGroup }
  if (input.text) body.text = input.text
  if (input.audio) {
    if (input.audio.size === 0) return { data: null, error: 'Nothing was recorded. Check the microphone.' }
    body.audio = await toBase64(input.audio)
    body.mime = input.audio.type || 'audio/webm'
  }
  return call<{ reply: string; actions: AssistantAction[] }>(body)
}

// Photos from phones are big: shrink to at most 1600px wide as JPEG first.
export async function shrinkPhoto(file: File): Promise<Blob> {
  if (typeof createImageBitmap === 'undefined') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', 0.85))
  } catch {
    return file
  }
}

export async function readPhoto(file: File, want: 'notes' | 'questions' | 'both', ageGroup: string | null, instruction: string | null) {
  const photo = await shrinkPhoto(file)
  return call<{ notes: { title: string; body: string } | null; questions: AiQuestion[] }>({
    mode: 'image',
    image: await toBase64(photo),
    mime: photo.type || 'image/jpeg',
    want,
    howMany: 3,
    instruction,
    ageGroup,
  })
}

// An AI question as a bank question draft.
export function toBankDraft(question: AiQuestion, extra: Pick<QuestionDraft, 'subjectId' | 'ageGroups'>): QuestionDraft {
  return {
    kind: question.kind,
    prompt: question.prompt,
    options: question.kind === 'choice' ? question.options : [],
    acceptedAnswers: question.acceptedAnswers.length > 0 ? question.acceptedAnswers : [{ text: '', match: 'exact' }],
    caseSensitive: false,
    points: 10,
    timeLimitSeconds: question.timeLimitSeconds,
    topic: null,
    explanation: question.explanation,
    isShared: false,
    subjectId: extra.subjectId,
    ageGroups: extra.ageGroups,
  }
}

// ---------------------------------------------------------------------------
// Lesson notes (20261024610000_lesson_notes.sql)

export type LessonNote = { id: number; title: string; body: string; publishedAt: string | null }

export async function fetchLessonNotes(sessionId: number): Promise<LessonNote[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('class_session_lesson_notes')
    .select('id, title, body, published_at')
    .eq('session_id', sessionId)
    .order('created_at')
  if (error) return []
  return (data ?? []).map((row) => ({ id: row.id, title: row.title, body: row.body, publishedAt: row.published_at }))
}

export async function saveLessonNote(input: { id: number | null; sessionId: number; title: string; body: string; publish: boolean }) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('save_lesson_note', {
    p_id: input.id,
    p_session_id: input.sessionId,
    p_title: input.title,
    p_body: input.body,
    p_publish: input.publish,
  })
  return error ? error.message || 'Could not save the note.' : null
}

export async function deleteLessonNote(id: number) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('delete_lesson_note', { p_id: id })
  return error ? error.message || 'Could not delete the note.' : null
}
