import { useState } from 'react'
import { CheckCircle, FilePdf, Trash } from '@phosphor-icons/react'
import type { useLeadEnrolment } from '../../hooks/useLeadEnrolment'
import { formatDate } from '../../domain/studentStatus'
import { formatZoomTime } from '../../lib/enrolMessage'
import type { ZoomSlot } from '../../lib/zoomSlots'
import { prepareReceipt } from '../../lib/receiptPdf'
import { hasZoomMeeting } from '../../lib/zoomMeetingStatus'

// The pieces the enrol panels (HOA and Holiday Camp) have in common.

export const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-[#fc0c97] disabled:bg-slate-50'
export const buttonClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'

// tone: idle = nothing set yet (grey), active = something is scheduled (coloured), finished = it took place (green).
const STEP_TONE = {
  idle: 'border-slate-200 bg-slate-50 text-slate-500',
  active: 'border-indigo-300 bg-indigo-50/40',
  finished: 'border-emerald-300 bg-emerald-50/40',
} as const

export function Step({
  number,
  done,
  title,
  tone,
  children,
}: {
  number: number
  done: boolean
  title: string
  tone?: keyof typeof STEP_TONE
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-lg border p-3 ${tone ? STEP_TONE[tone] : 'border-slate-200'}`}>
      <h5 className="flex items-center gap-2 font-semibold text-slate-800">
        {done ? (
          <CheckCircle size={18} weight="fill" className="text-emerald-600" aria-label="Done" />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-slate-300 text-[11px] text-slate-500"
          >
            {number}
          </span>
        )}
        {title}
      </h5>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  )
}

export function Problem({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="text-red-600">
      {text}
    </p>
  ) : null
}

type Enrolment = ReturnType<typeof useLeadEnrolment>

// The payment receipt: kept with the lead as one PDF (a photo is turned into a PDF here).
export function ReceiptStep({
  number,
  enrolment,
  canEdit,
  title = 'Payment receipt',
}: {
  number: number
  enrolment: Enrolment
  canEdit: boolean
  // The programme's own name for the step.
  title?: string
}) {
  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  async function choose(file: File | undefined) {
    if (!file) {
      return
    }
    setUploading(true)
    setProblem(null)
    setNote(null)
    try {
      const prepared = await prepareReceipt(file)
      const failed = await enrolment.addReceipt(prepared.file)
      if (failed) {
        setProblem(failed)
      } else {
        setNote(prepared.converted ? 'The photo was saved as a PDF.' : 'Saved.')
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Couldn't save the receipt.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <Step number={number} done={enrolment.receipts.length > 0} title={title}>
      {enrolment.receipts.map((receipt) => (
        <div key={receipt.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => void enrolment.openReceipt(receipt).then(setProblem)}
            className="flex min-w-0 items-center gap-1.5 text-left font-medium text-slate-800 hover:underline"
          >
            <FilePdf size={16} aria-hidden="true" className="shrink-0 text-red-600" />
            <span className="truncate">{receipt.name}</span>
          </button>
          <span className="shrink-0 text-slate-500">{formatDate(receipt.createdAt.slice(0, 10))}</span>
          {canEdit && (
            <button
              type="button"
              onClick={() => void enrolment.removeReceipt(receipt).then(setProblem)}
              aria-label={`Remove ${receipt.name}`}
              className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100"
            >
              <Trash size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <label className="block">
          <span className="text-slate-600">Upload the receipt (a PDF, or a photo that becomes a PDF)</span>
          <input
            type="file"
            accept="application/pdf,image/*"
            disabled={uploading}
            onChange={(event) => {
              void choose(event.target.files?.[0])
              event.target.value = ''
            }}
            className="mt-1 block w-full text-xs"
          />
        </label>
      )}
      {uploading && <p className="text-slate-500">Saving...</p>}
      {note && <p className="text-emerald-700">{note}</p>}
      <Problem text={problem} />
    </Step>
  )
}

// The Zoom meeting arranged with the parent (the link is different each time). Like an HOA class it has a state:
// grey while nothing is scheduled, coloured once a meeting is, and each scheduled meeting can be rescheduled,
// completed or cancelled.
export function ZoomStep({
  number,
  enrolment,
  canEdit,
  hint,
  slots = [],
  title = 'Zoom with the parent',
}: {
  number: number
  enrolment: Enrolment
  canEdit: boolean
  // The programme's own name for the step.
  title?: string
  // A line shown above the meetings, such as "usually set after the form is filled in".
  hint?: string | null
  // The Zoom meetings already on the calendar: pick a time, like an HOA class, instead of typing one.
  slots?: ZoomSlot[]
}) {
  const [at, setAt] = useState('')
  const [link, setLink] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [typing, setTyping] = useState(false)
  const [showAll, setShowAll] = useState(false)
  // The meeting being given a new time, and the one waiting for "yes, cancel it".
  const [reschedulingId, setReschedulingId] = useState<number | null>(null)
  const [cancelAskId, setCancelAskId] = useState<number | null>(null)
  const [addingAnother, setAddingAnother] = useState(false)
  const rescheduling = enrolment.meetings.find((meeting) => meeting.id === reschedulingId) ?? null
  const scheduled = enrolment.meetings.filter((meeting) => meeting.status === 'scheduled')
  const tone = scheduled.length > 0 ? 'active' : enrolment.meetings.some((meeting) => meeting.status === 'completed') ? 'finished' : 'idle'
  // A time this parent already has is not offered again.
  const free = slots.filter(
    (slot) =>
      !scheduled.some((meeting) => meeting.link === slot.link && new Date(meeting.startsAt).getTime() === slot.startsAt.getTime()),
  )
  const shown = showAll ? free : free.slice(0, 5)
  const picking = free.length > 0 && !typing
  // Nothing is scheduled yet, or a meeting is being rescheduled: the time picker is open.
  const showPicker = canEdit && (scheduled.length === 0 || rescheduling !== null || addingAnother)

  function submit(startsAt: Date, newLink: string, slotId?: number) {
    return rescheduling
      ? enrolment.rescheduleMeeting(rescheduling, startsAt, newLink, slotId)
      : enrolment.addMeeting(startsAt, newLink, slotId)
  }

  function closePicker() {
    setReschedulingId(null)
    setAddingAnother(false)
    setPickedId(null)
    setAt('')
    setLink('')
    setProblem(null)
  }

  async function saveSlot() {
    const slot = free.find((entry) => entry.id === pickedId)
    if (!slot) {
      setProblem('Pick a time first.')
      return
    }
    setSaving(true)
    setProblem(null)
    const failed = await submit(slot.startsAt, slot.link, slot.id)
    setSaving(false)
    if (failed) {
      setProblem(failed)
      return
    }
    closePicker()
  }

  async function save() {
    const startsAt = new Date(at)
    if (!at || Number.isNaN(startsAt.getTime())) {
      setProblem('Pick the date and time of the meeting.')
      return
    }
    if (!/^https?:\/\/\S+$/i.test(link.trim())) {
      setProblem('Paste the Zoom link, starting with https://')
      return
    }
    setSaving(true)
    setProblem(null)
    const failed = await submit(startsAt, link)
    setSaving(false)
    if (failed) {
      setProblem(failed)
      return
    }
    closePicker()
  }

  async function change(action: () => Promise<string | null>) {
    setProblem(null)
    setProblem(await action())
    setCancelAskId(null)
  }

  const rowClass = {
    scheduled: 'border border-indigo-200 bg-indigo-50',
    completed: 'border border-emerald-200 bg-emerald-50',
    cancelled: 'border border-slate-200 bg-slate-100 text-slate-500',
  } as const
  const badgeClass = {
    scheduled: 'bg-indigo-100 text-indigo-800',
    completed: 'bg-emerald-100 text-emerald-800',
    cancelled: 'bg-slate-200 text-slate-600',
  } as const
  const badgeText = { scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled' } as const
  const smallButton = 'rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50'

  return (
    <Step number={number} done={hasZoomMeeting(enrolment.meetings)} title={title} tone={tone}>
      {hint && <p className="text-slate-500">{hint}</p>}
      {tone === 'idle' && enrolment.meetings.length === 0 && <p className="text-slate-500">No Zoom meeting scheduled yet.</p>}
      {enrolment.meetings.map((meeting) => (
        <div key={meeting.id} className={`rounded-lg px-2.5 py-1.5 ${rowClass[meeting.status]}`}>
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className={`block font-medium ${meeting.status === 'cancelled' ? 'line-through' : 'text-slate-900'}`}>
                {formatZoomTime(new Date(meeting.startsAt))}
              </span>
              {meeting.link.trim() && (
                <a href={meeting.link} target="_blank" rel="noopener noreferrer" className="block truncate text-[#be185d] hover:underline">
                  {meeting.link}
                </a>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClass[meeting.status]}`}>{badgeText[meeting.status]}</span>
              {canEdit && meeting.status !== 'scheduled' && (
                <button
                  type="button"
                  onClick={() => void enrolment.removeMeeting(meeting).then(setProblem)}
                  aria-label="Remove this Zoom meeting"
                  className="rounded p-1 text-slate-500 hover:bg-slate-100"
                >
                  <Trash size={14} aria-hidden="true" />
                </button>
              )}
            </span>
          </div>
          {canEdit && meeting.status === 'scheduled' && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {cancelAskId === meeting.id ? (
                <>
                  <span className="text-xs text-slate-700">Cancel this meeting?</span>
                  <button
                    type="button"
                    onClick={() => void change(() => enrolment.setMeetingStatus(meeting, 'cancelled'))}
                    className="rounded-md bg-red-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    Yes, cancel it
                  </button>
                  <button type="button" onClick={() => setCancelAskId(null)} className={smallButton}>
                    No
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setReschedulingId(meeting.id)
                      setLink(meeting.link)
                      setProblem(null)
                    }}
                    className={smallButton}
                  >
                    Reschedule
                  </button>
                  <button
                    type="button"
                    onClick={() => void change(() => enrolment.setMeetingStatus(meeting, 'completed'))}
                    className={smallButton}
                  >
                    Complete
                  </button>
                  <button type="button" onClick={() => setCancelAskId(meeting.id)} className={smallButton}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ))}
      {canEdit && !showPicker && (
        <button type="button" onClick={() => setAddingAnother(true)} className="block text-xs font-medium text-[#be185d] hover:underline">
          Schedule another Zoom meeting
        </button>
      )}
      {showPicker && rescheduling && (
        <p className="font-medium text-slate-700">Pick the new time for {formatZoomTime(new Date(rescheduling.startsAt))}</p>
      )}
      {showPicker && picking && (
        <>
          <span className="block text-slate-600">Pick a time</span>
          <div role="group" aria-label="Zoom times" className="space-y-1">
            {shown.map((slot) => (
              <button
                key={slot.id}
                type="button"
                aria-pressed={pickedId === slot.id}
                onClick={() => {
                  setPickedId(slot.id)
                  setProblem(null)
                }}
                className={`block w-full rounded-lg border px-2.5 py-1.5 text-left ${
                  pickedId === slot.id
                    ? 'border-[#fc0c97] bg-[#fff0f8] text-slate-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="block font-medium">{formatZoomTime(slot.startsAt)}</span>
                {slot.title && <span className="block truncate text-slate-500">{slot.title}</span>}
              </button>
            ))}
          </div>
          {free.length > shown.length && (
            <button type="button" onClick={() => setShowAll(true)} className="text-xs font-medium text-[#be185d] hover:underline">
              Show all {free.length} times
            </button>
          )}
          <Problem text={problem} />
          <button
            type="button"
            disabled={saving || pickedId === null}
            onClick={() => void saveSlot()}
            className={`${buttonClass} w-full`}
          >
            {saving ? 'Saving...' : rescheduling ? 'Save the new time' : 'Save the Zoom meeting'}
          </button>
          <button type="button" onClick={() => setTyping(true)} className="block text-xs font-medium text-[#be185d] hover:underline">
            Use another time or link
          </button>
        </>
      )}
      {showPicker && !picking && (
        <>
          {free.length > 0 && (
            <button type="button" onClick={() => setTyping(false)} className="block text-xs font-medium text-[#be185d] hover:underline">
              Pick from the calendar instead
            </button>
          )}
          <label className="block">
            <span className="text-slate-600">Date and time</span>
            <input
              type="datetime-local"
              value={at}
              onChange={(event) => {
                setAt(event.target.value)
                setProblem(null)
              }}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="text-slate-600">Zoom link (it is different each time)</span>
            <input
              type="url"
              value={link}
              placeholder="https://zoom.us/j/..."
              onChange={(event) => {
                setLink(event.target.value)
                setProblem(null)
              }}
              className={fieldClass}
            />
          </label>
          <Problem text={problem} />
          <button type="button" disabled={saving} onClick={() => void save()} className={`${buttonClass} w-full`}>
            {saving ? 'Saving...' : rescheduling ? 'Save the new time' : 'Save the Zoom meeting'}
          </button>
        </>
      )}
      {showPicker && (rescheduling !== null || addingAnother) && (
        <button type="button" onClick={closePicker} className="block text-xs font-medium text-slate-500 hover:underline">
          Never mind
        </button>
      )}
      {!showPicker && <Problem text={problem} />}
    </Step>
  )
}
