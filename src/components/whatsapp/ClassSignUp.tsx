import { useMemo, useState } from 'react'
import type { Classroom, Lead } from '../../types/domain'
import type { WhatsAppCrm } from './crm'
import { ProgrammePanel } from './ProgrammePanel'
import { fieldClass } from './enrolSteps'

// Signing a parent up for a class: the team finds the class by grade, then
// subject, then picks it; the steps that follow come from the class's
// enrolment flow (its own, else its class level's).
export function ClassSignUp({
  lead,
  crm,
  userName,
  onWriteMessage,
  forStudent = false,
}: {
  lead: Lead
  crm: WhatsAppCrm
  userName: string | null
  onWriteMessage: (text: string) => void
  forStudent?: boolean
}) {
  const flows = useMemo(() => new Map((crm.programmes ?? []).map((programme) => [programme.id, programme])), [crm.programmes])
  // Classes a parent can sign up for: active, with a flow the school made.
  const classes = useMemo(
    () =>
      crm.classrooms.filter((classroom) => {
        const flow = classroom.programmeId ? flows.get(classroom.programmeId) : undefined
        return classroom.status === 'active' && flow !== undefined && flow.isActive && flow.legacyKey === null
      }),
    [crm.classrooms, flows],
  )
  const subjectName = useMemo(() => new Map((crm.subjects ?? []).map((subject) => [subject.id, subject])), [crm.subjects])
  const grades = useMemo(() => [...new Set(classes.map((classroom) => classroom.ageGroup))], [classes])
  const [grade, setGrade] = useState('')
  const [subject, setSubject] = useState('')
  const [classroomId, setClassroomId] = useState<number | null>(null)

  const inGrade = classes.filter((classroom) => !grade || classroom.ageGroup === grade)
  const subjectsInGrade = [...new Set(inGrade.map((classroom) => classroom.subjectId ?? null))].sort((a, b) => {
    const left = subjectName.get(a ?? -1)
    const right = subjectName.get(b ?? -1)
    return (left?.sortOrder ?? 9999) - (right?.sortOrder ?? 9999) || (left?.name ?? '').localeCompare(right?.name ?? '')
  })
  const shown = inGrade
    .filter((classroom) => !subject || String(classroom.subjectId ?? 'none') === subject)
    .sort((a, b) => a.name.localeCompare(b.name))
  const chosen: Classroom | null = classes.find((classroom) => classroom.id === classroomId) ?? null
  const flow = chosen?.programmeId ? flows.get(chosen.programmeId) ?? null : null

  if (classes.length === 0) {
    return (
      <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        No class takes sign-ups yet. An admin picks an enrolment flow for each kind of class in Class Settings.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 rounded-lg border border-slate-200 p-2 text-xs">
        <span className="block font-semibold text-slate-700">Which class?</span>
        <div className="grid grid-cols-2 gap-1.5">
          <select
            aria-label="Grade"
            value={grade}
            onChange={(event) => {
              setGrade(event.target.value)
              setSubject('')
              setClassroomId(null)
            }}
            className={fieldClass}
          >
            <option value="">All grades</option>
            {grades.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
          <select
            aria-label="Subject"
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value)
              setClassroomId(null)
            }}
            className={fieldClass}
          >
            <option value="">All subjects</option>
            {subjectsInGrade.map((id) => (
              <option key={id ?? 'none'} value={id ?? 'none'}>
                {id === null ? 'No subject' : (subjectName.get(id)?.name ?? 'A subject')}
              </option>
            ))}
          </select>
        </div>
        <select
          aria-label="Class"
          value={classroomId ?? ''}
          onChange={(event) => setClassroomId(event.target.value ? Number(event.target.value) : null)}
          className={fieldClass}
        >
          <option value="">Pick a class ({shown.length})</option>
          {shown.map((classroom) => (
            <option key={classroom.id} value={classroom.id}>
              {classroom.name}
            </option>
          ))}
        </select>
        {chosen && flow && <span className="block text-slate-500">Steps: {flow.name}</span>}
      </div>
      {chosen && flow && (
        <ProgrammePanel
          key={chosen.id}
          lead={lead}
          crm={crm}
          programme={flow}
          userName={userName}
          onWriteMessage={onWriteMessage}
          forStudent={forStudent}
          presetClassroomId={chosen.id}
        />
      )}
    </div>
  )
}
