import { useEffect, useMemo, useState } from 'react'
import { fetchLeadSteps } from '../lib/leadProgrammeSteps'
import type { Programme } from '../lib/programmes'
import type { TrialBooking } from '../types/domain'

// The programmes a lead is already being followed up on, as the keys the Inbox panel uses (the programme id as
// text): those with a step of their own that was saved for the lead, and those with a class booked for them.
// A read that fails leaves the list to the bookings: the panel still works, it just has fewer tabs.
export function useFollowedProgrammes({
  leadId,
  programmes,
  bookings,
  bookingProgrammeId,
}: {
  leadId: number | null
  programmes: Programme[] | undefined
  bookings: TrialBooking[]
  bookingProgrammeId?: (booking: TrialBooking) => number | null
}) {
  const [stepIds, setStepIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    let cancelled = false
    setStepIds(new Set())
    if (leadId === null || !programmes || programmes.length === 0) {
      return undefined
    }
    fetchLeadSteps(leadId)
      .then((rows) => {
        if (!cancelled) {
          setStepIds(new Set(rows.map((row) => row.stepId)))
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [leadId, programmes])

  return useMemo(() => {
    const keys = new Set<string>()
    for (const programme of programmes ?? []) {
      if (programme.steps.some((step) => stepIds.has(step.id))) {
        keys.add(String(programme.id))
      }
    }
    if (leadId !== null && bookingProgrammeId) {
      for (const booking of bookings) {
        const id = booking.leadId === leadId ? bookingProgrammeId(booking) : null
        if (id !== null) {
          keys.add(String(id))
        }
      }
    }
    return keys
  }, [programmes, stepIds, leadId, bookings, bookingProgrammeId])
}
