import { useState } from 'react'
import { cn } from '../../lib/cn'
import { getStudentStatus } from '../../domain/studentStatus'
import { studentFilterOptions } from '../../lib/constants'
import { SummaryBar } from '../SummaryBar'
import { StatusChip } from '../StatusChip'
import { ExpiryCell } from '../ExpiryCell'
import mascotGordo from '../../assets/mascot-gordo.png'
import type { FilterKey, Package, Student } from '../../types/domain'
import {
  ArrowsClockwise,
  MagnifyingGlass,
  Package as PackageIcon,
  Prohibit,
  UploadSimple,
  UserPlus,
} from '@phosphor-icons/react'

type StudentDashboardSectionProps = {
  activeFilter: FilterKey
  deactivatingStudentId: number | null
  isLoading: boolean
  students: Student[]
  todayString: string
  // Edit covers add, edit and renew; delete covers deactivate.
  canEdit?: boolean
  canDelete?: boolean
  // For the package tag, the filters, and whether fees are tracked.
  packages?: Package[]
  // Opens the window that tags students with their current package.
  onOpenAssignPackages?: () => void
  // Admin only: opens the course packages settings.
  onOpenPackages?: () => void
  onDeactivateStudent: (studentId: number) => void
  onOpenBulkImportPreviewStudents: () => void
  onOpenCreateStudent: () => void
  onOpenStudentDetail: (studentId: number) => void
  onOpenRenewal: (studentId: number) => void
  onSelectFilter: (filter: FilterKey) => void
}

