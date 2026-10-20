import { useCallback, useEffect, useState } from 'react'
import { fetchStudentTags, setStudentTags } from '../lib/personTags'

// The tags of the enrolled students (student id -> tag ids), read when the page loads and again when the number of
// students changes (a lead that became a student brings its tags). `save` sets one
// student's tags at once on screen and returns the reason when the database refused (the screen then
// goes back to what the database has).
export function useStudentTags(signedIn: boolean, loadAttempt: number, studentCount: number) {
  const [tags, setTags] = useState<Map<number, number[]>>(new Map())

  const refresh = useCallback(async () => {
    setTags(await fetchStudentTags())
  }, [])

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    void fetchStudentTags().then((next) => {
      if (!cancelled) setTags(next)
    })
    return () => {
      cancelled = true
    }
  }, [signedIn, loadAttempt, studentCount])

  const save = useCallback(
    async (studentId: number, tagIds: number[]) => {
      setTags((current) => {
        const next = new Map(current)
        if (tagIds.length > 0) next.set(studentId, tagIds)
        else next.delete(studentId)
        return next
      })
      const problem = await setStudentTags(studentId, tagIds)
      if (problem) await refresh()
      return problem
    },
    [refresh],
  )

  return { tags, refresh, save }
}
