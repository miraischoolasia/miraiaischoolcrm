import { supabase } from './supabase'
import { composeKnowledge, MAX_KNOWLEDGE_CHARS } from '../../supabase/functions/ai-draft/logic'

// The school knowledge the AI reply drafts use, kept as separate notes an admin edits. The function
// `ai-draft` reads every note that is on, in this order, each time it writes a draft, so a saved
// change works from the next draft with no deploy. Every change of a note's wording keeps the old
// wording in its history (the last 30), so it can be put back.

export const MAX_NOTES = 30
export const MAX_TITLE = 80
export const MAX_BODY = 20000
// Past this many characters in all, the AI question gets long and slow; the page warns.
export const LONG_KNOWLEDGE_CHARS = 30000
export { MAX_KNOWLEDGE_CHARS }

export type KnowledgeNote = {
  id: number
  title: string
  body: string
  enabled: boolean
  updatedAt: string
}

export type NoteVersion = {
  id: number
  title: string
  body: string
  // When this wording was saved (not when it was replaced).
  writtenAt: string
}

export type NoteDraft = { title: string; body: string; enabled: boolean }

type NoteRow = {
  id: number
  title: string
  body: string
  enabled: boolean
  updated_at: string
}

const NOTE_COLUMNS = 'id, title, body, enabled, updated_at'

function noteOf(row: NoteRow): KnowledgeNote {
  return { id: row.id, title: row.title, body: row.body, enabled: row.enabled, updatedAt: row.updated_at }
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  return supabase
}

// Sentence for a person when the database says no (or has no such table yet).
export function aiKnowledgeErrorMessage(problem: unknown, fallback: string) {
  const text =
    problem instanceof Error
      ? problem.message
      : typeof problem === 'object' && problem && 'message' in problem
        ? String((problem as { message: unknown }).message)
        : ''
  const code =
    typeof problem === 'object' && problem && 'code' in problem ? String((problem as { code: unknown }).code) : ''
  if (
    /ai_knowledge_notes|reorder_ai_knowledge_notes/.test(text) &&
    /(does not exist|schema cache|Could not find)/.test(text)
  ) {
    return 'The AI knowledge notes are not set up in the database yet.'
  }
  if (/row-level security|permission denied|Only an admin/i.test(text)) {
    return 'Only an admin can change the AI knowledge.'
  }
  if (code === 'P0001' && text) {
    return text
  }
  return fallback
}

// Why a note cannot be saved yet, or null when it can.
export function validateNote(draft: Pick<NoteDraft, 'title' | 'body'>): string | null {
  const title = draft.title.trim()
  if (title === '') {
    return 'Give the note a title.'
  }
  if (title.length > MAX_TITLE) {
    return `The title can be up to ${MAX_TITLE} characters.`
  }
  if (draft.body.length > MAX_BODY) {
    return `A note can be up to ${MAX_BODY.toLocaleString('en-US')} characters (this one has ${draft.body.length.toLocaleString('en-US')}).`
  }
  return null
}

// What the AI reads: every note that is on, in order (the same function the AI side uses).
export function knowledgeText(notes: KnowledgeNote[]): string {
  return composeKnowledge(notes.filter((note) => note.enabled).map((note) => ({ title: note.title, body: note.body })))
}

export type KnowledgeSummary = { total: number; on: number; characters: number; tooLong: boolean; cutOff: boolean }

export function summarizeKnowledge(notes: KnowledgeNote[]): KnowledgeSummary {
  const on = notes.filter((note) => note.enabled && note.body.trim() !== '')
  const characters = on.reduce((sum, note) => sum + note.title.trim().length + note.body.trim().length + 5, 0)
  return {
    total: notes.length,
    on: notes.filter((note) => note.enabled).length,
    characters,
    tooLong: characters > LONG_KNOWLEDGE_CHARS,
    cutOff: characters > MAX_KNOWLEDGE_CHARS,
  }
}

export async function fetchNotes(): Promise<KnowledgeNote[]> {
  const { data, error } = await requireSupabase()
    .from('ai_knowledge_notes')
    .select(NOTE_COLUMNS)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => noteOf(row as NoteRow))
}

export async function addNote(draft: NoteDraft): Promise<KnowledgeNote> {
  const { data, error } = await requireSupabase()
    .from('ai_knowledge_notes')
    .insert({ title: draft.title.trim(), body: draft.body, enabled: draft.enabled })
    .select(NOTE_COLUMNS)
    .single()
  if (error) {
    throw error
  }
  return noteOf(data as NoteRow)
}

export async function saveNote(id: number, draft: NoteDraft): Promise<KnowledgeNote> {
  const { data, error } = await requireSupabase()
    .from('ai_knowledge_notes')
    .update({ title: draft.title.trim(), body: draft.body, enabled: draft.enabled })
    .eq('id', id)
    .select(NOTE_COLUMNS)
  if (error) {
    throw error
  }
  const row = (data ?? [])[0]
  if (!row) {
    // The database hides a row you may not change instead of failing.
    throw new Error('Only an admin can change the AI knowledge.')
  }
  return noteOf(row as NoteRow)
}

export async function setNoteEnabled(id: number, enabled: boolean) {
  const { data, error } = await requireSupabase()
    .from('ai_knowledge_notes')
    .update({ enabled })
    .eq('id', id)
    .select('id')
  if (error) {
    throw error
  }
  if ((data ?? []).length === 0) {
    throw new Error('Only an admin can change the AI knowledge.')
  }
}

export async function deleteNote(id: number) {
  const { data, error } = await requireSupabase().from('ai_knowledge_notes').delete().eq('id', id).select('id')
  if (error) {
    throw error
  }
  if ((data ?? []).length === 0) {
    throw new Error('Only an admin can change the AI knowledge.')
  }
}

// ids in the order the AI should read them.
export async function reorderNotes(ids: number[]) {
  const { error } = await requireSupabase().rpc('reorder_ai_knowledge_notes', { p_ids: ids })
  if (error) {
    throw error
  }
}

// The earlier wordings of a note, newest first.
export async function fetchVersions(noteId: number): Promise<NoteVersion[]> {
  const { data, error } = await requireSupabase()
    .from('ai_knowledge_note_versions')
    .select('id, title, body, written_at')
    .eq('note_id', noteId)
    .order('id', { ascending: false })
    .limit(30)
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    writtenAt: row.written_at,
  }))
}
