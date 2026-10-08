import { useState } from 'react'
import type { Student } from '../../types/domain'
import type { WhatsAppCrm } from './crm'

type StudentCardProps = {
  student: Student
  crm: WhatsAppCrm
}

// A student already enrolled: where they are and the two things parents message
// about most, a day they cannot come and a class to make up.
export function StudentCard({ student, crm }: StudentCardProps) {
  const [leave, setLeave] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null)

  const classroom = crm.classrooms.find((entry) => entry.id === student.classroomId)
  const plan = crm.packages.find((entry) => entry.id === student.packageId)
  const canMakeUp = crm.canBookMakeup && student.studentType === 'regular' && classroom?.category === 'regular'
  // A preview student has no notes to write in.
  const canNote = crm.canEditStudents && student.studentType !== 'preview'

  async function recordLeave() {
    if (!leave.trim()) {
      return
    }
    setIsSaving(true)
    setMessage(null)
    const problem = await crm.onRecordLeave(student.id, leave.trim())
    setIsSaving(false)
    if (problem) {
      setMessage({ text: problem, good: false })
      return
    }
    setLeave('')
    setMessage({ text: 'Saved to the student notes.', good: true })
  }

  return (
    <section className="space-y-3 text-xs">
      <div>
        <p className="text-slate-500">Student</p>
        <h4 className="text-sm font-semibold text-slate-900">{student.name}</h4>
        {!student.isActive && <p className="text-amber-700">Not active now</p>}
      </div>

      <dl className="space-y-2">
        <div>
          <dt className="text-slate-500">Class</dt>
          <dd className="text-sm text-slate-900">{classroom?.name ?? 'Not in a class'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Package</dt>
          <dd className="text-sm text-slate-900">{plan?.name ?? 'None recorded'}</dd>
        </div>
      </dl>

      {canNote && (
        <div className="space-y-1.5">
          <label className="block">
            <span className="font-semibold text-slate-700">Record a leave note</span>
            <textarea
              value={leave}
              onChange={(event) => setLeave(event.target.value)}
              rows={2}
              placeholder="e.g. Away on 18 Oct, family trip"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-[#fc0c97]"
            />
          </label>
          <p className="text-slate-500">This goes into the student's notes. Mark the day as leave in attendance on the day itself.</p>
          {message && <p className={message.good ? 'text-emerald-700' : 'text-red-600'}>{message.text}</p>}
          <button
            type="button"
            disabled={isSaving || !leave.trim()}
            onClick={() => void recordLeave()}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save leave note'}
          </button>
        </div>
      )}

      <div className="grid gap-2">
        {canMakeUp && (
          <button
            type="button"
            onClick={() => crm.onOpenMakeup(student.id)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
          >
            Book a make-up class
          </button>
        )}
        <button
          type="button"
          onClick={() => crm.onOpenStudent(student.id)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
        >
          Open student
        </button>
      </div>
    </section>
  )
}
