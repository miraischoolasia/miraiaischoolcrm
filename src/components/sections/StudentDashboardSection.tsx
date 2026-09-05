import { useState } from 'react'
import { cn } from '../../lib/cn'
import { getStudentStatus } from '../../domain/studentStatus'
import { studentFilterOptions } from '../../lib/constants'
import { SummaryBar } from '../SummaryBar'
import { StatusChip } from '../StatusChip'
import { ExpiryCell } from '../ExpiryCell'
import mascotGordo from '../../assets/mascot-gordo.png'
import type { FilterKey, Student } from '../../types/domain'
import {
  ArrowsClockwise,
  Eye,
  MagnifyingGlass,
  PencilSimple,
  Prohibit,
  UserPlus,
} from '@phosphor-icons/react'

type StudentDashboardSectionProps = {
  activeFilter: FilterKey
  deactivatingStudentId: number | null
  isLoading: boolean
  students: Student[]
  todayString: string
  onDeactivateStudent: (studentId: number) => void
  onEditStudent: (studentId: number) => void
  onOpenCreateStudent: () => void
  onOpenStudentDetail: (studentId: number) => void
  onOpenRenewal: (studentId: number) => void
  onToggleFilter: (filter: FilterKey) => void
}

export function StudentDashboardSection({
  activeFilter,
  deactivatingStudentId,
  isLoading,
  students,
  todayString,
  onDeactivateStudent,
  onEditStudent,
  onOpenCreateStudent,
  onOpenStudentDetail,
  onOpenRenewal,
  onToggleFilter,
}: StudentDashboardSectionProps) {
  const [searchTerm, setSearchTerm] = useState('')

  const studentsWithStatus = students.map((student) => ({
    student,
    status: getStudentStatus(student, todayString),
  }))

  const normalizedSearch = searchTerm.trim().toLowerCase()

  const filteredStudents = studentsWithStatus.filter(({ student, status }) => {
    if (normalizedSearch && !student.name.toLowerCase().includes(normalizedSearch)) {
      return false
    }

    if (activeFilter === 'hours') {
      return status.hoursLow || status.lessonExpired
    }

    if (activeFilter === 'accountFee') {
      return status.accountFeeNeedsAttention
    }

    if (activeFilter === 'mirai') {
      return status.miraiClubNeedsAttention
    }

    if (activeFilter === 'normal') {
      return status.isNormal
    }

    return true
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

  return (
    <div className="space-y-4">
      <SummaryBar
        metrics={[
          { label: 'Total Students', value: totalStudents },
          { label: 'Classes Attention', value: hoursAlertCount, tone: 'brand' },
          { label: 'Account Fee Due', value: accountFeeAlertCount, tone: 'brand' },
          { label: 'Mirai Club Due', value: miraiAlertCount, tone: 'brand' },
        ]}
      />

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Student Classes & Expiry Board
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Admin-only table for class balance, membership, and renewal control.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenCreateStudent}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
            >
              <UserPlus size={16} weight="bold" aria-hidden="true" />
              Add Student
            </button>
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
                  onClick={() => onToggleFilter(option.key)}
                  className={cn(
                    'inline-flex items-center border-b-2 pb-2 text-sm font-semibold transition',
                    selected
                      ? 'border-[#fc0c97] text-[#be185d]'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
                  )}
                >
                  {option.label}
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
              {filteredStudents.map(({ student, status }) => (
                <li key={student.id} className="space-y-3 p-4">
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
                        {student.studentType === 'trial' && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                            Trial
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Student ID #{student.id.toString().padStart(3, '0')}
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
                        {student.remainingHours}
                      </div>
                      <div className="mt-1 text-[11px] font-medium text-slate-500">
                        {status.isDeactivated
                          ? 'Deactivated'
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
                        <ExpiryCell
                          date={student.accountFeeExpiryDate}
                          meta={status.accountFeeExpiry}
                        />
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="pt-0.5 text-xs font-medium text-slate-500">
                        Mirai Club
                      </dt>
                      <dd>
                        <ExpiryCell
                          date={student.miraiClubExpiryDate}
                          meta={status.miraiClubExpiry}
                        />
                      </dd>
                    </div>
                  </dl>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenStudentDetail(student.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Eye size={16} aria-hidden="true" />
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditStudent(student.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <PencilSimple size={16} aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenRenewal(student.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
                    >
                      <ArrowsClockwise size={16} aria-hidden="true" />
                      Renew
                    </button>
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
                  {filteredStudents.map(({ student, status }) => (
                    <tr
                      key={student.id}
                      className="align-top transition hover:bg-[#fff8fc]"
                    >
                      <td className="px-6 py-5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenStudentDetail(student.id)}
                              className="text-left text-base font-semibold text-slate-900 transition hover:text-[#be185d]"
                            >
                              {student.name}
                            </button>
                            {student.studentType === 'trial' && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                Trial
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-slate-500">
                            Student ID #{student.id.toString().padStart(3, '0')}
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
                        <ExpiryCell
                          date={student.accountFeeExpiryDate}
                          meta={status.accountFeeExpiry}
                        />
                      </td>
                      <td className="px-6 py-5">
                        <ExpiryCell
                          date={student.miraiClubExpiryDate}
                          meta={status.miraiClubExpiry}
                        />
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
                            {student.remainingHours}
                          </div>
                          <div className="text-xs font-medium text-slate-500">
                            {status.isDeactivated
                              ? 'Student deactivated'
                              : status.hoursLow
                              ? 'Immediate action needed'
                              : 'Healthy balance'}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenStudentDetail(student.id)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            <Eye size={16} aria-hidden="true" />
                            Details
                          </button>
                          <button
                            type="button"
                            onClick={() => onEditStudent(student.id)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            <PencilSimple size={16} aria-hidden="true" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenRenewal(student.id)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
                          >
                            <ArrowsClockwise size={16} aria-hidden="true" />
                            Renew
                          </button>
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
