import { useState } from 'react'
import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { brand } from '../../lib/brand'
import { formatDate } from '../../domain/studentStatus'
import { planEnrollment, planFeeChange } from '../../lib/packages'
import { monthPlanEndDate } from '../../lib/studentExtras'
import { STUDENT_KIND_LABELS } from '../../lib/studentLink'
import type { ConvertHoaInput } from '../../lib/convertHoa'
import type { Classroom, Package, Student } from '../../types/domain'

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]'

// An HOA student becomes a regular student in one step: the class, and the
// package (or, at a school that charges by the month, the months), on the same
// student. Their HOA classes, attendance and points stay with them.
export function ConvertHoaModal({
  student,
  classrooms,
  packages,
  todayString,
  onClose,
  onConvert,
}: {
  student: Student
  // Classes the child can join (not HOA classes).
  classrooms: Classroom[]
  // The packages the school offers now.
  packages: Package[]
  todayString: string
  onClose: () => void
  // Null when done, else the reason to show.
  onConvert: (input: Omit<ConvertHoaInput, 'studentId'>) => Promise<string | null>
}) {
  // No package for every child, or none to pick: the class and its months.
  const byMonth = !brand.usesPackages || packages.length === 0
  const [classroomId, setClassroomId] = useState('')
  const [packageId, setPackageId] = useState('')
  const [startDate, setStartDate] = useState(todayString)
  const [months, setMonths] = useState(byMonth ? '1' : '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const pkg = packages.find((entry) => String(entry.id) === packageId) ?? null
  const plan = pkg && startDate ? planEnrollment(pkg, startDate) : null
  // The fee year, as a sign-up does: the HOA student's fee dates have run out, so a package with fees starts a new year.
  const fees = pkg && plan ? planFeeChange(pkg, startDate, plan.endDate, student.accountFeeExpiryDate, []) : null
  const monthCount = Number(months)
  const validMonths = months.trim() === '' || (Number.isInteger(monthCount) && monthCount >= 1 && monthCount <= 60)
  const monthEnd = byMonth && startDate && months.trim() && validMonths ? monthPlanEndDate(startDate, monthCount) : null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!classroomId) {
      setError('Pick the class.')
      return
    }
    if (!startDate) {
      setError('Pick the first day.')
      return
    }
    if (!byMonth && !pkg) {
      setError('Pick the package.')
      return
    }
    if (byMonth && !validMonths) {
      setError('Months must be a whole number from 1 to 60.')
      return
    }
    setIsSaving(true)
    setError(null)
    const failure = await onConvert(
      pkg && plan
        ? {
            classroomId: Number(classroomId),
            startDate,
            packageId: pkg.id,
            classCount: plan.classCount,
            lessonExpiryDate: plan.endDate,
            accountFeeExpiryDate: fees?.to ?? student.accountFeeExpiryDate,
            miraiClubExpiryDate: fees?.to ?? student.miraiClubExpiryDate,
          }
        : {
            classroomId: Number(classroomId),
            startDate,
            months: months.trim() ? monthCount : null,
          },
    )
    setIsSaving(false)
    if (failure) {
      setError(failure)
    }
  }

  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-5">
        <div>
          <div className="text-sm font-medium text-[#be185d]">{STUDENT_KIND_LABELS.hoa} → Regular</div>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Convert {student.name} to a regular student</h2>
          <p className="mt-1 text-sm text-slate-500">
            The same student joins a class. Their {STUDENT_KIND_LABELS.hoa} classes, attendance and points stay with them.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-white">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={(event) => void submit(event)} className="space-y-5 px-6 py-6">
        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-700">Class</span>
          <select value={classroomId} onChange={(event) => setClassroomId(event.target.value)} className={fieldClass}>
            <option value="">Choose a class</option>
            {classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name} ({classroom.ageGroup} / {classroom.programLevel})
              </option>
            ))}
          </select>
        </label>

        {!byMonth && (
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-700">Package</span>
            <select value={packageId} onChange={(event) => setPackageId(event.target.value)} className={fieldClass}>
              <option value="">Choose a package</option>
              {packages.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name} - {entry.classCount} classes, {entry.durationMonths} month{entry.durationMonths === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">First Day</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={fieldClass} />
          </label>
          {byMonth && (
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Months</span>
              <input
                type="number"
                min="1"
                max="60"
                step="1"
                value={months}
                onChange={(event) => setMonths(event.target.value)}
                className={fieldClass}
              />
            </label>
          )}
        </div>

        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {plan && pkg ? (
            <>
              {plan.classCount} classes, until {formatDate(plan.endDate)}.
              {brand.usesFees &&
                (fees
                  ? ` Account Fee and ${brand.clubName} run for a year, to ${formatDate(fees.to)}.`
                  : ` No Account Fee or ${brand.clubName} for this package.`)}
            </>
          ) : monthEnd ? (
            <>Paid until {formatDate(monthEnd)}.</>
          ) : byMonth ? (
            <>Months are optional; add them later in the student&apos;s profile.</>
          ) : (
            <>Pick the package to see the classes and dates.</>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-60"
          >
            {isSaving ? 'Converting...' : 'Convert to Regular'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
