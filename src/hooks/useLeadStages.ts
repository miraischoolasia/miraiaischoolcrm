import { useCallback, useEffect, useState } from 'react'
import {
  addLeadStage,
  changeLeadStage,
  deleteLeadStage,
  fetchLeadStages,
  reorderLeadStages,
  setLeadStages,
  stageErrorMessage,
  validateStageLabel,
  type LeadStage,
  type StageColor,
  DEFAULT_STAGES,
} from '../lib/leadStages'

// The school's lead stages. Loading them puts them into the list every stage picker in the app reads
// (leadStatusOptions), and the page that uses this hook renders again so they show. Each action resolves to
// an error message, or null when it worked.
export function useLeadStages({ enabled }: { enabled: boolean }) {
  const [stages, setStages] = useState<LeadStage[]>(DEFAULT_STAGES)
  const [error, setError] = useState<string | null>(null)

  const publish = useCallback((next: LeadStage[]) => {
    setLeadStages(next)
    setStages([...next].sort((a, b) => a.sortOrder - b.sortOrder))
  }, [])

  const reload = useCallback(async () => {
    if (!enabled) {
      return
    }
    try {
      publish(await fetchLeadStages())
      setError(null)
    } catch (problem) {
      // Before the stages exist in the database the six the CRM was made with are the stages.
      setError(stageErrorMessage(problem, "Couldn't load the stages."))
    }
  }, [enabled, publish])

  useEffect(() => {
    if (enabled) {
      void reload()
    }
  }, [enabled, reload])

  const add = useCallback(
    async (label: string, color: StageColor): Promise<string | null> => {
      const problem = validateStageLabel(label, stages)
      if (problem) {
        return problem
      }
      try {
        const last = stages.reduce((max, entry) => Math.max(max, entry.sortOrder), 0)
        publish([...stages, await addLeadStage(label, color, last + 10)])
        return null
      } catch (failure) {
        return stageErrorMessage(failure, "Couldn't add the stage.")
      }
    },
    [stages, publish],
  )

  const change = useCallback(
    async (key: string, edit: { label?: string; color?: StageColor; isActive?: boolean }): Promise<string | null> => {
      if (edit.label !== undefined) {
        const problem = validateStageLabel(
          edit.label,
          stages.filter((entry) => entry.key !== key),
        )
        if (problem) {
          return problem
        }
      }
      try {
        await changeLeadStage(key, edit)
        publish(
          stages.map((entry) =>
            entry.key === key
              ? {
                  ...entry,
                  label: edit.label !== undefined ? edit.label.trim() : entry.label,
                  color: edit.color ?? entry.color,
                  isActive: edit.isActive ?? entry.isActive,
                }
              : entry,
          ),
        )
        return null
      } catch (failure) {
        return stageErrorMessage(failure, "Couldn't change the stage.")
      }
    },
    [stages, publish],
  )

  const remove = useCallback(
    async (key: string): Promise<string | null> => {
      try {
        await deleteLeadStage(key)
        publish(stages.filter((entry) => entry.key !== key))
        return null
      } catch (failure) {
        return stageErrorMessage(failure, "Couldn't delete the stage.")
      }
    },
    [stages, publish],
  )

  // Moves a stage one place up (-1) or down (1).
  const move = useCallback(
    async (key: string, step: -1 | 1): Promise<string | null> => {
      const from = stages.findIndex((entry) => entry.key === key)
      const to = from + step
      if (from < 0 || to < 0 || to >= stages.length) {
        return null
      }
      const next = [...stages]
      ;[next[from], next[to]] = [next[to], next[from]]
      const numbered = next.map((entry, index) => ({ ...entry, sortOrder: (index + 1) * 10 }))
      publish(numbered)
      try {
        await reorderLeadStages(numbered.map((entry) => entry.key))
        return null
      } catch (failure) {
        await reload()
        return stageErrorMessage(failure, "Couldn't change the order.")
      }
    },
    [stages, publish, reload],
  )

  return { stages, error, reload, add, change, remove, move }
}

export type LeadStagesState = ReturnType<typeof useLeadStages>