export function StudentDashboardSection({
  activeFilter,
  deactivatingStudentId,
  isLoading,
  students,
  todayString,
  canEdit = true,
  canDelete = true,
  packages = [],
  onOpenAssignPackages,
  onOpenPackages,
  onDeactivateStudent,
  onOpenBulkImportPreviewStudents,
  onOpenCreateStudent,
  onOpenStudentDetail,
  onOpenRenewal,
  onSelectFilter,
}: StudentDashboardSectionProps) {
  const [searchTerm, setSearchTerm] = useState('')

  const packageById = new Map(packages.map((pkg) => [pkg.id, pkg]))
  const studentsWithStatus = students.map((student) => {
    const pkg = student.packageId ? packageById.get(student.packageId) ?? null : null
    return {
      student,
      pkg,
      status: getStudentStatus({ ...student, feesApply: pkg ? pkg.includesFees : true }, todayString),
    }
  })

  const normalizedSearch = searchTerm.trim().toLowerCase()
  const untaggedCount = students.filter(
    (student) => student.studentType === 'regular' && student.isActive && !student.packageId,
  ).length

  const filteredStudents = studentsWithStatus.filter(({ student, status, pkg }) => {
    if (normalizedSearch && !student.name.toLowerCase().includes(normalizedSearch)) {
      return false
    }
    return matchesFilter(student, status, pkg, activeFilter)
  })

  const totalStudents = studentsWithStatus.length
  const hoursAlertCount = studentsWithStatus.filter(
    ({ status }) => status.hoursLow || status.lessonExpired,
  ).length
  const accountFeeAlertCount = studentsWithStatus.filter(
    ({ status }) => status.accountFeeNeedsAttention,
  ).length
  const miraiAlertCount = studentsWithStatus.filter(
    ({ status }) => status.miraiClubNeedsAttention,
  ).length
  const previewStudentCount = studentsWithStatus.filter(
    ({ student }) => student.studentType === 'preview',
  ).length

  // A click anywhere on a row opens the student, except on its own buttons.
  function openFromRow(event: React.MouseEvent, studentId: number) {
    if ((event.target as HTMLElement).closest('button, a, input, select, textarea')) {
      return
    }
    onOpenStudentDetail(studentId)
  }

  function getStudentTypeLabel(student: Student) {
    if (student.studentType === 'preview') {
      return 'Preview'
    }

    return null
  }

  return (
    <div className="space-y-4">
      <SummaryBar
        metrics={[
          { label: 'Total Students', value: totalStudents },
          { label: 'Classes Attention', value: hoursAlertCount, tone: 'brand' },
          { label: 'Account Fee Due', value: accountFeeAlertCount, tone: 'brand' },
          { label: 'Mirai Club Due', value: miraiAlertCount, tone: 'brand' },
          { label: 'Preview Students', value: previewStudentCount },
        ]}
      />

      {onOpenAssignPackages && packages.length > 0 && untaggedCount > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-[#fbcfe8] bg-[#fff8fc] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[#9d174d]">
            {untaggedCount} student{untaggedCount === 1 ? ' has' : 's have'} no package yet. Set
            them so the filters and fee alerts are right.
          </p>
          <button
            type="button"
            onClick={onOpenAssignPackages}
            className="shrink-0 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
          >
            Set Packages
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Student Classes & Expiry Board
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Class balance, membership, and renewal control.
              </p>
            </div>
            {(canEdit || onOpenPackages) && (
            <div className="flex flex-col gap-2 sm:flex-row">
              {onOpenPackages && (
                <button
                  type="button"
                  onClick={onOpenPackages}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <PackageIcon size={16} aria-hidden="true" />
                  Packages
                </button>
              )}
              {canEdit && (
              <>
              <button
                type="button"
                onClick={onOpenBulkImportPreviewStudents}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <UploadSimple size={16} weight="bold" aria-hidden="true" />
                Bulk Import Preview
              </button>
              <button
                type="button"
                onClick={onOpenCreateStudent}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
              >
                <UserPlus size={16} weight="bold" aria-hidden="true" />
                Add Student
              </button>
              </>
              )}
            </div>
            )}
          </div>

          <div className="relative mt-4">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search students by name..."
              className="w-full max-w-xs rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#fc0c97] focus:outline-none"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3 border-t border-slate-200 pt-4">
            {studentFilterOptions.map((option) => {
              const selected = activeFilter === option.key
              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectFilter(option.key)}
                  className={cn(
                    'inline-flex items-center border-b-2 pb-2 text-sm font-semibold transition',
                    selected
                      ? 'border-[#fc0c97] text-[#be185d]'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
                  )}
                >
                  {option.label}
                  <span className="ml-1.5 text-xs font-medium text-slate-400">
                    {studentsWithStatus.filter(({ student, status, pkg }) =>
                      matchesFilter(student, status, pkg, option.key),
                    ).length}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {isLoading && (
          <div className="px-6 py-16 text-center text-sm text-slate-500">
            Loading students from Supabase...
          </div>
        )}

        {!isLoading && filteredStudents.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <img src={mascotGordo} alt="" aria-hidden="true" className="h-24 w-auto" />
            <p className="max-w-sm text-sm text-slate-500">
              No students found. Create records in Supabase Table Editor or
              run the seed rows from the SQL file.
            </p>
          </div>
        )}

        {!isLoading && filteredStudents.length > 0 && (
          <>
            <ul className="divide-y divide-slate-200 md:hidden">
              {filteredStudents.map(({ student, status, pkg }) => (
                <li
                  key={student.id}
                  onClick={(event) => openFromRow(event, student.id)}
                  className="cursor-pointer space-y-3 p-4 transition hover:bg-[#fff8fc]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenStudentDetail(student.id)}
                          className="text-left text-base font-semibold text-slate-900"
                        >
                          {student.name}
                        </button>
                        {getStudentTypeLabel(student) && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                            {getStudentTypeLabel(student)}
                          </span>
                        )}
                        <PackageTag student={student} pkg={pkg} />
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Student ID #{student.id.toString().padStart(3, '0')}
                        {student.phone ? ` - ${student.phone}` : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={cn(
                          'inline-flex min-w-14 items-center justify-center rounded-lg px-2 py-1 text-sm font-semibold',
                          status.isDeactivated || status.hoursLow
                            ? 'bg-[#fff1f8] text-[#be185d] ring-1 ring-inset ring-[#fecdd3]'
                            : 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
                        )}
                      >
                        {student.studentType === 'trial' ? '—' : student.remainingHours}
                      </div>
                      <div className="mt-1 text-[11px] font-medium text-slate-500">
                        {status.isDeactivated
                          ? 'Deactivated'
                          : student.studentType === 'trial'
                            ? 'Not billed'
                            : status.hoursLow
                              ? 'Needs attention'
                              : 'Healthy'}
                      </div>
                    </div>
                  </div>

                  {status.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {status.tags.map((tag) => (
                        <StatusChip
                          key={`${student.id}-${tag.label}`}
                          label={tag.label}
                          tone={tag.tone}
                        />
                      ))}
                    </div>
                  )}

                  <dl className="space-y-2 rounded-xl bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <dt className="pt-0.5 text-xs font-medium text-slate-500">
                        Lesson Expiry
                      </dt>
                      <dd>
                        <ExpiryCell
                          date={student.lessonExpiryDate}
                          meta={status.lessonExpiry}
                        />
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="pt-0.5 text-xs font-medium text-slate-500">
                        Account Fee
                      </dt>
                      <dd>
                        <FeeCell pkg={pkg} date={student.accountFeeExpiryDate} meta={status.accountFeeExpiry} />
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="pt-0.5 text-xs font-medium text-slate-500">
                        Mirai Club
                      </dt>
                      <dd>
                        <FeeCell pkg={pkg} date={student.miraiClubExpiryDate} meta={status.miraiClubExpiry} />
                      </dd>
                    </div>
                  </dl>

                  <div className="grid grid-cols-2 gap-2">
                    {canEdit && student.studentType !== 'preview' && (
                      <button
                        type="button"
                        onClick={() => onOpenRenewal(student.id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
                      >
                        <ArrowsClockwise size={16} aria-hidden="true" />
                        Renew
                      </button>
                    )}
                    {(canDelete || !student.isActive) && (
                    <button
                      type="button"
                      disabled={!student.isActive || deactivatingStudentId === student.id}
                      onClick={() => onDeactivateStudent(student.id)}
                      className={cn(
                        'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition',
                        !student.isActive
                          ? 'cursor-not-allowed border border-red-200 bg-red-50 text-red-600'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      <Prohibit size={16} aria-hidden="true" />
                      {!student.isActive
                        ? 'Deactivated'
                        : deactivatingStudentId === student.id
                          ? 'Deactivating...'
                          : 'Deactivate'}
                    </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table data-compact-table className="min-w-[980px] divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-6 py-4">Student Name</th>
                    <th className="px-6 py-4">Lesson Expiry</th>
                    <th className="px-6 py-4">Account Fee Expiry</th>
                    <th className="px-6 py-4">Mirai Club Expiry</th>
                    <th className="px-6 py-4">Membership Status</th>
                    <th className="px-6 py-4">Classes</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredStudents.map(({ student, status, pkg }) => (
                    <tr
                      key={student.id}
                      onClick={(event) => openFromRow(event, student.id)}
                      className="cursor-pointer align-top transition hover:bg-[#fff8fc]"
                    >
                      <td className="px-6 py-5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenStudentDetail(student.id)}
                              className="table-cell-link text-left font-semibold text-slate-900 transition hover:text-[#be185d]"
                            >
                              {student.name}
                            </button>
                            {getStudentTypeLabel(student) && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                {getStudentTypeLabel(student)}
                              </span>
                            )}
                            <PackageTag student={student} pkg={pkg} />
                          </div>
                          <div className="text-xs text-slate-500">
                            Student ID #{student.id.toString().padStart(3, '0')}
                            {student.phone ? ` - ${student.phone}` : ''}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <ExpiryCell
                          date={student.lessonExpiryDate}
                          meta={status.lessonExpiry}
                        />
                      </td>
                      <td className="px-6 py-5">
                        <FeeCell pkg={pkg} date={student.accountFeeExpiryDate} meta={status.accountFeeExpiry} />
                      </td>
                      <td className="px-6 py-5">
                        <FeeCell pkg={pkg} date={student.miraiClubExpiryDate} meta={status.miraiClubExpiry} />
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex max-w-[320px] flex-wrap gap-2">
                          {status.tags.map((tag) => (
                            <StatusChip
                              key={`${student.id}-${tag.label}`}
                              label={tag.label}
                              tone={tag.tone}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="space-y-2">
                          <div
                            className={cn(
                              'inline-flex min-w-14 items-center justify-center rounded-lg px-2 py-1 text-sm font-semibold',
                              status.isDeactivated || status.hoursLow
                                ? 'bg-[#fff1f8] text-[#be185d] ring-1 ring-inset ring-[#fecdd3]'
                                : 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
                            )}
                          >
                            {student.studentType === 'trial' ? '—' : student.remainingHours}
                          </div>
                          <div className="text-xs font-medium text-slate-500">
                            {status.isDeactivated
                              ? 'Student deactivated'
                              : student.studentType === 'trial'
                                ? 'Not billed'
                                : status.hoursLow
                                  ? 'Immediate action needed'
                                  : 'Healthy balance'}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex justify-end gap-2">
                          {canEdit && student.studentType !== 'preview' && (
                            <button
                              type="button"
                              onClick={() => onOpenRenewal(student.id)}
                              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
                            >
                              <ArrowsClockwise size={16} aria-hidden="true" />
                              Renew
                            </button>
                          )}
                          {(canDelete || !student.isActive) && (
                          <button
                            type="button"
                            disabled={!student.isActive || deactivatingStudentId === student.id}
                            onClick={() => onDeactivateStudent(student.id)}
                            className={cn(
                              'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition',
                              !student.isActive
                                ? 'cursor-not-allowed border border-red-200 bg-red-50 text-red-600'
                                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                            )}
                          >
                            <Prohibit size={16} aria-hidden="true" />
                            {!student.isActive
                              ? 'Deactivated'
                              : deactivatingStudentId === student.id
                                ? 'Deactivating...'
                                : 'Deactivate'}
                          </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

// HOA: the trial-slot (and old preview-class) students. Trial / Regular /
// Camp: by package type; regular students with no package yet count as
// Regular until one is picked.
// Need Follow Up: classes at 2 or fewer, the lesson package expired, or the
// account fee / Mirai Club expired or due within 14 days (only for packages
// with fees). Deactivated students are not renewing, so they are left out.
function matchesFilter(
  student: Student,
  status: ReturnType<typeof getStudentStatus>,
  pkg: Package | null,
  filter: FilterKey,
) {
  if (filter === 'hoa') {
    return student.studentType === 'trial' || student.studentType === 'preview'
  }
  if (filter === 'trial' || filter === 'camp') {
    return student.studentType === 'regular' && pkg?.kind === filter
  }
  if (filter === 'regular') {
    return student.studentType === 'regular' && (pkg === null || pkg.kind === 'regular')
  }
  if (filter === 'followUp') {
    return (
      student.isActive &&
      (status.hoursLow ||
        status.lessonExpired ||
        status.accountFeeNeedsAttention ||
        status.miraiClubNeedsAttention)
    )
  }
  return true
}

function PackageTag({ student, pkg }: { student: Student; pkg: Package | null }) {
  if (student.studentType !== 'regular') {
    return null
  }
  return pkg ? (
    <span className="rounded-full bg-[#fff1f8] px-2 py-0.5 text-[11px] font-semibold text-[#be185d]">
      {pkg.name}
    </span>
  ) : (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
      No package
    </span>
  )
}

// Packages without fees do not track the Account Fee / Mirai Club dates.
function FeeCell({
  pkg,
  date,
  meta,
}: {
  pkg: Package | null
  date: string
  meta: ReturnType<typeof getStudentStatus>['accountFeeExpiry']
}) {
  if (pkg && !pkg.includesFees) {
    return (
      <span className="text-sm text-slate-400" title="No fee for this package">
        —
      </span>
    )
  }
  return <ExpiryCell date={date} meta={meta} />
}
