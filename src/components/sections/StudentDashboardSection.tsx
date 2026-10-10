import { useMemo, useState } from 'react'
import { cn } from '../../lib/cn'
import { formatDate, getWorstFee, type StudentIssue } from '../../domain/studentStatus'
import { studentFilterOptions } from '../../lib/constants'
import {
  buildStudentRows,
  filterStudentRows,
  sortStudentRows,
  type StudentRow,
  type StudentSort,
} from '../../lib/studentRows'
import type { StudentParent } from '../../lib/studentParents'
import { RowActionsMenu, type RowAction } from '../RowActionsMenu'
import mascotGordo from '../../assets/mascot-gordo.png'
import type {
  Classroom,
  FilterKey,
  Package,
  Schedule,
  Student,
  Teacher,
  TrialBooking,
} from '../../types/domain'
import {
  ArrowsClockwise,
  MagnifyingGlass,
  Package as PackageIcon,
  UploadSimple,
  UserPlus,
} from '@phosphor-icons/react'

type StudentDashboardSectionProps = {
  // The type tab: All, HOA, Trial, Regular or Camp.
  activeFilter: FilterKey
  // Independent of the tab: only students who need action.
  followUpOnly?: boolean
  onToggleFollowUp?: () => void
  deactivatingStudentId: number | null
  isLoading: boolean
  students: Student[]
  todayString: string
  // Edit covers add, edit and renew; delete covers deactivate.
  canEdit?: boolean
  canDelete?: boolean
  // For the package tag, the filters, and whether fees are tracked.
  packages?: Package[]
  // For the Class column, the HOA booking date and the parent's name.
  classrooms?: Classroom[]
  schedules?: Schedule[]
  teacherMap?: Map<number, Teacher>
  trialBookings?: TrialBooking[]
  parents?: Map<number, StudentParent>
  attendedStudentIds?: Set<number>
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

const NO_CLASSROOMS: Classroom[] = []
const NO_SCHEDULES: Schedule[] = []
const NO_PACKAGES: Package[] = []
const NO_BOOKINGS: TrialBooking[] = []
const NO_TEACHERS = new Map<number, Teacher>()
const NO_PARENTS = new Map<number, StudentParent>()

const sortOptions: Array<{ key: StudentSort; label: string }> = [
  { key: 'attention', label: 'Sort: Needs attention first' },
  { key: 'name', label: 'Sort: Name A to Z' },
  { key: 'ends', label: 'Sort: Package ends soonest' },
  { key: 'left', label: 'Sort: Fewest classes left' },
]

export function StudentDashboardSection({
  activeFilter,
  followUpOnly = false,
  onToggleFollowUp,
  deactivatingStudentId,
  isLoading,
  students,
  todayString,
  canEdit = true,
  canDelete = true,
  packages = NO_PACKAGES,
  classrooms = NO_CLASSROOMS,
  schedules = NO_SCHEDULES,
  teacherMap = NO_TEACHERS,
  trialBookings = NO_BOOKINGS,
  parents = NO_PARENTS,
  attendedStudentIds,
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
  const [sort, setSort] = useState<StudentSort>('attention')

  const rows = useMemo(
    () =>
      buildStudentRows({
        students,
        packages,
        classrooms,
        schedules,
        teacherMap,
        trialBookings,
        parents,
        attendedStudentIds,
        todayString,
      }),
    [students, packages, classrooms, schedules, teacherMap, trialBookings, parents, attendedStudentIds, todayString],
  )

  const visibleRows = sortStudentRows(
    filterStudentRows(rows, { type: activeFilter, followUpOnly, search: searchTerm }),
    sort,
  )
  const followUpCount = rows.filter((row) => row.needsFollowUp).length
  const activeCount = rows.filter((row) => row.student.isActive).length
  const untaggedCount = students.filter(
    (student) => student.studentType === 'regular' && student.isActive && !student.packageId,
  ).length
  const isFiltered = activeFilter !== 'all' || followUpOnly || searchTerm.trim() !== ''

  // A click anywhere on a row opens the student, except on its own buttons.
  function openFromRow(event: React.MouseEvent, studentId: number) {
    if ((event.target as HTMLElement).closest('button, a, input, select, textarea')) {
      return
    }
    onOpenStudentDetail(studentId)
  }

  function actionsFor(row: StudentRow): RowAction[] {
    const { student } = row
    const actions: RowAction[] = [
      { label: 'View details', onSelect: () => onOpenStudentDetail(student.id) },
    ]
    if (canEdit && student.studentType !== 'preview') {
      actions.push({ label: 'Renew', onSelect: () => onOpenRenewal(student.id) })
    }
    if (canDelete || !student.isActive) {
      actions.push({
        label: !student.isActive
          ? 'Deactivated'
          : deactivatingStudentId === student.id
            ? 'Deactivating...'
            : 'Deactivate',
        danger: true,
        disabled: !student.isActive || deactivatingStudentId === student.id,
        onSelect: () => onDeactivateStudent(student.id),
      })
    }
    return actions
  }

  function renewButton(row: StudentRow) {
    // An HOA child is followed up with the parent, not renewed.
    if (!canEdit || !row.needsFollowUp || row.kind === 'hoa') {
      return null
    }
    return (
      <button
        type="button"
        onClick={() => onOpenRenewal(row.student.id)}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#fbcfe8] bg-[#fff1f8] px-3 py-1.5 text-sm font-semibold text-[#be185d] transition hover:bg-[#ffe4f2]"
      >
        <ArrowsClockwise size={14} aria-hidden="true" />
        Renew
      </button>
    )
  }

  return (
    <div className="space-y-4">
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
        <div className="border-b border-slate-200 bg-white px-5 pt-4 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {activeCount} active {activeCount === 1 ? 'student' : 'students'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {followUpCount > 0 ? `${followUpCount} need follow-up` : 'Everyone is on track'}
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

          <div className="mt-4 flex flex-wrap items-end justify-between gap-x-5 gap-y-2">
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {studentFilterOptions.map((option) => {
                const selected = activeFilter === option.key
                const count = rows.filter(
                  (row) => option.key === 'all' || row.kind === option.key,
                ).length
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelectFilter(option.key)}
                    className={cn(
                      'inline-flex items-center border-b-2 pb-2.5 text-sm font-semibold transition',
                      selected
                        ? 'border-[#fc0c97] text-[#be185d]'
                        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
                    )}
                  >
                    {option.label}
                    <span className="ml-1.5 text-xs font-medium text-slate-400">{count}</span>
                  </button>
                )
              })}
            </div>
            {onToggleFollowUp && (
              <button
                type="button"
                aria-pressed={followUpOnly}
                onClick={onToggleFollowUp}
                className={cn(
                  'mb-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold transition',
                  followUpOnly
                    ? 'border-amber-500 bg-amber-50 text-amber-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                Needs follow-up
                <span className="font-bold">{followUpCount}</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6">
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search name, ID, parent or phone"
              aria-label="Search students"
              className="w-full rounded-xl border border-slate-200 py-2 pl-9! pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#fc0c97] focus:outline-none"
            />
          </div>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as StudentSort)}
            aria-label="Sort students"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#fc0c97] focus:outline-none"
          >
            {sortOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="ml-auto text-sm text-slate-500">
            {visibleRows.length} of {rows.length} students
          </span>
        </div>

        {isLoading && (
          <div className="px-6 py-16 text-center text-sm text-slate-500">Loading students...</div>
        )}

        {!isLoading && visibleRows.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <img src={mascotGordo} alt="" aria-hidden="true" className="h-24 w-auto" />
            <p className="max-w-sm text-sm text-slate-500">
              {isFiltered
                ? 'No students match. Try clearing the search or the filters.'
                : 'No students yet. Use Add Student to create the first one.'}
            </p>
          </div>
        )}

        {!isLoading && visibleRows.length > 0 && (
          <>
            <ul className="divide-y divide-slate-200 border-t border-slate-200 md:hidden">
              {visibleRows.map((row) => (
                <li
                  key={row.student.id}
                  onClick={(event) => openFromRow(event, row.student.id)}
                  className={cn(
                    'cursor-pointer space-y-3 p-4 transition hover:bg-[#fff8fc]',
                    !row.student.isActive && 'opacity-60',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <StudentIdentity row={row} onOpen={onOpenStudentDetail} />
                    <StatusCell row={row} todayString={todayString} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-slate-50 p-3">
                    <div>
                      <dt className="text-xs font-medium text-slate-500">Package</dt>
                      <dd className="mt-0.5">
                        <PackageCell row={row} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500">Classes left</dt>
                      <dd className="mt-0.5">
                        <ClassesLeftCell row={row} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500">Ends</dt>
                      <dd className="mt-0.5">
                        <EndsCell row={row} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500">Fees</dt>
                      <dd className="mt-0.5">
                        <FeesCell row={row} />
                      </dd>
                    </div>
                  </dl>
                  <div className="flex items-center justify-end gap-2">
                    {renewButton(row)}
                    <RowActionsMenu
                      label={`More actions for ${row.student.name}`}
                      actions={actionsFor(row)}
                    />
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table data-compact-table className="min-w-[900px] divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                    <th className="px-3 py-3">Student</th>
                    <th className="px-3 py-3">Class</th>
                    <th className="px-3 py-3">Package</th>
                    <th className="px-3 py-3">Classes left</th>
                    <th className="px-3 py-3">Ends</th>
                    <th className="px-3 py-3">Fees</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {visibleRows.map((row) => (
                    <tr
                      key={row.student.id}
                      onClick={(event) => openFromRow(event, row.student.id)}
                      className={cn(
                        'cursor-pointer transition hover:bg-[#fff8fc]',
                        !row.student.isActive && 'opacity-60',
                      )}
                    >
                      <td className="px-3 py-3">
                        <StudentIdentity row={row} onOpen={onOpenStudentDetail} />
                      </td>
                      <td className="px-3 py-3">
                        <ClassCell row={row} todayString={todayString} />
                      </td>
                      <td className="px-3 py-3">
                        <PackageCell row={row} />
                      </td>
                      <td className="px-3 py-3">
                        <ClassesLeftCell row={row} />
                      </td>
                      <td className="px-3 py-3">
                        <EndsCell row={row} />
                      </td>
                      <td className="px-3 py-3">
                        <FeesCell row={row} />
                      </td>
                      <td className="px-3 py-3">
                        <StatusCell row={row} todayString={todayString} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {renewButton(row)}
                          <RowActionsMenu
                            label={`More actions for ${row.student.name}`}
                            actions={actionsFor(row)}
                          />
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

const primary = 'whitespace-nowrap text-[13.5px] font-semibold text-slate-900'
const secondary = 'whitespace-nowrap text-xs text-slate-500'

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

function StudentIdentity({
  row,
  onOpen,
}: {
  row: StudentRow
  onOpen: (studentId: number) => void
}) {
  const { student, parent } = row
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#fbcfe8] bg-[#fff1f8] text-xs font-bold text-[#be185d]"
      >
        {initials(student.name)}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpen(student.id)}
            className="table-cell-link text-left text-[13.5px] font-semibold text-slate-900 transition hover:text-[#be185d]"
          >
            {student.name}
          </button>
          {student.studentType === 'preview' && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              Preview
            </span>
          )}
        </div>
        <div className={secondary}>
          #{student.id.toString().padStart(3, '0')}
          {parent?.name ? ` · ${parent.name}` : ''}
        </div>
      </div>
    </div>
  )
}

function ClassCell({ row, todayString }: { row: StudentRow; todayString: string }) {
  if (row.kind === 'hoa') {
    if (!row.booking) {
      return <span className={secondary}>{row.student.studentType === 'preview' ? 'Preview class' : 'HOA class'}</span>
    }
    return (
      <>
        <div className={primary}>HOA class</div>
        <div className={secondary}>
          {formatShortDate(row.booking.bookingDate)}
          {row.booking.bookingDate < todayString ? '' : ' · upcoming'}
        </div>
      </>
    )
  }
  if (!row.classroom) {
    return <span className={secondary}>No class yet</span>
  }
  return (
    <>
      <div className={primary}>{row.classroom.name}</div>
      <div className={secondary}>
        {[row.slot, row.teacherName].filter(Boolean).join(' · ') || 'No weekly time yet'}
      </div>
    </>
  )
}

function PackageCell({ row }: { row: StudentRow }) {
  const { student, pkg } = row
  if (student.studentType !== 'regular') {
    return (
      <>
        <div className={primary}>{student.studentType === 'preview' ? 'Preview' : 'HOA'}</div>
        <div className={secondary}>2-hour trial class</div>
      </>
    )
  }
  return pkg ? (
    <span className="inline-flex rounded-full bg-[#fff1f8] px-2 py-0.5 text-[11px] font-semibold text-[#be185d]">
      {pkg.name}
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
      No package
    </span>
  )
}

function ClassesLeftCell({ row }: { row: StudentRow }) {
  const { student, pkg, status } = row
  if (student.studentType !== 'regular') {
    return <span className={secondary}>—</span>
  }
  const low = status.hoursLow
  return (
    <>
      <div className={primary}>
        {student.remainingHours}
        {pkg ? <span className="ml-1 text-xs font-medium text-slate-500">of {pkg.classCount}</span> : null}
      </div>
      {pkg && pkg.classCount > 0 && (
        <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
          <div
            className={cn('h-full rounded-full', low ? 'bg-red-600' : 'bg-[#fc0c97]')}
            style={{
              width: `${Math.max(4, Math.min(100, Math.round((student.remainingHours / pkg.classCount) * 100)))}%`,
            }}
          />
        </div>
      )}
    </>
  )
}

function EndsCell({ row }: { row: StudentRow }) {
  const { student, status } = row
  if (student.studentType !== 'regular') {
    return <span className={secondary}>—</span>
  }
  const { expired, dueSoon, daysUntil } = status.lessonExpiry
  return (
    <>
      <div className={primary}>{formatDate(student.lessonExpiryDate)}</div>
      <div
        className={cn(
          'whitespace-nowrap text-xs',
          expired ? 'font-semibold text-red-600' : dueSoon ? 'font-semibold text-amber-600' : 'text-slate-500',
        )}
      >
        {expired ? `Ended ${Math.abs(daysUntil)}d ago` : daysUntil === 0 ? 'Today' : `in ${daysUntil} days`}
      </div>
    </>
  )
}

// Shows the fee that is a problem; when nothing is, one quiet line.
function FeesCell({ row }: { row: StudentRow }) {
  const { student, pkg, status } = row
  if (student.studentType !== 'regular' || (pkg && !pkg.includesFees)) {
    return (
      <span className={secondary} title="No fee for this package">
        {student.studentType === 'regular' ? 'No fees' : '—'}
      </span>
    )
  }
  const worst = getWorstFee(status)
  if (worst) {
    const expired = worst.meta.expired
    return (
      <>
        <div className={cn('whitespace-nowrap text-[13px] font-semibold', expired ? 'text-red-600' : 'text-amber-600')}>
          {worst.name} {expired ? 'expired' : 'due'}
        </div>
        <div className={secondary}>
          {expired ? `${Math.abs(worst.meta.daysUntil)} days ago` : `in ${worst.meta.daysUntil} days`}
        </div>
      </>
    )
  }
  const paidTo =
    student.accountFeeExpiryDate < student.miraiClubExpiryDate
      ? student.accountFeeExpiryDate
      : student.miraiClubExpiryDate
  return <span className={secondary}>Paid to {formatMonth(paidTo)}</span>
}

function issueTone(issue: StudentIssue) {
  return issue.tone === 'critical'
    ? 'bg-red-50 text-red-700 ring-red-200'
    : 'bg-amber-50 text-amber-700 ring-amber-200'
}

// One status for the row: the most urgent thing, and how many more there are.
function StatusCell({ row, todayString }: { row: StudentRow; todayString: string }) {
  const { issues, student, booking } = row
  if (issues.length === 0) {
    if (student.studentType === 'preview') {
      return <span className={secondary}>Preview</span>
    }
    if (student.studentType === 'trial' && booking && booking.bookingDate >= todayString) {
      return (
        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
          Booked {formatShortDate(booking.bookingDate)}
        </span>
      )
    }
    return student.studentType === 'regular' ? (
      <span className="whitespace-nowrap text-xs font-medium text-slate-400">✓ On track</span>
    ) : (
      <span className={secondary}>—</span>
    )
  }
  const [first, ...rest] = issues
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          'inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset',
          issueTone(first),
        )}
      >
        {first.label}
      </span>
      {rest.length > 0 && (
        <span
          title={rest.map((issue) => issue.label).join(', ')}
          className="text-xs font-semibold text-slate-500"
        >
          +{rest.length}
        </span>
      )}
    </div>
  )
}

function formatShortDate(dateString: string) {
  return formatDate(dateString).replace(/, \d{4}$/, '')
}

function formatMonth(dateString: string) {
  return formatDate(dateString).replace(/ \d{1,2},/, '')
}
