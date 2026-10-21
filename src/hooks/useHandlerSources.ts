import { useEffect, useMemo, useState } from 'react'
import { fetchStudentConsultants, fetchTagPicLinks } from '../lib/familyHandler'

// What "Handled by" needs for a chat with no lead: each student's consultant, and the PIC each tag names. Read once
// when the Inbox opens (a few hundred rows at most per page of 1000).
export function useHandlerSources(enabled: boolean) {
  const [consultants, setConsultants] = useState<Map<number, number>>(new Map())
  const [tagPics, setTagPics] = useState<Map<number, number>>(new Map())

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void Promise.all([fetchStudentConsultants(), fetchTagPicLinks()]).then(([nextConsultants, nextTagPics]) => {
      if (cancelled) return
      setConsultants(nextConsultants)
      setTagPics(nextTagPics)
    })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return useMemo(
    () => ({
      consultantOf: (studentId: number) => consultants.get(studentId),
      picOfTag: (tagId: number) => tagPics.get(tagId),
    }),
    [consultants, tagPics],
  )
}
