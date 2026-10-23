import { useEffect, useMemo, useState } from 'react'
import { Trash } from '@phosphor-icons/react'
import { useLeadEnrolment } from '../../hooks/useLeadEnrolment'
import { useLeadProgrammeSteps } from '../../hooks/useLeadProgrammeSteps'
import { formatDate } from '../../domain/studentStatus'
import { fetchFormsFromSupabase } from '../../lib/api'
import { brand } from '../../lib/brand'
import { canonicalPhone } from '../../lib/chatLink'
import { formatZoomTime } from '../../lib/enrolMessage'
import { buildFormUrl } from '../../lib/forms'
import { cleanHoaTitle, describeHoaSlot, type HoaSlot } from '../../lib/hoaSlots'
import { MAX_NOTE } from '../../lib/leadProgrammeSteps'
import { getStudentClassIds } from '../../lib/roster'
import { getOfferedPackages, planEnrollment } from '../../lib/packages'
import { DEFAULT_MESSAGE_TEMPLATE, fillTemplate, type Programme, type ProgrammeStep } from '../../lib/programmes'
import type { Form, Lead, Student } from '../../types/domain'
import type { WhatsAppCrm } from './crm'
import { PanelSection } from './PanelSection'
import { buttonClass, fieldClass, Problem, ReceiptStep, Step, ZoomStep } from './enrolSteps'
import { hasZoomMeeting, nextScheduledMeeting } from '../../lib/zoomMeetingStatus'

type ProgrammePanelProps = {
  lead: Lead
  crm: WhatsAppCrm
  programme: Programme
  userName: string | null
  // Puts text in the message box, for the team to read and send.
  onWriteMessage: (text: string) => void
  // The student is the one writing: the message speaks to them.
  forStudent?: boolean
  // The class the parent picked first (the class's flow is this programme): the class step offers only it.
  presetClassroomId?: number
}

const FORM_CHOICE_KEY = 'whatsapp-enrol-form'
function readFormChoice() {
  try {
    return window.localStorage.getItem(FORM_CHOICE_KEY)
  } catch {
    return null
  }
}

