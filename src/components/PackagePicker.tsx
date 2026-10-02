import type { Package } from '../types/domain'

type PackagePickerProps = {
  packages: Package[]
  packageId: string
  startDate: string
  // '' means no package: classes and dates are typed in by hand.
  onChange: (packageId: string, startDate: string) => void
  notice?: string | null
}

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]'

// Picking a package fills in the classes and dates below it, which can still
// be changed before saving.
export function PackagePicker({ packages, packageId, startDate, onChange, notice }: PackagePickerProps) {
  return (
    <div className="space-y-3 rounded-2xl border border-[#fbcfe8] bg-[#fff8fc] p-4 sm:col-span-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Package</span>
          <select
            value={packageId}
            onChange={(event) => onChange(event.target.value, startDate)}
            className={fieldClass}
          >
            <option value="">No package (type it in)</option>
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name} - {pkg.classCount} classes, {pkg.durationMonths} month
                {pkg.durationMonths === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </label>
        {packageId && (
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Starts On</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => event.target.value && onChange(packageId, event.target.value)}
              className={fieldClass}
            />
          </label>
        )}
      </div>
      {packageId && notice && <p className="text-sm text-[#9d174d]">{notice}</p>}
    </div>
  )
}
