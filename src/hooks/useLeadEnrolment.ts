import { useCallback, useEffect, useState } from 'react'
import {
  addLeadReceipt,
  addLeadZoomMeeting,
  deleteLeadReceipt,
  deleteLeadZoomMeeting,
  enrolmentErrorMessage,
  fetchLeadEnrolment,
  receiptLink,
  updateLeadZoomMeeting,
  type LeadReceipt,
  type LeadZoomMeeting,
  type ZoomMeetingStatus,
} from '../lib/leadEnrolmentApi'
import { createLeadMeetingItem, deleteLeadMeetingItem, moveLeadMeetingItem } from '../lib/calendarItems'

// The receipts and Zoom meetings of one lead, for the enrol steps in the WhatsApp inbox.
// Each action resolves to an error message, or null when it worked.
export function useLeadEnrolment(leadId: number | null, userName: string | null, teacherId: number | null = null) {
  const [receipts, setReceipts] = useState<LeadReceipt[]>([])
  const [meetings, setMeetings] = useState<LeadZoomMeeting[]>([])
  const [isLoading, setIsLoading] = useState(leadId !== null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (leadId === null) {
      return
    }
    try {
      const loaded = await fetchLeadEnrolment(leadId)
      setReceipts(loaded.receipts)
      setMeetings(loaded.meetings)
      setLoadError(null)
    } catch (problem) {
      setLoadError(enrolmentErrorMessage(problem, "Couldn't load the receipts and Zoom meetings."))
    } finally {
      setIsLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    setReceipts([])
    setMeetings([])
    setIsLoading(leadId !== null)
    void reload()
  }, [leadId, reload])

  const addReceipt = useCallback(
    async (file: File) => {
      if (leadId === null) {
        return 'Save this parent as a lead first.'
      }
      try {
        await addLeadReceipt(leadId, file, userName)
        await reload()
        return null
      } catch (problem) {
        return enrolmentErrorMessage(problem, "Couldn't save the receipt.")
      }
    },
    [leadId, userName, reload],
  )

  const removeReceipt = useCallback(
    async (receipt: LeadReceipt) => {
      try {
        await deleteLeadReceipt(receipt)
        await reload()
        return null
      } catch (problem) {
        return enrolmentErrorMessage(problem, "Couldn't remove the receipt.")
      }
    },
    [reload],
  )

  const openReceipt = useCallback(async (receipt: LeadReceipt) => {
    try {
      window.open(await receiptLink(receipt), '_blank', 'noopener')
      return null
    } catch (problem) {
      return enrolmentErrorMessage(problem, "Couldn't open the receipt.")
    }
  }, [])

  // The calendar entry for a meeting: the shared slot the parent was put into (slotItemId), or, for a time typed in by
  // hand, a new entry made for this parent alone. If the calendar refuses (no calendar tick), the meeting is still saved.
  const calendarItemFor = useCallback(
    async (startsAt: Date, link: string, slotItemId: number | null | undefined) => {
      if (slotItemId !== undefined) {
        return slotItemId
      }
      if (leadId === null) {
        return null
      }
      try {
        return await createLeadMeetingItem({ leadId, startsAt, link, createdBy: teacherId })
      } catch {
        return null
      }
    },
    [leadId, teacherId],
  )

  // slotItemId: the calendar slot picked; leave it out for a time typed in by hand.
  const addMeeting = useCallback(
    async (startsAt: Date, link: string, slotItemId?: number | null) => {
      if (leadId === null) {
        return 'Save this parent as a lead first.'
      }
      try {
        const calendarItemId = await calendarItemFor(startsAt, link, slotItemId)
        await addLeadZoomMeeting(leadId, startsAt, link, userName, calendarItemId)
        await reload()
        return null
      } catch (problem) {
        return enrolmentErrorMessage(problem, "Couldn't save the Zoom meeting.")
      }
    },
    [leadId, userName, reload, calendarItemFor],
  )

  // A new time (and link) for a meeting that is still on. A calendar entry made for this parent moves with it; a shared
  // slot is left alone and the parent is put into the new one.
  const rescheduleMeeting = useCallback(
    async (meeting: LeadZoomMeeting, startsAt: Date, link: string, slotItemId?: number | null) => {
      if (leadId === null) {
        return 'Save this parent as a lead first.'
      }
      try {
        if (slotItemId !== undefined) {
          if (meeting.calendarItemId !== null && meeting.calendarItemId !== slotItemId) {
            await deleteLeadMeetingItem(meeting.calendarItemId, leadId)
          }
          await updateLeadZoomMeeting(meeting.id, { startsAt, link, calendarItemId: slotItemId })
        } else if (meeting.calendarItemId !== null) {
          await moveLeadMeetingItem(meeting.calendarItemId, leadId, startsAt, link)
          await updateLeadZoomMeeting(meeting.id, { startsAt, link })
        } else {
          const calendarItemId = await calendarItemFor(startsAt, link, undefined)
          await updateLeadZoomMeeting(meeting.id, { startsAt, link, calendarItemId })
        }
        await reload()
        return null
      } catch (problem) {
        return enrolmentErrorMessage(problem, "Couldn't change the Zoom meeting.")
      }
    },
    [leadId, reload, calendarItemFor],
  )

  // Complete or cancel. Cancelling also takes away the calendar entry made for this parent alone.
  const setMeetingStatus = useCallback(
    async (meeting: LeadZoomMeeting, status: ZoomMeetingStatus) => {
      try {
        await updateLeadZoomMeeting(meeting.id, { status })
        if (status === 'cancelled' && meeting.calendarItemId !== null && leadId !== null) {
          await deleteLeadMeetingItem(meeting.calendarItemId, leadId)
        }
        await reload()
        return null
      } catch (problem) {
        return enrolmentErrorMessage(problem, "Couldn't change the Zoom meeting.")
      }
    },
    [leadId, reload],
  )

  const removeMeeting = useCallback(
    async (meeting: LeadZoomMeeting) => {
      try {
        await deleteLeadZoomMeeting(meeting.id)
        if (meeting.calendarItemId !== null && leadId !== null) {
          await deleteLeadMeetingItem(meeting.calendarItemId, leadId)
        }
        await reload()
        return null
      } catch (problem) {
        return enrolmentErrorMessage(problem, "Couldn't remove the Zoom meeting.")
      }
    },
    [leadId, reload],
  )

  return {
    receipts,
    meetings,
    isLoading,
    loadError,
    addReceipt,
    removeReceipt,
    openReceipt,
    addMeeting,
    rescheduleMeeting,
    setMeetingStatus,
    removeMeeting,
  }
}
