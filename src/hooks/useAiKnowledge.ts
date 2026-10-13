import { useCallback, useEffect, useState } from 'react'
import {
  addNote,
  aiKnowledgeErrorMessage,
  deleteNote,
  fetchNotes,
  fetchVersions,
  reorderNotes,
  saveNote,
  setNoteEnabled,
  validateNote,
  type KnowledgeNote,
  type NoteDraft,
  type NoteVersion,
} from '../lib/aiKnowledge'

// The AI knowledge notes, with the few things an admin can do to them. Each action resolves to an
// error message, or null when it worked.
export function useAiKnowledge({ enabled }: { enabled: boolean }) {
  const [notes, setNotes] = useState<KnowledgeNote[]>([])
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!enabled) {
      return
    }
    try {
      setNotes(await fetchNotes())
      setError(null)
    } catch (problem) {
      setError(aiKnowledgeErrorMessage(problem, "Couldn't load the AI knowledge."))
    } finally {
      setIsLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (enabled) {
      void reload()
    }
  }, [enabled, reload])

  // id null adds a note. Resolves to the saved note, or the reason it was not saved.
  const save = useCallback(
    async (id: number | null, draft: NoteDraft): Promise<{ error: string | null; note: KnowledgeNote | null }> => {
      const problem = validateNote(draft)
      if (problem) {
        return { error: problem, note: null }
      }
      try {
        const saved = id === null ? await addNote(draft) : await saveNote(id, draft)
        setNotes((current) =>
          current.some((entry) => entry.id === saved.id)
            ? current.map((entry) => (entry.id === saved.id ? saved : entry))
            : [...current, saved],
        )
        return { error: null, note: saved }
      } catch (failure) {
        return { error: aiKnowledgeErrorMessage(failure, "Couldn't save the note."), note: null }
      }
    },
    [],
  )

  const toggle = useCallback(
    async (id: number, value: boolean): Promise<string | null> => {
      try {
        await setNoteEnabled(id, value)
        setNotes((current) => current.map((entry) => (entry.id === id ? { ...entry, enabled: value } : entry)))
        return null
      } catch (failure) {
        await reload()
        return aiKnowledgeErrorMessage(failure, "Couldn't change the note.")
      }
    },
    [reload],
  )

  const remove = useCallback(async (id: number): Promise<string | null> => {
    try {
      await deleteNote(id)
      setNotes((current) => current.filter((entry) => entry.id !== id))
      return null
    } catch (failure) {
      return aiKnowledgeErrorMessage(failure, "Couldn't delete the note.")
    }
  }, [])

  // Moves a note one place up (-1) or down (1).
  const move = useCallback(
    async (id: number, step: -1 | 1): Promise<string | null> => {
      const from = notes.findIndex((entry) => entry.id === id)
      const to = from + step
      if (from < 0 || to < 0 || to >= notes.length) {
        return null
      }
      const next = [...notes]
      ;[next[from], next[to]] = [next[to], next[from]]
      setNotes(next)
      try {
        await reorderNotes(next.map((entry) => entry.id))
        return null
      } catch (failure) {
        await reload()
        return aiKnowledgeErrorMessage(failure, "Couldn't change the order.")
      }
    },
    [notes, reload],
  )

  const loadVersions = useCallback(async (id: number): Promise<{ versions: NoteVersion[]; error: string | null }> => {
    try {
      return { versions: await fetchVersions(id), error: null }
    } catch (failure) {
      return { versions: [], error: aiKnowledgeErrorMessage(failure, "Couldn't load the old versions.") }
    }
  }, [])

  return { notes, isLoading, error, reload, save, toggle, remove, move, loadVersions }
}
