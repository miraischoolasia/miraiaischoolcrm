import { useCallback, useEffect, useState } from 'react'
import {
  deleteWhatsAppNumber,
  fetchMyInboxIds,
  fetchNumberAssignments,
  fetchStudentInboxIds,
  fetchWhatsAppNumbers,
  numberDraftError,
  numberSaveMessage,
  saveWhatsAppNumber,
  setNumberStaff,
  type WhatsAppNumber,
  type WhatsAppNumberDraft,
} from '../lib/whatsappNumbers'

// The school's WhatsApp numbers, who each is given to, and which inboxes this person may see.
// `allowedInboxIds` is undefined while loading, null when nothing is restricted (an admin, or the
// numbers are not set up yet) and a list otherwise. A failed read means "not restricted", so a database
// that is not set up for this yet behaves exactly as before.
export function useWhatsAppNumbers(enabled: boolean) {
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([])
  const [assignments, setAssignments] = useState<Map<number, number[]>>(new Map())
  const [allowedInboxIds, setAllowedInboxIds] = useState<number[] | null | undefined>(enabled ? undefined : null)
  // The numbers of the Student Inbox (students zone); the Marketing Inbox leaves them out.
  const [studentInboxIds, setStudentInboxIds] = useState<number[]>([])

  const reload = useCallback(async () => {
    if (!enabled) {
      setAllowedInboxIds(null)
      return
    }
    const [list, mine, assigned, students] = await Promise.allSettled([
      fetchWhatsAppNumbers(),
      fetchMyInboxIds(),
      fetchNumberAssignments(),
      fetchStudentInboxIds(),
    ])
    setNumbers(list.status === 'fulfilled' ? list.value : [])
    setAssignments(assigned.status === 'fulfilled' ? assigned.value : new Map())
    setStudentInboxIds(students.status === 'fulfilled' ? students.value : [])
    setAllowedInboxIds(mine.status === 'fulfilled' ? mine.value : null)
  }, [enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  // Each returns an error message, or null when it worked.
  const save = useCallback(
    async (existing: WhatsAppNumber | null, draft: WhatsAppNumberDraft, teacherIds: number[]) => {
      const problem = numberDraftError(draft)
      if (problem) {
        return problem
      }
      try {
        await saveWhatsAppNumber(existing, draft)
        const fresh = await fetchWhatsAppNumbers()
        const saved = fresh.find((entry) => entry.inboxId === draft.inboxId)
        if (saved) {
          await setNumberStaff(saved.id, teacherIds)
        }
        await reload()
        return null
      } catch (failure) {
        return numberSaveMessage(failure)
      }
    },
    [reload],
  )

  const remove = useCallback(
    async (number: WhatsAppNumber) => {
      try {
        await deleteWhatsAppNumber(number)
        await reload()
        return null
      } catch (failure) {
        return numberSaveMessage(failure)
      }
    },
    [reload],
  )

  return { numbers, assignments, allowedInboxIds, studentInboxIds, reload, save, remove }
}
