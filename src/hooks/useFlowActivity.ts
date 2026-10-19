import { useCallback, useEffect, useState } from 'react'
import { fetchFlowActivity, flowLogErrorMessage, type FlowActivity } from '../lib/automationLog'
import { everyWhileVisible } from '../lib/visibleTimer'

const REFRESH_MS = 60_000

// What one flow did (messages queued and sent, people left alone), loaded when its log tabs are open and
// refreshed every minute while somebody is looking.
export function useFlowActivity(flowId: number | null, active: boolean) {
  const [activity, setActivity] = useState<FlowActivity | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (flowId === null) {
      return
    }
    setIsLoading(true)
    try {
      setActivity(await fetchFlowActivity(flowId))
      setError(null)
    } catch (problem) {
      setError(flowLogErrorMessage(problem))
    } finally {
      setIsLoading(false)
    }
  }, [flowId])

  useEffect(() => {
    if (!active || flowId === null) {
      return
    }
    void reload()
    return everyWhileVisible(() => void reload(), REFRESH_MS)
  }, [active, flowId, reload])

  return { activity, isLoading, error, reload }
}
