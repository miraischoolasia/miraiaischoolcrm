import { useCallback, useEffect, useState } from 'react'
import type { SourceRule } from '../lib/sourceRules'
import {
  deleteSourceRule,
  fetchSourceRules,
  saveSourceRule,
  sourceRuleErrorMessage,
  type SourceRuleDraft,
} from '../lib/sourceRulesApi'

// The team's source rules. A failure to load just means no rules, so the inbox
// falls back to guessing from the names of the sources and tags.
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

  // Each returns an error message, or null when it worked.
  const save = useCallback(
    async (existing: SourceRule | null, draft: SourceRuleDraft) => {
      try {
        await saveSourceRule(existing, draft)
        await reload()
        return null
      } catch (problem) {
        return sourceRuleErrorMessage(problem, "Couldn't save this rule.")
      }
    },
    [reload],
  )

  const remove = useCallback(
    async (rule: SourceRule) => {
      try {
        await deleteSourceRule(rule)
        await reload()
        return null
      } catch (problem) {
        return sourceRuleErrorMessage(problem, "Couldn't delete this rule.")
      }
    },
    [reload],
  )

  return { rules, isLoading, error, save, remove }
}
