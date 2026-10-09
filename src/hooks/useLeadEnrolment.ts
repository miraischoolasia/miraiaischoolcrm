import { useCallback, useEffect, useState } from 'react'
import {
  addLeadReceipt,
  addLeadZoomMeeting,
  deleteLeadReceipt,
  deleteLeadZoomMeeting,
  enrolmentErrorMessage,
  fetchLeadEnrolment,
  receiptLink,
  type LeadReceipt,
  type LeadZoomMeeting,
} from '../lib/leadEnrolmentApi'

// The receipts and Zoom meetings of one lead, for the enrol steps in the WhatsApp inbox.
// Each action resolves to an error message, or null when it worked.
export function useLeadEnrolment(leadId: number | null, userName: string | null) {
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

  const addMeeting = useCallback(
    async (startsAt: Date, link: string) => {
      if (leadId === null) {
        return 'Save this parent as a lead first.'
      }
      try {
        await addLeadZoomMeeting(leadId, startsAt, link, userName)
        await reload()
        return null
      } catch (problem) {
        return enrolmentErrorMessage(problem, "Couldn't save the Zoom meeting.")
      }
    },
    [leadId, userName, reload],
  )

  const removeMeeting = useCallback(
    async (meeting: LeadZoomMeeting) => {
      try {
        await deleteLeadZoomMeeting(meeting.id)
        await reload()
        return null
      } catch (problem) {
        return enrolmentErrorMessage(problem, "Couldn't remove the Zoom meeting.")
      }
    },
    [reload],
  )

  return { receipts, meetings, isLoading, loadError, addReceipt, removeReceipt, openReceipt, addMeeting, removeMeeting }
}
