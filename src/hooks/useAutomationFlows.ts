import { useCallback, useEffect, useState } from 'react'
import {
  automationFlowsErrorMessage,
  deleteFlow,
  fetchFlows,
  queueFlowTest,
  runFlowsNow,
  saveFlow,
  setFlowEnabled,
  validateDraft,
  type AutomationFlow,
  type FlowDraft,
} from '../lib/automationFlows'

export type RunNowResult = { queued: number; error: null } | { queued: 0; error: string }

export type SendTestResult = { queued: number; error: string | null }

// The automation flows, with the few things an admin can do to them. Each action resolves to an
// error message, or null when it worked.
export function useAutomationFlows({ enabled }: { enabled: boolean }) {
  const [flows, setFlows] = useState<AutomationFlow[]>([])
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!enabled) {
      return
    }
    try {
      setFlows(await fetchFlows())
      setError(null)
    } catch (problem) {
      setError(automationFlowsErrorMessage(problem, "Couldn't load the automations."))
    } finally {
      setIsLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (enabled) {
      void reload()
    }
  }, [enabled, reload])

  const save = useCallback(async (draft: FlowDraft): Promise<{ error: string | null; flow: AutomationFlow | null }> => {
    const problem = validateDraft(draft)
    if (problem) {
      return { error: problem, flow: null }
    }
    try {
      const saved = await saveFlow(draft)
      setFlows((current) =>
        current.some((entry) => entry.id === saved.id)
          ? current.map((entry) => (entry.id === saved.id ? saved : entry))
          : [...current, saved],
      )
      return { error: null, flow: saved }
    } catch (failure) {
      return { error: automationFlowsErrorMessage(failure, "Couldn't save the flow."), flow: null }
    }
  }, [])

  const toggle = useCallback(
    async (id: number, value: boolean): Promise<string | null> => {
      try {
        await setFlowEnabled(id, value)
        setFlows((current) => current.map((entry) => (entry.id === id ? { ...entry, enabled: value } : entry)))
        return null
      } catch (failure) {
        await reload()
        return automationFlowsErrorMessage(failure, "Couldn't change the flow.")
      }
    },
    [reload],
  )

  const remove = useCallback(async (id: number): Promise<string | null> => {
    try {
      await deleteFlow(id)
      setFlows((current) => current.filter((entry) => entry.id !== id))
      return null
    } catch (failure) {
      return automationFlowsErrorMessage(failure, "Couldn't delete the flow.")
    }
  }, [])

  const runNow = useCallback(async (): Promise<RunNowResult> => {
    try {
      const queued = await runFlowsNow()
      await reload()
      return { queued, error: null }
    } catch (failure) {
      return { queued: 0, error: automationFlowsErrorMessage(failure, "Couldn't run the automations.") }
    }
  }, [reload])

  // Puts the messages a pretend child would get from this saved flow into the approval queue for one
  // phone number (the admin's own), to try the whole path without a real class.
  const sendTest = useCallback(
    async (
      flowId: number,
      phone: string,
      child: { age: number | null; classroomId: number | null },
    ): Promise<SendTestResult> => {
      try {
        return { queued: await queueFlowTest(flowId, phone, child), error: null }
      } catch (failure) {
        return { queued: 0, error: automationFlowsErrorMessage(failure, "Couldn't send the test.") }
      }
    },
    [],
  )

  return { flows, isLoading, error, reload, save, toggle, remove, runNow, sendTest }
}
