import { useCallback, useEffect, useState } from 'react'
import {
  addProgramme,
  addStep,
  deleteProgramme,
  deleteStep,
  fetchProgrammes,
  programmeErrorMessage,
  renameStep,
  reorderProgrammes,
  reorderSteps,
  saveProgramme,
  validateProgramme,
  validateStepTitle,
  type Programme,
  type ProgrammeDraft,
  type ProgrammeStep,
  type StepKind,
} from '../lib/programmes'

// The programmes of the school, with the few things an admin can do to them. Each action resolves to an
// error message, or null when it worked.
export function useProgrammes({ enabled }: { enabled: boolean }) {
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!enabled) {
      return
    }
    try {
      setProgrammes(await fetchProgrammes())
      setError(null)
    } catch (problem) {
      setError(programmeErrorMessage(problem, "Couldn't load the programmes."))
    } finally {
      setIsLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (enabled) {
      void reload()
    }
  }, [enabled, reload])

  const replace = useCallback((saved: Programme) => {
    setProgrammes((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)))
  }, [])

  // Resolves to the new programme, or the reason it was not made.
  const add = useCallback(
    async (name: string): Promise<{ error: string | null; programme: Programme | null }> => {
      const problem = validateProgramme({ name, messageTemplate: '' })
      if (problem) {
        return { error: problem, programme: null }
      }
      try {
        const last = programmes.reduce((max, entry) => Math.max(max, entry.sortOrder), 0)
        const created = await addProgramme(name, last + 10)
        setProgrammes((current) => [...current, created])
        return { error: null, programme: created }
      } catch (failure) {
        return { error: programmeErrorMessage(failure, "Couldn't make the programme."), programme: null }
      }
    },
    [programmes],
  )

  const save = useCallback(
    async (id: number, draft: ProgrammeDraft): Promise<string | null> => {
      const problem = validateProgramme(draft)
      if (problem) {
        return problem
      }
      try {
        await saveProgramme(id, draft)
        setProgrammes((current) =>
          current.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  name: draft.name.trim(),
                  outcome: draft.outcome,
                  messageTemplate: draft.messageTemplate,
                  isActive: draft.isActive,
                  category: draft.category.trim() || null,
                }
              : entry,
          ),
        )
        return null
      } catch (failure) {
        return programmeErrorMessage(failure, "Couldn't save the programme.")
      }
    },
    [],
  )

  const remove = useCallback(async (id: number): Promise<string | null> => {
    try {
      await deleteProgramme(id)
      setProgrammes((current) => current.filter((entry) => entry.id !== id))
      return null
    } catch (failure) {
      return programmeErrorMessage(failure, "Couldn't delete the programme.")
    }
  }, [])

  // Moves a programme one place up (-1) or down (1).
  const move = useCallback(
    async (id: number, step: -1 | 1): Promise<string | null> => {
      const from = programmes.findIndex((entry) => entry.id === id)
      const to = from + step
      if (from < 0 || to < 0 || to >= programmes.length) {
        return null
      }
      const next = [...programmes]
      ;[next[from], next[to]] = [next[to], next[from]]
      setProgrammes(next)
      try {
        await reorderProgrammes(next.map((entry) => entry.id))
        return null
      } catch (failure) {
        await reload()
        return programmeErrorMessage(failure, "Couldn't change the order.")
      }
    },
    [programmes, reload],
  )

  const putStep = useCallback(
    async (programmeId: number, step: ProgrammeStep | null, kind: StepKind | null, title: string): Promise<string | null> => {
      const problem = validateStepTitle(title)
      if (problem) {
        return problem
      }
      try {
        if (step) {
          await renameStep(step.id, title)
          setProgrammes((current) =>
            current.map((entry) =>
              entry.id === programmeId
                ? { ...entry, steps: entry.steps.map((item) => (item.id === step.id ? { ...item, title: title.trim() } : item)) }
                : entry,
            ),
          )
        } else if (kind) {
          const owner = programmes.find((entry) => entry.id === programmeId)
          const last = owner?.steps.reduce((max, item) => Math.max(max, item.sortOrder), 0) ?? 0
          const created = await addStep(programmeId, kind, title, last + 10)
          setProgrammes((current) =>
            current.map((entry) => (entry.id === programmeId ? { ...entry, steps: [...entry.steps, created] } : entry)),
          )
        }
        return null
      } catch (failure) {
        return programmeErrorMessage(failure, "Couldn't save the step.")
      }
    },
    [programmes],
  )

  const removeStep = useCallback(async (programmeId: number, stepId: number): Promise<string | null> => {
    try {
      await deleteStep(stepId)
      setProgrammes((current) =>
        current.map((entry) =>
          entry.id === programmeId ? { ...entry, steps: entry.steps.filter((item) => item.id !== stepId) } : entry,
        ),
      )
      return null
    } catch (failure) {
      return programmeErrorMessage(failure, "Couldn't remove the step.")
    }
  }, [])

  const moveStep = useCallback(
    async (programmeId: number, stepId: number, direction: -1 | 1): Promise<string | null> => {
      const owner = programmes.find((entry) => entry.id === programmeId)
      if (!owner) {
        return null
      }
      const from = owner.steps.findIndex((item) => item.id === stepId)
      const to = from + direction
      if (from < 0 || to < 0 || to >= owner.steps.length) {
        return null
      }
      const next = [...owner.steps]
      ;[next[from], next[to]] = [next[to], next[from]]
      replace({ ...owner, steps: next })
      try {
        await reorderSteps(programmeId, next.map((item) => item.id))
        return null
      } catch (failure) {
        await reload()
        return programmeErrorMessage(failure, "Couldn't change the order.")
      }
    },
    [programmes, reload, replace],
  )

  return { programmes, isLoading, error, reload, add, save, remove, move, putStep, removeStep, moveStep }
}

export type ProgrammesState = ReturnType<typeof useProgrammes>
