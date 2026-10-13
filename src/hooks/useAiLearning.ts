import { useCallback, useEffect, useMemo, useState } from 'react'
import { aiKnowledgeErrorMessage } from '../lib/aiKnowledge'
import {
  buildReport,
  fetchDraftRows,
  learnableExamples,
  openGaps,
  resolveGap,
  reviewExample,
  type DraftRow,
} from '../lib/aiLearning'

// What the AI drafts and the team's real replies say about what the brain still needs: reminders about
// missing information, replies worth teaching, and how often the drafts were used as written.
export function useAiLearning({ enabled }: { enabled: boolean }) {
  const [rows, setRows] = useState<DraftRow[]>([])
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!enabled) {
      return
    }
    try {
      setRows(await fetchDraftRows())
      setError(null)
    } catch (problem) {
      setError(aiKnowledgeErrorMessage(problem, "Couldn't load what the AI has learned from the chats."))
    } finally {
      setIsLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (enabled) {
      void reload()
    }
  }, [enabled, reload])

  const gaps = useMemo(() => openGaps(rows), [rows])
  const examples = useMemo(() => learnableExamples(rows), [rows])
  const report = useMemo(() => buildReport(rows), [rows])

  // Both resolve to an error message, or null when it worked.
  const closeGap = useCallback(async (note: string): Promise<string | null> => {
    try {
      await resolveGap(note)
      setRows((current) =>
        current.map((row) =>
          row.staffNote?.trim() === note && !row.gapResolvedAt
            ? { ...row, gapResolvedAt: new Date().toISOString() }
            : row,
        ),
      )
      return null
    } catch (failure) {
      return aiKnowledgeErrorMessage(failure, "Couldn't mark this as done.")
    }
  }, [])

  const closeExample = useCallback(async (id: number): Promise<string | null> => {
    try {
      await reviewExample(id)
      setRows((current) =>
        current.map((row) => (row.id === id ? { ...row, reviewedAt: new Date().toISOString() } : row)),
      )
      return null
    } catch (failure) {
      return aiKnowledgeErrorMessage(failure, "Couldn't mark this as done.")
    }
  }, [])

  return {
    isLoading,
    error,
    reload,
    gaps,
    examples,
    report,
    closeGap,
    closeExample,
  }
}

export type AiLearning = ReturnType<typeof useAiLearning>
