import { useCallback, useEffect, useState } from 'react'
import { fetchLeadSteps, leadStepErrorMessage, saveLeadStep, type LeadStepState } from '../lib/leadProgrammeSteps'

// The custom steps of one lead, for a programme's panel in the Inbox. save resolves to an error message,
// or null when it worked.
export function useLeadProgrammeSteps(leadId: number | null, userName: string | null) {
  const [steps, setSteps] = useState<Map<number, LeadStepState>>(new Map())
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSteps(new Map())
    if (leadId === null) {
      return
    }
    fetchLeadSteps(leadId)
      .then((loaded) => {
        if (!cancelled) {
          setSteps(new Map(loaded.map((entry) => [entry.stepId, entry])))
          setLoadError(null)
        }
      })
      .catch((problem) => {
        if (!cancelled) {
          setLoadError(leadStepErrorMessage(problem, "Couldn't load the steps."))
        }
      })
    return () => {
      cancelled = true
    }
  }, [leadId])

  const save = useCallback(
    async (stepId: number, next: { done: boolean; note: string; date: string }): Promise<string | null> => {
      if (leadId === null) {
        return 'Save this parent as a lead first.'
      }
      try {
        const saved = await saveLeadStep(leadId, stepId, next, userName)
        setSteps((current) => new Map(current).set(stepId, saved))
        return null
      } catch (problem) {
        return leadStepErrorMessage(problem, "Couldn't save the step.")
      }
    },
    [leadId, userName],
  )

  return { steps, loadError, save }
}
