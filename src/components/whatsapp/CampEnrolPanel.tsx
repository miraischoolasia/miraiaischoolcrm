import { useEffect, useMemo, useState } from 'react'
import { useLeadEnrolment } from '../../hooks/useLeadEnrolment'
import { formatDate } from '../../domain/studentStatus'
import { buildCampMessage } from '../../lib/enrolMessage'
import { canonicalPhone } from '../../lib/chatLink'
import { buildFormUrl } from '../../lib/forms'
import { fetchFormsFromSupabase } from '../../lib/api'
import { planEnrollment } from '../../lib/packages'
import type { Form, Lead, LeadFormSubmission } from '../../types/domain'
import type { WhatsAppCrm } from './crm'
import { PanelSection } from './PanelSection'
import { buttonClass, fieldClass, Problem, ReceiptStep, Step, ZoomStep } from './enrolSteps'

type CampEnrolPanelProps = {
  lead: Lead
  crm: WhatsAppCrm
  userName: string | null
  // Puts text in the message box, for the team to read and send.
  onWriteMessage: (text: string) => void
  // The student is the one writing: the message speaks to them, and the form is theirs.
  forStudent?: boolean
}

const FORM_CHOICE_KEY = 'whatsapp-enrol-form-camp'

function readFormChoice() {
  try {
    return window.localStorage.getItem(FORM_CHOICE_KEY)
  } catch {
    return null
  }
}

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// Signing a child up for the Holiday Camp, in the order it usually happens: the parent fills in the camp
// form, the child is put in a camp class (this makes the student, on the camp package), the payment
// receipt is kept, and a Zoom meeting is set.
export function CampEnrolPanel({ lead, crm, userName, onWriteMessage, forStudent = false }: CampEnrolPanelProps) {
  const enrolment = useLeadEnrolment(lead.id, userName)
  const canEdit = crm.canEditLeads
  const campPackage = crm.packages.find((pkg) => pkg.kind === 'camp' && pkg.isActive) ?? null
  const campClasses = useMemo(
    () => crm.classrooms.filter((classroom) => classroom.category === 'camp' && classroom.status === 'active'),
    [crm.classrooms],
  )

  // 1. The camp registration form: the one named after the camp, or the one the team picked.
  const [forms, setForms] = useState<Form[]>([])
  const [formId, setFormId] = useState<string | null>(readFormChoice)
  const [answers, setAnswers] = useState<LeadFormSubmission[]>([])
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
  const hasForms = crm.leadIdsWithForms.has(lead.id)
  const { loadFormAnswers } = crm
  useEffect(() => {
    let cancelled = false
    if (!hasForms) {
      return
    }
    loadFormAnswers(lead.id)
      .then((loaded) => {
        if (!cancelled) {
          setAnswers(loaded)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [hasForms, lead.id, loadFormAnswers])
  const chosenForm = forms.find((form) => form.id === formId) ?? forms.find((form) => /camp/i.test(form.name)) ?? null
  const formUrl = chosenForm ? buildFormUrl(window.location.origin, chosenForm.slug ?? chosenForm.id) : null
  // Only counts as filled in when this camp form itself was submitted (an HOA form does not count).
  const submitted = chosenForm !== null && hasForms && answers.some((entry) => entry.formId === chosenForm.id)

  // 2. The class
  const [childIndex, setChildIndex] = useState(0)
  const [classroomId, setClassroomId] = useState<number | null>(null)
  const [startDate, setStartDate] = useState(todayKey)
  const [enrolling, setEnrolling] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const children = lead.children
  const child = children[childIndex] ?? null
  const chosenClass = campClasses.find((classroom) => classroom.id === classroomId) ?? (campClasses.length === 1 ? campClasses[0] : null)
  const plan = campPackage && startDate ? planEnrollment(campPackage, startDate) : null

  // Children of this parent who are already on the camp package.
  const parentPhone = canonicalPhone(lead.phone)
  const enrolled = useMemo(
    () =>
      campPackage
        ? crm.students.filter(
            (student) =>
              student.packageId === campPackage.id &&
              parentPhone !== null &&
              canonicalPhone(student.phone) === parentPhone,
          )
        : [],
    [crm.students, campPackage, parentPhone],
  )
  const alreadyEnrolled = child ? enrolled.some((student) => student.name.trim().toLowerCase() === (child.name ?? '').trim().toLowerCase()) : false

  const [includeForm, setIncludeForm] = useState(true)

  async function enrol() {
    if (!campPackage || !chosenClass) {
      setProblem('Pick a camp class first.')
      return
    }
    if (!child?.name?.trim()) {
      setProblem("Add the child's name on the lead first.")
      return
    }
    if (!startDate) {
      setProblem('Pick the date the camp starts for this child.')
      return
    }
    setEnrolling(true)
    setProblem(null)
    const failed = await crm.onEnrolCamp({
      leadId: lead.id,
      childName: child.name,
      phone: lead.phone ?? '',
      classroomId: chosenClass.id,
      packageId: campPackage.id,
      startDate,
    })
    setEnrolling(false)
    if (failed) {
      setProblem(failed)
    }
  }

  function writeMessage() {
    const latest = enrolled[enrolled.length - 1] ?? null
    const classroom = latest?.classroomId ? crm.classrooms.find((entry) => entry.id === latest.classroomId) : null
    const nextMeeting =
      enrolment.meetings.find((meeting) => new Date(meeting.startsAt).getTime() >= Date.now()) ??
      enrolment.meetings[enrolment.meetings.length - 1] ??
      null
    onWriteMessage(
      buildCampMessage({
        childName: latest?.name ?? child?.name ?? '',
        enrolled:
          latest && classroom && campPackage
            ? {
                className: classroom.name,
                startDate: formatDate(planStart(latest.lessonExpiryDate, campPackage.durationMonths)),
                classes: campPackage.classCount,
              }
            : null,
        zoom: nextMeeting ? { startsAt: new Date(nextMeeting.startsAt), link: nextMeeting.link } : null,
        formUrl: includeForm && !submitted ? formUrl : null,
        paid: enrolment.receipts.length > 0,
        toStudent: forStudent,
      }),
    )
  }

  const doneCount = [submitted, enrolled.length > 0, enrolment.receipts.length > 0, enrolment.meetings.length > 0].filter(Boolean).length

  if (!campPackage) {
    return (
      <PanelSection title="Enrol in Holiday Camp">
        <p className="text-slate-600">There is no Holiday Camp package yet. Add one under Packages in the settings first.</p>
      </PanelSection>
    )
  }

  return (
    <PanelSection title="Enrol in Holiday Camp" aside={<span className="text-slate-500">{doneCount} of 4 done</span>}>
      {enrolment.loadError && <p className="rounded-lg bg-amber-50 p-2 text-amber-900">{enrolment.loadError}</p>}

      <Step number={1} done={submitted} title="Camp registration form">
        {submitted ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-emerald-700">{forStudent ? 'The form has been filled in.' : 'The parent has filled it in.'}</span>
            <button type="button" onClick={() => crm.onOpenFormAnswers(lead.id)} className="font-medium text-[#be185d] hover:underline">
              Read their answers
            </button>
          </div>
        ) : (
          <p className="text-slate-600">
            {chosenForm
              ? 'Not filled in yet. Send them the link, and the answers show here when they submit.'
              : 'There is no form with "camp" in its name yet. Make one in Forms and publish it, or pick another below.'}
          </p>
        )}
        {!submitted && forms.length > 0 && (
          <label className="block">
            <span className="sr-only">Which form to send</span>
            <select
              value={chosenForm?.id ?? ''}
              onChange={(event) => {
                setFormId(event.target.value || null)
                try {
                  window.localStorage.setItem(FORM_CHOICE_KEY, event.target.value)
                } catch {
                  // The choice just is not remembered.
                }
              }}
              className={fieldClass}
            >
              {!chosenForm && <option value="">Choose the form to send</option>}
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
            onClick={() => formUrl && onWriteMessage(`麻烦您先填写这份 Holiday Camp 报名表：\n${formUrl}`)}
            className={`${buttonClass} w-full`}
          >
            {formUrl ? 'Put the form link in the message' : 'No form chosen'}
          </button>
        )}
      </Step>

      <Step number={2} done={enrolled.length > 0} title="Put the child in a camp class">
        {enrolled.map((student) => {
          const classroom = crm.classrooms.find((entry) => entry.id === student.classroomId)
          return (
            <div key={student.id} className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-emerald-900">
              <span className="block font-medium">{student.name}</span>
              <span className="block">
                {classroom?.name ?? 'No class'} · until {formatDate(student.lessonExpiryDate)} · {student.remainingHours} classes left
              </span>
              <button type="button" onClick={() => crm.onOpenStudent(student.id)} className="mt-0.5 font-medium text-[#be185d] hover:underline">
                Open the student
              </button>
            </div>
          )
        })}
        {!canEdit ? (
          <p className="text-slate-500">You can look but not enrol.</p>
        ) : alreadyEnrolled ? (
          <p className="text-slate-500">{child?.name} is already in the camp.</p>
        ) : (
          <>
            {!submitted && <p className="text-slate-500">{forStudent ? 'This is usually done after the form has been filled in.' : 'This is usually done after the parent has filled in the form.'}</p>}
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
            {campClasses.length === 0 ? (
              <p className="text-slate-500">There is no Holiday Camp class yet. Add one on the calendar (category Camp).</p>
            ) : (
              <>
                <fieldset className="space-y-1">
                  <legend className="text-slate-600">Camp classes</legend>
                  {campClasses.map((classroom) => (
                    <label
                      key={classroom.id}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 ${
                        chosenClass?.id === classroom.id ? 'border-[#fc0c97] bg-pink-50' : 'border-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`camp-class-${lead.id}`}
                        checked={chosenClass?.id === classroom.id}
                        onChange={() => {
                          setClassroomId(classroom.id)
                          setProblem(null)
                        }}
                        className="mt-0.5 accent-[#fc0c97]"
                      />
                      <span className="block font-medium text-slate-900">{classroom.name}</span>
                    </label>
                  ))}
                </fieldset>
                <label className="block">
                  <span className="text-slate-600">Starts on</span>
                  <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={fieldClass} />
                </label>
                {plan && (
                  <p className="text-slate-500">
                    {plan.classCount} classes, until {formatDate(plan.endDate)}. No Account Fee or Mirai Club.
                  </p>
                )}
                <Problem text={problem} />
                <button type="button" disabled={enrolling || !chosenClass} onClick={() => void enrol()} className={`${buttonClass} w-full`}>
                  {enrolling ? 'Enrolling...' : 'Enrol in the Holiday Camp'}
                </button>
                <p className="text-slate-500">This makes {child?.name?.trim() || 'the child'} a student on the Holiday Camp package.</p>
              </>
            )}
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

// The camp starts as many months before the lessons end as the package lasts.
function planStart(lessonExpiryDate: string, months: number) {
  const [year, month, day] = lessonExpiryDate.split('-').map(Number)
  const date = new Date(year, month - 1 - months, day)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
