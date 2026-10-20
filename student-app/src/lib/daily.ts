import { useCallback, useEffect, useState } from 'react'

import { canClaim, type Daily, type PracticeNext, type PracticeResult } from './dailyRules'
import { supabase } from './supabase'

export * from './dailyRules'

// Daily check-in, daily tasks and daily practice (the CRM's
// 20261027100000_student_daily.sql, portal_daily and friends). The school
// sets them in the CRM; the coins are points like any other.

async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}

export function fetchDaily(studentId: number) {
  return call<Daily>('portal_daily', { p_student_id: studentId })
}

export function checkIn(studentId: number) {
  return call<{ coins: number; streak: number }>('portal_check_in', { p_student_id: studentId })
}

export function claimTask(studentId: number, taskId: number) {
  return call<{ coins: number }>('portal_claim_task', { p_student_id: studentId, p_task_id: taskId })
}

export function practiceNext(studentId: number) {
  return call<PracticeNext>('portal_practice_next', { p_student_id: studentId })
}

export function practiceAnswer(studentId: number, questionId: number, answer: { choices: number[] } | { text: string }) {
  return call<PracticeResult>('portal_practice_answer', { p_student_id: studentId, p_live_question_id: questionId, p_answer: answer })
}

// Today for the picked child, with the actions that change it. `onCoins`
// runs after coins were earned (the home reloads the points).
export function useDaily(studentId: number | null, onCoins?: () => void) {
  // Kept with the child it belongs to, so another child never sees it.
  const [loaded, setLoaded] = useState<{ studentId: number; daily: Daily | null } | null>(null)
  const daily = loaded && loaded.studentId === studentId ? loaded.daily : null
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    if (!studentId) return
    try {
      const next = await fetchDaily(studentId)
      setLoaded({ studentId, daily: next })
      setError(null)
    } catch (problem) {
      // A school whose database does not have daily tasks yet: nothing shows.
      setLoaded({ studentId, daily: null })
      setError(problem instanceof Error ? problem.message : 'Could not load today.')
    }
  }, [studentId])

  useEffect(() => {
    if (!studentId) return
    let cancelled = false
    fetchDaily(studentId).then(
      (next) => !cancelled && setLoaded({ studentId, daily: next }),
      (problem: unknown) => {
        if (cancelled) return
        // A school whose database does not have daily tasks yet: nothing shows.
        setLoaded({ studentId, daily: null })
        setError(problem instanceof Error ? problem.message : 'Could not load today.')
      },
    )
    return () => {
      cancelled = true
    }
  }, [studentId])

  const act = useCallback(
    async (run: () => Promise<unknown>) => {
      setBusy(true)
      try {
        await run()
        setError(null)
        onCoins?.()
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : 'Something went wrong.')
      } finally {
        setBusy(false)
        await reload()
      }
    },
    [onCoins, reload],
  )

  return {
    daily,
    error,
    busy,
    reload,
    checkIn: () => (studentId ? act(() => checkIn(studentId)) : Promise.resolve()),
    claim: (taskId: number) => (studentId ? act(() => claimTask(studentId, taskId)) : Promise.resolve()),
  }
}
