import { useCallback, useEffect, useState } from 'react'
import type { SourceRule } from '../lib/sourceRules'
import { fetchSourceRules, sourceRuleErrorMessage } from '../lib/sourceRulesApi'

// The school's source keywords (written by the source keyword flows on the Automations page). A failure to load
// just means no rules, so the inbox falls back to guessing from the names of the sources and tags.
export function useSourceRules(enabled: boolean) {
  const [rules, setRules] = useState<SourceRule[]>([])
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!enabled) {
      return
    }
    try {
      setRules(await fetchSourceRules())
      setError(null)
    } catch (problem) {
      setError(sourceRuleErrorMessage(problem, "Couldn't load the source rules."))
    } finally {
      setIsLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  return { rules, isLoading, error, reload }
}
