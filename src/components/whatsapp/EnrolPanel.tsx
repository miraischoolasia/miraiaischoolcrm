import { useEffect, useMemo, useState } from 'react'
import { Trash } from '@phosphor-icons/react'
import { useLeadEnrolment } from '../../hooks/useLeadEnrolment'
import { buildEnrolMessage } from '../../lib/enrolMessage'
import { buildFormUrl } from '../../lib/forms'
import { fetchFormsFromSupabase } from '../../lib/api'
import { cleanHoaTitle, describeHoaSlot, hoaSlotFitsAge, type HoaSlot } from '../../lib/hoaSlots'
import type { Form, Lead } from '../../types/domain'
import type { WhatsAppCrm } from './crm'
import { PanelSection } from './PanelSection'
import { buttonClass, fieldClass, Problem, ReceiptStep, Step, ZoomStep } from './enrolSteps'

type EnrolPanelProps = {
  lead: Lead
  crm: WhatsAppCrm
  userName: string | null
  // Puts text in the message box, for the team to read and send.
  onWriteMessage: (text: string) => void
  // The student is the one writing: the message speaks to them, and the form is theirs.
  forStudent?: boolean
}

const FORM_CHOICE_KEY = 'whatsapp-enrol-form'
function readFormChoice() {
  try {
    return window.localStorage.getItem(FORM_CHOICE_KEY)
  } catch {
    return null
  }
}

