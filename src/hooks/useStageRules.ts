import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_STAGE_RULES,
  fetchStageRules,
  saveStageRule,
  stageRuleErrorMessage,
  type StageRule,
  type StageRuleKey,
} from '../lib/stageRules'

// The lead stage switches (Automations > settings). `missing` is true before the database update is applied.
export function useStageRules({ enabled }: { enabled: boolean }) {
  const [rules, setRules] = useState<StageRule[]>(DEFAULT_STAGE_RULES)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!enabled) {
      return
    }
    try {
      const loaded = await fetchStageRules()
      setMissing(loaded === null)
      if (loaded) {
        setRules(loaded)
      }
      setError(null)
    } catch (problem) {
      setError(stageRuleErrorMessage(problem, "Couldn't load the stage rules."))
    }
  }, [enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  const save = useCallback(
    async (key: StageRuleKey, change: Partial<Omit<StageRule, 'key'>>): Promise<string | null> => {
      const current = rules.find((rule) => rule.key === key)
      if (!current) {
        return null
      }
      const next = { ...current, ...change }
      try {
        await saveStageRule(next)
        setRules((list) => list.map((rule) => (rule.key === key ? next : rule)))
        return null
      } catch (problem) {
        await reload()
        return stageRuleErrorMessage(problem, "Couldn't save the change.")
      }
    },
    [rules, reload],
  )

  return { rules, missing, error, save }
}
