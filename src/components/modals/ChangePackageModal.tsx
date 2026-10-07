import { useState } from 'react'
import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { formatDate } from '../../domain/studentStatus'
import { addMonths, getOfferedPackages } from '../../lib/packages'
import type { Package, Student, StudentEnrollment } from '../../types/domain'

export type PackageChange = {
  packageId: number
  startDate: string
  classCount: number
  lessonExpiryDate: string
  accountFeeExpiryDate: string
  miraiClubExpiryDate: string
  remark: string
}

type ChangePackageModalProps = {
  student: Student
  // The sign-up being corrected: the student's most recent one.
  enrollment: StudentEnrollment
  packages: Package[]
  isSaving: boolean
  error: string | null
  onClose: () => void
  onSave: (change: PackageChange) => void
}

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]'

// Fee dates for the corrected package. Moving from a no-fee package to one
// with fees starts the fee year at the package start: the old dates were
// only placeholders. Otherwise the current dates stay.
function getFeeDates(student: Student, oldPackage: Package | null, pkg: Package, startDate: string) {
  if (pkg.includesFees && oldPackage && !oldPackage.includesFees) {
    const year = addMonths(startDate, 12)
    return { account: year, mirai: year }
  }
  return { account: student.accountFeeExpiryDate, mirai: student.miraiClubExpiryDate }
}

// Fixes a package picked by mistake: replaces the latest sign-up instead of
// adding a new one on top, so the classes are not counted twice.
export function ChangePackageModal({
  student,
  enrollment,
  packages,
  isSaving,
  error,
  onClose,
  onSave,
}: ChangePackageModalProps) {
  const oldPackage = packages.find((pkg) => pkg.id === enrollment.packageId) ?? null
  const offered = getOfferedPackages(packages).filter((pkg) => pkg.id !== enrollment.packageId)
  const [form, setForm] = useState<{ packageId: string } & Omit<PackageChange, 'packageId' | 'classCount'> & { classCount: string }>({
    packageId: '',
    startDate: enrollment.startDate,
    classCount: '',
    lessonExpiryDate: enrollment.endDate,
    accountFeeExpiryDate: student.accountFeeExpiryDate,
    miraiClubExpiryDate: student.miraiClubExpiryDate,
    remark: '',
  })
  const pkg = packages.find((entry) => String(entry.id) === form.packageId) ?? null

  function apply(packageId: string, startDate: string) {
    const next = packages.find((entry) => String(entry.id) === packageId)
    if (!next) {
      setForm((current) => ({ ...current, packageId, startDate }))
      return
    }
    const fees = getFeeDates(student, oldPackage, next, startDate)
    setForm((current) => ({
      ...current,
      packageId,
      startDate,
      classCount: String(next.classCount),
      lessonExpiryDate: addMonths(startDate, next.durationMonths),
      accountFeeExpiryDate: fees.account,
      miraiClubExpiryDate: fees.mirai,
    }))
  }

  const classCount = Number.parseInt(form.classCount, 10)
  const isValid =
    pkg !== null &&
    Number.isInteger(classCount) &&
    classCount >= 0 &&
    Boolean(form.startDate && form.lessonExpiryDate && form.accountFeeExpiryDate && form.miraiClubExpiryDate) &&
    form.lessonExpiryDate >= form.startDate
  const classesLeft = student.remainingHours - enrollment.classCount + (Number.isInteger(classCount) ? classCount : 0)

  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">Correct a mistake</div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Change Package</h2>
            <p className="mt-2 text-sm text-slate-500">
              Replaces {oldPackage?.name ?? 'the latest package'} (from {formatDate(enrollment.startDate)},{' '}
              {enrollment.classCount} classes) instead of adding a package on top. Classes
              already attended stay counted. For a real renewal, use Renew.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div data-modal-body className="max-h-[75vh] space-y-5 overflow-y-auto px-6 py-6 sm:px-8">
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Correct Package</span>
            <select
              value={form.packageId}
              onChange={(event) => apply(event.target.value, form.startDate)}
              className={fieldClass}
            >
              <option value="">Pick the right package</option>
              {offered.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name} - {entry.classCount} classes, {entry.durationMonths} month
                  {entry.durationMonths === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Starts On</span>
            <input
              type="date"
              value={form.startDate}
              onChange={(event) => event.target.value && apply(form.packageId, event.target.value)}
              className={fieldClass}
            />
          </label>
        </div>

        {pkg && (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Classes in Package</span>
                <input
                  type="number"
                  min="0"
                  value={form.classCount}
                  onChange={(event) => setForm((current) => ({ ...current, classCount: event.target.value }))}
                  className={fieldClass}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Lesson Expiry Date</span>
                <input
                  type="date"
                  value={form.lessonExpiryDate}
                  onChange={(event) => setForm((current) => ({ ...current, lessonExpiryDate: event.target.value }))}
                  className={fieldClass}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Account Fee Expiry Date</span>
                <input
                  type="date"
                  value={form.accountFeeExpiryDate}
                  onChange={(event) => setForm((current) => ({ ...current, accountFeeExpiryDate: event.target.value }))}
                  className={fieldClass}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Mirai Club Expiry Date</span>
                <input
                  type="date"
                  value={form.miraiClubExpiryDate}
                  onChange={(event) => setForm((current) => ({ ...current, miraiClubExpiryDate: event.target.value }))}
                  className={fieldClass}
                />
              </label>
              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">Reason (optional)</span>
                <input
                  type="text"
                  value={form.remark}
                  placeholder="e.g. Picked Trial by mistake"
                  onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
                  className={fieldClass}
                />
              </label>
            </div>

            <div className="rounded-2xl border border-[#fbcfe8] bg-[#fff8fc] px-4 py-3 text-sm text-[#9d174d]">
              Classes left: {student.remainingHours} → <span className="font-semibold">{classesLeft}</span>{' '}
              (takes back {enrollment.classCount} from {oldPackage?.name ?? 'the old package'}, gives{' '}
              {Number.isInteger(classCount) ? classCount : 0})
            </div>
          </>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isValid || isSaving}
            onClick={() =>
              pkg &&
              onSave({
                packageId: pkg.id,
                startDate: form.startDate,
                classCount,
                lessonExpiryDate: form.lessonExpiryDate,
                accountFeeExpiryDate: form.accountFeeExpiryDate,
                miraiClubExpiryDate: form.miraiClubExpiryDate,
                remark: form.remark.trim(),
              })
            }
            className="rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Change Package'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