// Enrolling a lead in an HOA class, in the order it usually happens: the parent fills in the
// registration form, a class is booked, the payment receipt is kept, and a Zoom meeting is set.
export function EnrolPanel({ lead, crm, userName, onWriteMessage, forStudent = false }: EnrolPanelProps) {
  const enrolment = useLeadEnrolment(lead.id, userName)
  const canEdit = crm.canEditLeads
  const submitted = crm.leadIdsWithForms.has(lead.id)

  // 1. The registration form
  const [forms, setForms] = useState<Form[]>([])
  const [formId, setFormId] = useState<string | null>(readFormChoice)
  useEffect(() => {
    let cancelled = false
    fetchFormsFromSupabase()
      .then((all) => {
        if (!cancelled) {
          setForms(all.filter((form) => form.isPublished))
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  const chosenForm = forms.find((form) => form.id === formId) ?? forms.find((form) => /hoa/i.test(form.name)) ?? forms[0] ?? null
  const formUrl = chosenForm ? buildFormUrl(window.location.origin, chosenForm.slug ?? chosenForm.id) : null

  // 2. The class
  const bookings = useMemo(
    () => crm.trialBookings.filter((booking) => booking.leadId === lead.id).sort((a, b) => a.bookingDate.localeCompare(b.bookingDate)),
    [crm.trialBookings, lead.id],
  )
  const allSlots = crm.listHoaSlots()
  const [childIndex, setChildIndex] = useState(0)
  const [slotKey, setSlotKey] = useState<string | null>(null)
  const [showAllSlots, setShowAllSlots] = useState(false)
  const [otherAges, setOtherAges] = useState(false)
  const [booking, setBooking] = useState(false)
  const [bookingProblem, setBookingProblem] = useState<string | null>(null)
  const children = lead.children
  const child = children[childIndex] ?? null
  const slotId = (slot: HoaSlot) => `${slot.scheduleId}:${slot.date}`
  // Classes are split by age, so the child's own age group comes first.
  const slots = otherAges ? allSlots : allSlots.filter((slot) => hoaSlotFitsAge(slot, child?.age ?? null))

  const [includeForm, setIncludeForm] = useState(!submitted)

  async function bookClass() {
    const slot = allSlots.find((entry) => slotId(entry) === slotKey)
    if (!slot) {
      setBookingProblem('Pick a class first.')
      return
    }
    if (!child?.name?.trim()) {
      setBookingProblem("Add the child's name on the lead first.")
      return
    }
    setBooking(true)
    setBookingProblem(null)
    const problem = await crm.onBookHoa(lead.id, slot, { name: child.name, age: child.age, phone: lead.phone ?? '' })
    setBooking(false)
    if (problem) {
      setBookingProblem(problem)
      return
    }
    setSlotKey(null)
  }

  async function removeBooking(entry: (typeof bookings)[number]) {
    setBookingProblem(await crm.onCancelHoa(entry))
  }

  function writeMessage() {
    const today = new Date().toISOString().slice(0, 10)
    const nextBooking = bookings.find((entry) => entry.bookingDate >= today) ?? bookings[bookings.length - 1] ?? null
    const nextMeeting =
      enrolment.meetings.find((meeting) => new Date(meeting.startsAt).getTime() >= Date.now()) ??
      enrolment.meetings[enrolment.meetings.length - 1] ??
      null
    onWriteMessage(
      buildEnrolMessage({
        childName: nextBooking?.childName ?? child?.name ?? '',
        classTime: nextBooking ? crm.describeHoaBooking(nextBooking) : null,
        zoom: nextMeeting ? { startsAt: new Date(nextMeeting.startsAt), link: nextMeeting.link } : null,
        formUrl: includeForm && !submitted ? formUrl : null,
        paid: enrolment.receipts.length > 0,
        toStudent: forStudent,
      }),
    )
  }

  const doneCount = [submitted, bookings.length > 0, enrolment.receipts.length > 0, enrolment.meetings.length > 0].filter(Boolean).length
  const visibleSlots = showAllSlots ? slots : slots.slice(0, 6)

  return (
    <PanelSection title="Enrol in HOA" aside={<span className="text-slate-500">{doneCount} of 4 done</span>}>
      {enrolment.loadError && <p className="rounded-lg bg-amber-50 p-2 text-amber-900">{enrolment.loadError}</p>}

      <Step number={1} done={submitted} title="Registration form">
        {submitted ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-emerald-700">{forStudent ? 'The form has been filled in.' : 'The parent has filled it in.'}</span>
            <button type="button" onClick={() => crm.onOpenFormAnswers(lead.id)} className="font-medium text-[#be185d] hover:underline">
              Read their answers
            </button>
          </div>
        ) : (
          <p className="text-slate-600">Not filled in yet. Send them the link, and the answers show here when they submit.</p>
        )}
        {!submitted && forms.length > 1 && (
          <label className="block">
            <span className="sr-only">Which form to send</span>
            <select
              value={chosenForm?.id ?? ''}
              onChange={(event) => {
                setFormId(event.target.value)
                try {
                  window.localStorage.setItem(FORM_CHOICE_KEY, event.target.value)
                } catch {
                  // The choice just is not remembered.
                }
              }}
              className={fieldClass}
            >
              {forms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {!submitted && (
          <button
            type="button"
            disabled={!formUrl}
            onClick={() => formUrl && onWriteMessage(`麻烦您先填写这份报名表：\n${formUrl}`)}
            className={`${buttonClass} w-full`}
          >
            {formUrl ? 'Put the form link in the message' : 'No published form yet'}
          </button>
        )}
      </Step>

      <Step number={2} done={bookings.length > 0} title="Book an HOA class">
        {!submitted && <p className="text-slate-500">{forStudent ? 'This is usually done after the form has been filled in.' : 'This is usually done after the parent has filled in the form.'}</p>}
        {bookings.map((entry) => (
          <div key={entry.id} className="flex items-start justify-between gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-emerald-900">
            <span>
              <span className="block font-medium">{crm.describeHoaBooking(entry)}</span>
              <span className="block">{entry.childName}</span>
            </span>
            {crm.canBookMakeup && (
              <button
                type="button"
                onClick={() => void removeBooking(entry)}
                aria-label={`Remove ${entry.childName} from this class`}
                className="rounded p-1 text-emerald-800 hover:bg-emerald-100"
              >
                <Trash size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        {crm.canBookMakeup && (
          <>
            {children.length > 1 && (
              <label className="block">
                <span className="text-slate-600">Child</span>
                <select value={childIndex} onChange={(event) => setChildIndex(Number(event.target.value))} className={fieldClass}>
                  {children.map((entry, index) => (
                    <option key={index} value={index}>
                      {entry.name || `Child ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {slots.length === 0 ? (
              <p className="text-slate-500">
                {allSlots.length === 0
                  ? 'No HOA class is open in the next five weeks. Add one on the calendar.'
                  : `No open class for ${child?.age ?? 'this'}-year-olds in the next five weeks.`}
              </p>
            ) : (
              <fieldset className="space-y-1">
                <legend className="text-slate-600">Open classes on the calendar</legend>
                {visibleSlots.map((slot) => (
                  <label
                    key={slotId(slot)}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 ${
                      slotKey === slotId(slot) ? 'border-[#fc0c97] bg-pink-50' : 'border-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`hoa-slot-${lead.id}`}
                      checked={slotKey === slotId(slot)}
                      onChange={() => {
                        setSlotKey(slotId(slot))
                        setBookingProblem(null)
                      }}
                      className="mt-0.5 accent-[#fc0c97]"
                    />
                    <span>
                      <span className="block font-medium text-slate-900">{describeHoaSlot(slot)}</span>
                      <span className="block text-slate-500">
                        {cleanHoaTitle(slot.title)} · {slot.teacherName}
                        {slot.bookedCount > 0 ? ` · ${slot.bookedCount} booked` : ''}
                      </span>
                    </span>
                  </label>
                ))}
                {slots.length > 6 && (
                  <button type="button" onClick={() => setShowAllSlots((current) => !current)} className="font-medium text-[#be185d] hover:underline">
                    {showAllSlots ? 'Show fewer' : `Show all ${slots.length}`}
                  </button>
                )}
              </fieldset>
            )}
            {allSlots.length > 0 && (
              <label className="flex items-center gap-2 text-slate-600">
                <input type="checkbox" checked={otherAges} onChange={(event) => setOtherAges(event.target.checked)} className="accent-[#fc0c97]" />
                Show classes for other ages too
              </label>
            )}
            <Problem text={bookingProblem} />
            <button type="button" disabled={booking || slots.length === 0} onClick={() => void bookClass()} className={`${buttonClass} w-full`}>
              {booking ? 'Booking...' : 'Book this class'}
            </button>
          </>
        )}
      </Step>

      <ReceiptStep number={3} enrolment={enrolment} canEdit={canEdit} />

      <ZoomStep
        number={4}
        enrolment={enrolment}
        canEdit={canEdit}
        slots={crm.zoomSlots ?? []}
        hint={!submitted ? (forStudent ? 'This is usually set after the form has been filled in.' : 'This is usually set after the parent has filled in the form.') : null}
      />

      <div className="space-y-1.5">
        {!submitted && formUrl && (
          <label className="flex items-center gap-2 text-slate-600">
            <input type="checkbox" checked={includeForm} onChange={(event) => setIncludeForm(event.target.checked)} className="accent-[#fc0c97]" />
            Ask for the form in the message
          </label>
        )}
        <button
          type="button"
          onClick={writeMessage}
          className="w-full rounded-lg bg-[#fc0c97] px-3 py-2 text-sm font-semibold text-white hover:bg-[#e00a87]"
        >
          {forStudent ? 'Write the message to the student' : 'Write the message to the parent'}
        </button>
        <p className="text-slate-500">It goes into the message box with what is saved above. Read it, change it, then press Send.</p>
      </div>
    </PanelSection>
  )
}
