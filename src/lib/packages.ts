import type { Package, PackageKind } from '../types/domain'

export const packageKindLabels: Record<PackageKind, string> = {
  trial: 'Trial',
  regular: 'Regular',
  camp: 'Camp',
}

// Calendar months, clamped to the month's last day: 31 Jan + 1 month = 28 Feb.
export function addMonths(dateKey: string, months: number) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const target = new Date(year, month - 1 + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(day, lastDay))
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`
}

// A renewal carries on from the current package when it has not run out yet.
export function getRenewalStartDate(lessonExpiryDate: string, todayString: string) {
  return lessonExpiryDate > todayString ? lessonExpiryDate : todayString
}

export type FeeChange = {
  // 'new': the fee year had run out (or never started), so a new one starts.
  // 'extend': the package runs past the fee year, so it grows by a year.
  kind: 'new' | 'extend'
  from: string | null
  to: string
}

export type PastEnrollment = { startDate: string; kind: PackageKind }

// Account Fee and Mirai AI Club Fee cover a year of calendar time.
// - A fee package whose year had run out starts a new year: from the Trial
//   1 Month the child did just before (it counts toward the year), else
//   from the package start.
// - A package that ends after the fee year extends it by a year, counted
//   from the old expiry, not from today.
// No-fee packages (trial, camp) leave the fees alone.
export function planFeeChange(
  pkg: Package,
  startDate: string,
  endDate: string,
  currentExpiry: string | null,
  history: PastEnrollment[],
): FeeChange | null {
  if (!pkg.includesFees) {
    return null
  }

  if (currentExpiry === null || currentExpiry < startDate) {
    const previous = history
      .filter((entry) => entry.startDate < startDate)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
    const trialStart =
      previous?.kind === 'trial' && (currentExpiry === null || previous.startDate >= currentExpiry)
        ? previous.startDate
        : null
    return { kind: 'new', from: currentExpiry, to: addMonths(trialStart ?? startDate, 12) }
  }

  if (endDate > currentExpiry) {
    return { kind: 'extend', from: currentExpiry, to: addMonths(currentExpiry, 12) }
  }

  return null
}

export function planEnrollment(pkg: Package, startDate: string) {
  return {
    classCount: pkg.classCount,
    endDate: addMonths(startDate, pkg.durationMonths),
  }
}

// Packages offered for a new sign-up or renewal: the active ones, in order.
export function getOfferedPackages(packages: Package[]) {
  return packages
    .filter((pkg) => pkg.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
}