// The steps of a programme the school made, in the order the school set them, with the message to the parent
// written from the programme's own wording. The form, class, receipt and Zoom steps work as they do for HOA;
// a step of the school's own is a tick with a note and a date.
export function ProgrammePanel({ lead, crm, programme, userName, onWriteMessage, forStudent = false, presetClassroomId }: ProgrammePanelProps) {
  const enrolment = useLeadEnrolment(lead.id, userName)
  const own = useLeadProgrammeSteps(lead.id, userName)
  const canEdit = crm.canEditLeads
  const submitted = crm.leadIdsWithForms.has(lead.id)

  // The registration form.
  const [forms, setForms] = useState<Form[]>([])
  const [formId, setFormId] = useState<string | null>(readFormChoice)
  const [includeForm, setIncludeForm] = useState(!submitted)
  useEffect(() => {
    if (!programme.steps.some((step) => step.kind === 'form')) {
      return
    }
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
  }, [programme.steps])
  const chosenForm = forms.find((form) => form.id === formId) ?? forms[0] ?? null
  const formUrl = chosenForm ? buildFormUrl(window.location.origin, chosenForm.slug ?? chosenForm.id) : null

  // The classes of this programme the lead is booked into.
  const bookings = useMemo(
    () =>
      crm.trialBookings
        .filter((booking) => booking.leadId === lead.id && crm.bookingProgrammeId?.(booking) === programme.id)
        .sort((a, b) => a.bookingDate.localeCompare(b.bookingDate)),
    [crm, lead.id, programme.id],
  )

  // The children of this lead who are students of a class of this programme (programmes that enrol).
  const enrolled = useMemo(() => {
    if (programme.outcome !== 'enrol') {
      return []
    }
    const classIds = new Set(crm.classrooms.filter((classroom) => classroom.programmeId === programme.id).map((classroom) => classroom.id))
    const phone = canonicalPhone(lead.phone)
    const names = new Set(lead.children.map((entry) => (entry.name ?? '').trim().toLowerCase()).filter(Boolean))
    return crm.students.filter(
      (student) =>
        getStudentClassIds(student).some((id) => classIds.has(id)) &&
        (phone !== null ? canonicalPhone(student.phone) === phone : names.has(student.name.trim().toLowerCase())),
    )
  }, [crm.classrooms, crm.students, lead.children, lead.phone, programme.id, programme.outcome])

  function stepDone(step: ProgrammeStep) {
    switch (step.kind) {
      case 'form':
        return submitted
      case 'class':
        return programme.outcome === 'enrol' ? enrolled.length > 0 : bookings.length > 0
      case 'receipt':
        return enrolment.receipts.length > 0
      case 'zoom':
        return hasZoomMeeting(enrolment.meetings)
      default:
        return own.steps.get(step.id)?.done ?? false
    }
  }

  function writeMessage() {
    const today = new Date().toISOString().slice(0, 10)
    const nextBooking = bookings.find((entry) => entry.bookingDate >= today) ?? bookings[bookings.length - 1] ?? null
    const nextMeeting = nextScheduledMeeting(enrolment.meetings, new Date())
    const child = lead.children[0]
    const template = programme.messageTemplate.trim() === '' ? DEFAULT_MESSAGE_TEMPLATE : programme.messageTemplate
    onWriteMessage(
      fillTemplate(template, {
        child: nextBooking?.childName ?? child?.name ?? '',
        class_time: nextBooking ? crm.describeHoaBooking(nextBooking) : null,
        zoom_time: nextMeeting ? formatZoomTime(new Date(nextMeeting.startsAt)) : null,
        zoom_link: nextMeeting?.link ?? null,
        form_link: includeForm && !submitted ? formUrl : null,
      }),
    )
  }

  const doneCount = programme.steps.filter(stepDone).length

  return (
    <PanelSection title={`Enrol in ${programme.name}`} aside={<span className="text-slate-500">{doneCount} of {programme.steps.length} done</span>}>
      {enrolment.loadError && <p className="rounded-lg bg-amber-50 p-2 text-amber-900">{enrolment.loadError}</p>}
      {own.loadError && <p className="rounded-lg bg-amber-50 p-2 text-amber-900">{own.loadError}</p>}
      {programme.steps.length === 0 && <p className="text-slate-500">This programme has no steps yet. An admin adds them in Programmes.</p>}

      {programme.steps.map((step, index) => {
        const number = index + 1
        switch (step.kind) {
          case 'form':
            return (
              <FormStep
                key={step.id}
                number={number}
                title={step.title}
                submitted={submitted}
                forStudent={forStudent}
                forms={forms}
                chosenForm={chosenForm}
                formUrl={formUrl}
                onChooseForm={(id) => {
                  setFormId(id)
                  try {
                    window.localStorage.setItem(FORM_CHOICE_KEY, id)
                  } catch {
                    // The choice just is not remembered.
                  }
                }}
                onOpenAnswers={() => crm.onOpenFormAnswers(lead.id)}
                onWriteMessage={onWriteMessage}
              />
            )
          case 'class':
            return (
              <ClassStep
                key={step.id}
                number={number}
                title={step.title}
                lead={lead}
                crm={crm}
                programme={programme}
                bookings={bookings}
                enrolled={enrolled}
                presetClassroomId={presetClassroomId}
              />
            )
          case 'receipt':
            return <ReceiptStep key={step.id} number={number} title={step.title} enrolment={enrolment} canEdit={canEdit} />
          case 'zoom':
            return <ZoomStep key={step.id} number={number} title={step.title} enrolment={enrolment} canEdit={canEdit} slots={crm.zoomSlots ?? []} />
          default:
            return (
              <OwnStep
                key={step.id}
                number={number}
                step={step}
                state={own.steps.get(step.id) ?? null}
                canEdit={canEdit}
                onSave={own.save}
              />
            )
        }
      })}

      <div className="space-y-1.5">
        {!submitted && formUrl && programme.steps.some((step) => step.kind === 'form') && (
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

function FormStep({
  number,
  title,
  submitted,
  forStudent,
  forms,
  chosenForm,
  formUrl,
  onChooseForm,
  onOpenAnswers,
  onWriteMessage,
}: {
  number: number
  title: string
  submitted: boolean
  forStudent: boolean
  forms: Form[]
  chosenForm: Form | null
  formUrl: string | null
  onChooseForm: (id: string) => void
  onOpenAnswers: () => void
  onWriteMessage: (text: string) => void
}) {
  return (
    <Step number={number} done={submitted} title={title}>
      {submitted ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-emerald-700">{forStudent ? 'The form has been filled in.' : 'The parent has filled it in.'}</span>
          <button type="button" onClick={onOpenAnswers} className="font-medium text-[#be185d] hover:underline">
            Read their answers
          </button>
        </div>
      ) : (
        <p className="text-slate-600">Not filled in yet. Send them the link, and the answers show here when they submit.</p>
      )}
      {!submitted && forms.length > 1 && (
        <label className="block">
          <span className="sr-only">Which form to send</span>
          <select value={chosenForm?.id ?? ''} onChange={(event) => onChooseForm(event.target.value)} className={fieldClass}>
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
  )
}

// Picking a class of the programme. A programme that keeps a place for the lead books it like an HOA class;
// one that enrols makes the lead a student of the class, on the package chosen with it.
function ClassStep({
  number,
  title,
  lead,
  crm,
  programme,
  bookings,
  enrolled,
  presetClassroomId,
}: {
  number: number
  title: string
  lead: Lead
  crm: WhatsAppCrm
  programme: Programme
  bookings: WhatsAppCrm['trialBookings']
  enrolled: Student[]
  presetClassroomId?: number
}) {
  const slots = useMemo(() => crm.listProgrammeSlots?.(programme.id, presetClassroomId) ?? [], [crm, programme.id, presetClassroomId])
  const [childIndex, setChildIndex] = useState(0)
  const [slotKey, setSlotKey] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const children = lead.children
  const child = children[childIndex] ?? null
  const slotId = (slot: HoaSlot) => `${slot.scheduleId}:${slot.date}`
  const visible = showAll ? slots : slots.slice(0, 6)

  async function book() {
    const slot = slots.find((entry) => slotId(entry) === slotKey)
    if (!slot) {
      setProblem('Pick a class first.')
      return
    }
    if (!child?.name?.trim()) {
      setProblem("Add the child's name on the lead first.")
      return
    }
    setBusy(true)
    setProblem(null)
    const failed = await crm.onBookHoa(lead.id, slot, { name: child.name, age: child.age, phone: lead.phone ?? '' })
    setBusy(false)
    if (failed) {
      setProblem(failed)
      return
    }
    setSlotKey(null)
  }

  if (programme.outcome === 'enrol') {
    return (
      <EnrolClassStep
        number={number}
        title={title}
        lead={lead}
        crm={crm}
        programme={programme}
        enrolled={enrolled}
        presetClassroomId={presetClassroomId}
      />
    )
  }

  return (
    <Step number={number} done={bookings.length > 0} title={title}>
      {bookings.map((entry) => (
        <div key={entry.id} className="flex items-start justify-between gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-emerald-900">
          <span>
            <span className="block font-medium">{crm.describeHoaBooking(entry)}</span>
            <span className="block">{entry.childName}</span>
          </span>
          {crm.canBookMakeup && (
            <button
              type="button"
              onClick={() => void crm.onCancelHoa(entry).then(setProblem)}
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
              No class of {programme.name} is open in the next five weeks. Add one in My Classroom, with this programme chosen.
            </p>
          ) : (
            <fieldset className="space-y-1">
              <legend className="text-slate-600">Open classes on the calendar</legend>
              {visible.map((slot) => (
                <label
                  key={slotId(slot)}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 ${
                    slotKey === slotId(slot) ? 'border-[#fc0c97] bg-pink-50' : 'border-slate-200'
                  }`}
                >
                  <input
                    type="radio"
                    name={`programme-slot-${programme.id}-${lead.id}`}
                    checked={slotKey === slotId(slot)}
                    onChange={() => {
                      setSlotKey(slotId(slot))
                      setProblem(null)
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
                <button type="button" onClick={() => setShowAll((current) => !current)} className="font-medium text-[#be185d] hover:underline">
                  {showAll ? 'Show fewer' : `Show all ${slots.length}`}
                </button>
              )}
            </fieldset>
          )}
          <Problem text={problem} />
          <button type="button" disabled={busy || slots.length === 0} onClick={() => void book()} className={`${buttonClass} w-full`}>
            {busy ? 'Booking...' : 'Book this class'}
          </button>
        </>
      )}
    </Step>
  )
}

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// A programme that enrols: pick the class, the package and the start date, and the child becomes a student
// of that class on that package.
function EnrolClassStep({
  number,
  title,
  lead,
  crm,
  programme,
  enrolled,
  presetClassroomId,
}: {
  number: number
  title: string
  lead: Lead
  crm: WhatsAppCrm
  programme: Programme
  enrolled: Student[]
  presetClassroomId?: number
}) {
  const classes = useMemo(
    () =>
      crm.classrooms.filter(
        (classroom) =>
          classroom.programmeId === programme.id &&
          classroom.status === 'active' &&
          (presetClassroomId === undefined || classroom.id === presetClassroomId),
      ),
    [crm.classrooms, programme.id, presetClassroomId],
  )
  const packages = useMemo(() => getOfferedPackages(crm.packages), [crm.packages])
  const [childIndex, setChildIndex] = useState(0)
  const [classroomId, setClassroomId] = useState<number | null>(null)
  const [packageId, setPackageId] = useState<number | null>(null)
  const [startDate, setStartDate] = useState(todayKey)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const children = lead.children
  const child = children[childIndex] ?? null
  const chosenClass = classes.find((classroom) => classroom.id === classroomId) ?? (classes.length === 1 ? classes[0] : null)
  const chosenPackage = packages.find((pkg) => pkg.id === packageId) ?? (packages.length === 1 ? packages[0] : null)
  // A school with no packages (EduHero) enrols with the class alone.
  const noPackages = packages.length === 0
  const plan = chosenPackage && startDate ? planEnrollment(chosenPackage, startDate) : null
  const alreadyIn = child
    ? enrolled.some((student) => student.name.trim().toLowerCase() === (child.name ?? '').trim().toLowerCase())
    : false

  async function enrol() {
    if (!crm.onEnrolStudent) {
      return
    }
    if (!chosenClass) {
      setProblem('Pick a class first.')
      return
    }
    if (!chosenPackage && !noPackages) {
      setProblem('Pick a package.')
      return
    }
    if (!child?.name?.trim()) {
      setProblem("Add the child's name on the lead first.")
      return
    }
    if (!startDate) {
      setProblem('Pick the date the package starts.')
      return
    }
    setBusy(true)
    setProblem(null)
    const failed = await crm.onEnrolStudent({
      leadId: lead.id,
      childName: child.name,
      phone: lead.phone ?? '',
      classroomId: chosenClass.id,
      packageId: chosenPackage?.id ?? null,
      startDate,
    })
    setBusy(false)
    if (failed) {
      setProblem(failed)
    }
  }

  return (
    <Step number={number} done={enrolled.length > 0} title={title}>
      {enrolled.map((student) => {
        // Every class the student is in (a student can take several subjects).
        const classNames = getStudentClassIds(student)
          .map((id) => crm.classrooms.find((entry) => entry.id === id)?.name)
          .filter(Boolean)
          .join(', ')
        const pkg = crm.packages.find((entry) => entry.id === student.packageId)
        return (
          <div key={student.id} className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-emerald-900">
            <span className="block font-medium">{student.name}</span>
            <span className="block">
              {classNames || 'No class'}
              {pkg ? ` · ${pkg.name}` : ''} · until {formatDate(student.lessonExpiryDate)}
            </span>
            <button type="button" onClick={() => crm.onOpenStudent(student.id)} className="mt-0.5 font-medium text-[#be185d] hover:underline">
              Open the student
            </button>
          </div>
        )
      })}
      {!crm.canEditStudents || !crm.onEnrolStudent ? (
        <p className="text-slate-500">You can look but not enrol.</p>
      ) : alreadyIn ? (
        <p className="text-slate-500">{child?.name} is already in a class of {programme.name}.</p>
      ) : (
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
          {classes.length === 0 ? (
            <p className="text-slate-500">No class of {programme.name} yet. Add one in My Classroom, with this programme chosen.</p>
          ) : noPackages ? (
            <>
              {classes.length > 1 && (
                <label className="block">
                  <span className="text-slate-600">Class</span>
                  <select
                    value={chosenClass?.id ?? ''}
                    onChange={(event) => {
                      setClassroomId(event.target.value ? Number(event.target.value) : null)
                      setProblem(null)
                    }}
                    className={fieldClass}
                  >
                    {!chosenClass && <option value="">Choose a class</option>}
                    {classes.map((classroom) => (
                      <option key={classroom.id} value={classroom.id}>
                        {classroom.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {classes.length === 1 && <p className="font-medium text-slate-800">{classes[0].name}</p>}
              <Problem text={problem} />
              <button type="button" disabled={busy || !chosenClass} onClick={() => void enrol()} className={`${buttonClass} w-full`}>
                {busy ? 'Enrolling...' : 'Enrol in this class'}
              </button>
              <p className="text-slate-500">This makes {child?.name?.trim() || 'the child'} a student of the class.</p>
            </>
          ) : (
            <>
              <label className="block">
                <span className="text-slate-600">Class</span>
                <select
                  value={chosenClass?.id ?? ''}
                  onChange={(event) => {
                    setClassroomId(event.target.value ? Number(event.target.value) : null)
                    setProblem(null)
                  }}
                  className={fieldClass}
                >
                  {!chosenClass && <option value="">Choose a class</option>}
                  {classes.map((classroom) => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-slate-600">Package</span>
                <select
                  value={chosenPackage?.id ?? ''}
                  onChange={(event) => {
                    setPackageId(event.target.value ? Number(event.target.value) : null)
                    setProblem(null)
                  }}
                  className={fieldClass}
                >
                  {!chosenPackage && <option value="">Choose a package</option>}
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-slate-600">Starts on</span>
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={fieldClass} />
              </label>
              {plan && chosenPackage && (
                <p className="text-slate-500">
                  {plan.classCount} classes, until {formatDate(plan.endDate)}.
                  {brand.usesFees && (chosenPackage.includesFees ? ` Account Fee and ${brand.clubName} for a year.` : ` No Account Fee or ${brand.clubName}.`)}
                </p>
              )}
              <Problem text={problem} />
              <button type="button" disabled={busy || !chosenClass || !chosenPackage} onClick={() => void enrol()} className={`${buttonClass} w-full`}>
                {busy ? 'Enrolling...' : 'Enrol in this class'}
              </button>
              <p className="text-slate-500">This makes {child?.name?.trim() || 'the child'} a student of the class, on the package above.</p>
            </>
          )}
        </>
      )}
    </Step>
  )
}

// A step of the school's own: a tick, and a note and a date for it.
function OwnStep({
  number,
  step,
  state,
  canEdit,
  onSave,
}: {
  number: number
  step: ProgrammeStep
  state: { done: boolean; note: string; date: string; updatedBy: string | null } | null
  canEdit: boolean
  onSave: (stepId: number, next: { done: boolean; note: string; date: string }) => Promise<string | null>
}) {
  const done = state?.done ?? false
  const [note, setNote] = useState(state?.note ?? '')
  const [date, setDate] = useState(state?.date ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // What was saved arrives after the first paint; take it in once, without overwriting what is being typed.
  const [synced, setSynced] = useState(state !== null)
  useEffect(() => {
    if (state && !synced) {
      setNote(state.note)
      setDate(state.date)
      setSynced(true)
    }
  }, [state, synced])

  async function save(next: { done: boolean; note: string; date: string }) {
    setSaving(true)
    setProblem(null)
    const failed = await onSave(step.id, next)
    setSaving(false)
    setProblem(failed)
  }

  const changed = note !== (state?.note ?? '') || date !== (state?.date ?? '')

  return (
    <Step number={number} done={done} title={step.title}>
      <label className="flex items-center gap-2 text-slate-700">
        <input
          type="checkbox"
          checked={done}
          disabled={!canEdit || saving}
          onChange={(event) => void save({ done: event.target.checked, note, date })}
          className="accent-[#fc0c97]"
        />
        Done
      </label>
      <label className="block">
        <span className="text-slate-600">Date</span>
        <input type="date" value={date} disabled={!canEdit} onChange={(event) => setDate(event.target.value)} className={fieldClass} />
      </label>
      <label className="block">
        <span className="text-slate-600">Note</span>
        <textarea
          value={note}
          rows={2}
          maxLength={MAX_NOTE}
          disabled={!canEdit}
          onChange={(event) => setNote(event.target.value)}
          className={fieldClass}
        />
      </label>
      {canEdit && changed && (
        <button type="button" disabled={saving} onClick={() => void save({ done, note, date })} className={`${buttonClass} w-full`}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      )}
      {state?.updatedBy && <p className="text-slate-500">Last changed by {state.updatedBy}.</p>}
      <Problem text={problem} />
    </Step>
  )
}
