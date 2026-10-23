import { useState } from 'react'
import { ZoomStep } from '../components/whatsapp/enrolSteps'
import type { LeadZoomMeeting } from '../lib/leadEnrolmentApi'
import type { ZoomSlot } from '../lib/zoomSlots'

// Only the dev server shows this (/?demo=zoomstep): the Zoom step of the enrol panel with made-up Zoom
// times and no network, to look at the picker without a real calendar or chat.

const DAY = 86_400_000

function slotAt(days: number, hour: number, minute: number, id: number, title: string): ZoomSlot {
  const date = new Date(Date.now() + days * DAY)
  date.setHours(hour, minute, 0, 0)
  return { id, startsAt: date, link: `https://zoom.us/j/${id}00`, title }
}

const SLOTS: ZoomSlot[] = [
  slotAt(2, 10, 0, 1, 'Parent Zoom'),
  slotAt(3, 15, 30, 2, 'HOA intro with Teacher Mei'),
  slotAt(5, 20, 0, 3, 'Parent Zoom'),
  slotAt(6, 11, 0, 4, 'Parent Zoom'),
  slotAt(8, 14, 0, 5, 'Open day'),
  slotAt(9, 19, 30, 6, 'Parent Zoom'),
]

function Card({ title, slots }: { title: string; slots: ZoomSlot[] }) {
  const [meetings, setMeetings] = useState<LeadZoomMeeting[]>([])
  const enrolment = {
    meetings,
    addMeeting: async (startsAt: Date, link: string, slotItemId?: number | null) => {
      setMeetings((current) => [
        ...current,
        {
          id: current.length + 1,
          leadId: 1,
          startsAt: startsAt.toISOString(),
          link,
          addedBy: 'Demo',
          status: 'scheduled' as const,
          calendarItemId: slotItemId ?? null,
        },
      ])
      return null
    },
    rescheduleMeeting: async (meeting: LeadZoomMeeting, startsAt: Date, link: string) => {
      setMeetings((current) =>
        current.map((entry) => (entry.id === meeting.id ? { ...entry, startsAt: startsAt.toISOString(), link } : entry)),
      )
      return null
    },
    setMeetingStatus: async (meeting: LeadZoomMeeting, status: LeadZoomMeeting['status']) => {
      setMeetings((current) => current.map((entry) => (entry.id === meeting.id ? { ...entry, status } : entry)))
      return null
    },
    removeMeeting: async (meeting: LeadZoomMeeting) => {
      setMeetings((current) => current.filter((entry) => entry.id !== meeting.id))
      return null
    },
  }
  return (
    <div className="w-[300px] shrink-0">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
        <ZoomStep
          number={4}
          enrolment={enrolment as never}
          canEdit
          slots={slots}
          hint="This is usually set after the parent has filled in the form."
        />
      </div>
    </div>
  )
}

export function ZoomStepDemo() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Zoom step (made-up times)</h1>
      <div className="flex flex-wrap gap-6">
        <Card title="Calendar has Zoom times" slots={SLOTS} />
        <Card title="Calendar has none" slots={[]} />
      </div>
    </div>
  )
}
