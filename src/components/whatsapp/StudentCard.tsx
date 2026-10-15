import type { Student } from '../../types/domain'
import { describeStudent } from '../../lib/studentLink'
import type { WhatsAppCrm } from './crm'

type StudentCardProps = {
  student: Student
  crm: WhatsAppCrm
  // Set when the team tied this student to the chat by hand; takes that tie away again.
  onUnlink?: () => void
  // The chat is the student themself, not their parent.
  forStudent?: boolean
}

// A student already enrolled: where they are, and the way to arrange a replacement class or
// to see how the student is getting on.
export function StudentCard({ student, crm, onUnlink, forStudent = false }: StudentCardProps) {
  const classroom = crm.classrooms.find((entry) => entry.id === student.classroomId)
  const classes = crm.classesOfStudent(student)
  const plan = crm.packages.find((entry) => entry.id === student.packageId)
  const canMakeUp = crm.canBookMakeup && student.studentType === 'regular' && classroom?.category === 'regular'
  return (
    <section className="space-y-3 border-t border-pink-100 pt-4 text-xs">
      <div>
        <p className="flex items-center gap-1.5 text-slate-500">
          Student
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            {describeStudent(student, crm.packages)}
          </span>
        </p>
        <h4 className="text-sm font-semibold text-[#be185d]">{student.name}</h4>
        {!student.isActive && <p className="text-amber-700">Not active now</p>}
        {onUnlink && (
          <button type="button" onClick={onUnlink} className="mt-0.5 text-slate-500 hover:underline">
            {forStudent ? 'Not this student? Unlink' : 'Not their child? Unlink'}
          </button>
        )}
      </div>

      <dl className="space-y-2">
        <div>
          <dt className="text-slate-500">{classes.length > 1 ? 'Classes' : 'Class'}</dt>
          {classes.length === 0 ? (
            <dd className="text-sm text-slate-900">{classroom?.name ?? 'Not in a class'}</dd>
          ) : (
            classes.map((entry, index) => (
              <dd key={`${entry.title}-${entry.when}-${index}`} className="mt-1 text-sm text-slate-900">
                <span className="block font-medium">{entry.title}</span>
                <span className="block text-slate-700">{entry.when}</span>
                {entry.teacher && <span className="block text-xs text-slate-500">Teacher: {entry.teacher}</span>}
                {entry.zoomLink && (
                  <a
                    href={entry.zoomLink}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-xs font-medium text-[#be185d] underline"
                  >
                    Zoom link
                  </a>
                )}
              </dd>
            ))
          )}
        </div>
        <div>
          <dt className="text-slate-500">Package</dt>
          <dd className="text-sm text-slate-900">{plan?.name ?? 'None recorded'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Phone</dt>
          <dd className="text-sm text-slate-900">{student.phone?.trim() || 'No phone number yet'}</dd>
        </div>
      </dl>

      <div className="grid gap-2">
        {canMakeUp && (
          <button
            type="button"
            onClick={() => crm.onOpenMakeup(student.id)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
          >
            Arrange Replacement
          </button>
        )}
        <button
          type="button"
          onClick={() => crm.onOpenStudent(student.id)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
        >
          Student Progress
        </button>
      </div>
    </section>
  )
}
