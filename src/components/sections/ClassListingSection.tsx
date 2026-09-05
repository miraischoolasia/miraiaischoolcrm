import { useEffect, useState } from 'react'
import { cn } from '../../lib/cn'
import { formatDate, getStudentStatus } from '../../domain/studentStatus'
import { ageGroupOptions } from '../../lib/constants'
import { weekdayLabels } from '../../lib/schedule'
import { ExpiryCell } from '../ExpiryCell'
import { StatusChip } from '../StatusChip'
import mascotGordo from '../../assets/mascot-gordo.png'
import {
  ArrowCounterClockwise,
  CalendarBlank,
  CalendarPlus,
  Clock,
  DotsThreeVertical,
  PencilSimple,
  Plus,
  Trash,
} from '@phosphor-icons/react'
import type {
  AgeGroup,
  ClassStatusSummary,
  Classroom,
  Schedule,
  Student,
  Teacher,
} from '../../types/domain'

type ClassListingSectionProps = {
  classrooms: Classroom[]
  classroomStudentMap: Map<number, Student[]>
  deletingClassroomId: number | null
  restoringClassroomId: number | null
  isAdminView: boolean
  onDeleteClassroom: (classroomId: number) => void
  onEditClassroom: (classroomId: number) => void
  onEditSchedule: (scheduleId: number) => void
  onOpenCreateClassroom?: () => void
  onOpenCreateRegularSchedule?: (classroomId: number) => void
  onOpenStudentDetail: (studentId: number) => void
  onRestoreClassroom: (classroomId: number) => void
  onSelectAgeGroup: (ageGroup: AgeGroup) => void
  schedules: Schedule[]
  selectedAgeGroup: AgeGroup
  selectedClassroomId: number | null
  setSelectedClassroomId: (classroomId: number) => void
  teacherMap: Map<number, Teacher>
  todayString: string
}

export function ClassListingSection({
  classrooms,
  classroomStudentMap,
  deletingClassroomId,
  restoringClassroomId,
  isAdminView,
  onDeleteClassroom,
  onEditClassroom,
  onEditSchedule,
  onOpenCreateClassroom,
  onOpenCreateRegularSchedule,
  onOpenStudentDetail,
  onRestoreClassroom,
  onSelectAgeGroup,
  schedules,
  selectedAgeGroup,
  selectedClassroomId,
  setSelectedClassroomId,
  teacherMap,
  todayString,
}: ClassListingSectionProps) {
  const activeClassrooms = classrooms.filter(
    (classroom) => classroom.status === 'active',
  )
  const archivedClassrooms = classrooms.filter(
    (classroom) => classroom.status === 'archived',
  )
  const filteredClassrooms = activeClassrooms.filter(
    (classroom) => classroom.ageGroup === selectedAgeGroup,
  )
  const selectedClassroom =
    filteredClassrooms.find((classroom) => classroom.id === selectedClassroomId) ??
    filteredClassrooms[0] ??
    null

  const getClassSummary = (classroomId: number): ClassStatusSummary => {
    const roster = classroomStudentMap.get(classroomId) ?? []
    return roster.reduce<ClassStatusSummary>(
      (summary, student) => {
        const status = getStudentStatus(student, todayString)

        if (status.isDeactivated || status.hoursLow || status.lessonExpired) {
          summary.attention += 1
        } else {
          summary.healthy += 1
        }
        return summary
      },
      { healthy: 0, attention: 0 },
    )
  }

  const [activeDetailTab, setActiveDetailTab] = useState<
    'overview' | 'students' | 'timetable'
  >('overview')
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)

  useEffect(() => {
    setActiveDetailTab('overview')
    setActionsMenuOpen(false)
  }, [selectedClassroom?.id])

  const selectedRoster = selectedClassroom
    ? (classroomStudentMap.get(selectedClassroom.id) ?? [])
        .slice()
        .sort((left, right) => {
          if (left.isActive !== right.isActive) {
            return left.isActive ? -1 : 1
          }
          return left.name.localeCompare(right.name)
        })
    : []

  const selectedSchedules = selectedClassroom
    ? schedules
        .filter(
          (schedule) =>
            schedule.eventType === 'regular' &&
            schedule.status === 'active' &&
            schedule.classroomId === selectedClassroom.id,
        )
        .sort((left, right) => {
          const leftDay = left.dayOfWeek ?? 0
          const rightDay = right.dayOfWeek ?? 0
          if (leftDay !== rightDay) {
            return leftDay - rightDay
          }
          return left.startTime.localeCompare(right.startTime)
        })
    : []

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">My Classroom</h2>
              <p className="mt-1 text-sm text-slate-500">
                {isAdminView
                  ? 'Browse classrooms by age group, then open each class roster and timetable.'
                  : 'Browse assigned classrooms by age group, then open the class roster quickly.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm text-slate-500">
                {activeClassrooms.length} classroom
                {activeClassrooms.length === 1 ? '' : 's'}
              </div>
              {isAdminView && onOpenCreateClassroom && (
                <button
                  type="button"
                  onClick={onOpenCreateClassroom}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
                >
                  <Plus size={16} weight="bold" aria-hidden="true" />
                  Add Classroom
                </button>
              )}
            </div>
          </div>
        </div>

        {activeClassrooms.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">
            No active classroom found yet. Create the first classroom, then add weekly schedules inside it.
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div className="space-y-3 border-b border-slate-200 pb-3">
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Age Group
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {ageGroupOptions.map((ageGroup) => {
                    const selected = selectedAgeGroup === ageGroup
                    const count = activeClassrooms.filter(
                      (classroom) => classroom.ageGroup === ageGroup,
                    ).length

                    return (
                      <button
                        key={ageGroup}
                        type="button"
                        onClick={() => onSelectAgeGroup(ageGroup)}
                        className={cn(
                          'inline-flex items-center gap-1.5 border-b-2 pb-1.5 text-left text-xs font-semibold transition',
                          selected
                            ? 'border-[#fc0c97] text-[#be185d]'
                            : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
                        )}
                      >
                        <span>{ageGroup}</span>
                        <span className="text-xs font-medium text-slate-400">
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900">Classroom List</h3>
                  <span className="text-xs font-medium text-slate-400">
                    {filteredClassrooms.length} result
                    {filteredClassrooms.length === 1 ? '' : 's'}
                  </span>
                </div>

                {filteredClassrooms.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                    <img src={mascotGordo} alt="" aria-hidden="true" className="h-20 w-auto" />
                    <p className="text-sm text-slate-500">
                      No classroom in this category yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredClassrooms.map((classroom) => {
                      const summary = getClassSummary(classroom.id)
                      const roster = classroomStudentMap.get(classroom.id) ?? []
                      const selected = selectedClassroom?.id === classroom.id
                      return (
                        <button
                          key={classroom.id}
                          type="button"
                          onClick={() => setSelectedClassroomId(classroom.id)}
                          className={cn(
                            'w-full rounded-2xl border px-4 py-3.5 text-left transition',
                            selected
                              ? 'border-[#fc0c97] bg-[#fff0f9]'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                          )}
                        >
                          <div className="text-base font-semibold text-slate-900">
                            {classroom.name}
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            {teacherMap.get(classroom.teacherId ?? -1)?.fullName ??
                              'Unassigned teacher'}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-500">
                              {roster.length} student{roster.length === 1 ? '' : 's'}
                            </span>
                            <StatusChip
                              label={
                                summary.attention === 0
                                  ? 'Healthy'
                                  : `${summary.attention} Need Attention`
                              }
                              tone={summary.attention === 0 ? 'healthy' : 'critical'}
                            />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {selectedClassroom && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-2xl font-semibold text-slate-900">
                        {selectedClassroom.name}
                      </h3>
                      <div className="mt-1 text-sm text-slate-500">
                        Teacher:{' '}
                        {teacherMap.get(selectedClassroom.teacherId ?? -1)?.fullName ??
                          'Unassigned'}
                        {' • '}
                        {selectedClassroom.ageGroup}
                        {' • '}
                        {selectedClassroom.programLevel}
                      </div>
                      {selectedClassroom.notes && (
                        <p className="mt-3 max-w-3xl text-sm text-slate-500">
                          {selectedClassroom.notes}
                        </p>
                      )}
                    </div>

                    {isAdminView && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onEditClassroom(selectedClassroom.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <PencilSimple size={16} aria-hidden="true" />
                          Edit Classroom
                        </button>
                        {onOpenCreateRegularSchedule && (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenCreateRegularSchedule(selectedClassroom.id)
                            }
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
                          >
                            <CalendarPlus size={16} aria-hidden="true" />
                            Add Weekly Timetable
                          </button>
                        )}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setActionsMenuOpen((open) => !open)}
                            aria-label="More classroom actions"
                            className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                          >
                            <DotsThreeVertical size={18} weight="bold" aria-hidden="true" />
                          </button>
                          {actionsMenuOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setActionsMenuOpen(false)}
                              />
                              <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                                <button
                                  type="button"
                                  disabled={deletingClassroomId === selectedClassroom.id}
                                  onClick={() => {
                                    setActionsMenuOpen(false)
                                    onDeleteClassroom(selectedClassroom.id)
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <Trash size={16} aria-hidden="true" />
                                  {deletingClassroomId === selectedClassroom.id
                                    ? 'Deleting...'
                                    : 'Delete Classroom'}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedSchedules.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {selectedSchedules.map((schedule) => (
                        <div
                          key={schedule.id}
                          className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-[#fbcfe8] bg-[#fff0f9] px-4 py-3"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#be185d]">
                              <CalendarBlank size={16} weight="bold" aria-hidden="true" />
                            </span>
                            <div>
                              <div className="text-[11px] font-medium text-[#be185d]/70">
                                Weekly timetable
                              </div>
                              <div className="text-sm font-semibold text-[#be185d]">
                                Every {weekdayLabels[schedule.dayOfWeek ?? 0]}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#be185d]">
                              <Clock size={16} weight="bold" aria-hidden="true" />
                            </span>
                            <div>
                              <div className="text-[11px] font-medium text-[#be185d]/70">
                                Class time
                              </div>
                              <div className="text-sm font-semibold text-[#be185d]">
                                {schedule.startTime} - {schedule.endTime}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#be185d]">
                              <CalendarBlank size={16} weight="bold" aria-hidden="true" />
                            </span>
                            <div>
                              <div className="text-[11px] font-medium text-[#be185d]/70">
                                Term dates
                              </div>
                              <div className="text-sm font-semibold text-[#be185d]">
                                {schedule.startRecur ? formatDate(schedule.startRecur) : '—'}
                                {schedule.endRecur ? ` - ${formatDate(schedule.endRecur)}` : ''}
                              </div>
                            </div>
                          </div>
                          {isAdminView && (
                            <button
                              type="button"
                              onClick={() => onEditSchedule(schedule.id)}
                              className="ml-auto inline-flex items-center gap-1 rounded-xl border border-white bg-white/60 px-3 py-1.5 text-xs font-semibold text-[#be185d] transition hover:bg-white"
                            >
                              <PencilSimple size={14} aria-hidden="true" />
                              Edit
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-5 flex items-center gap-5 border-b border-slate-200">
                    {(
                      [
                        { key: 'overview' as const, label: 'Overview', count: null },
                        {
                          key: 'students' as const,
                          label: 'Students',
                          count: selectedRoster.length,
                        },
                        {
                          key: 'timetable' as const,
                          label: 'Timetable',
                          count: selectedSchedules.length,
                        },
                      ]
                    ).map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveDetailTab(tab.key)}
                        className={cn(
                          'flex items-center gap-1.5 border-b-2 pb-2.5 text-sm font-semibold transition',
                          activeDetailTab === tab.key
                            ? 'border-[#fc0c97] text-[#be185d]'
                            : 'border-transparent text-slate-500 hover:text-slate-700',
                        )}
                      >
                        {tab.label}
                        {tab.count !== null && (
                          <span className="text-xs font-medium text-slate-400">
                            {tab.count}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {activeDetailTab === 'overview' &&
                    (selectedRoster.length === 0 ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                        No students assigned to this classroom yet.
                      </div>
                    ) : (
                      <div className="mt-4">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Student Roster
                        </div>
                        <div className="overflow-x-auto">
                          <table
                            data-compact-table
                            className="min-w-[760px] divide-y divide-slate-200"
                          >
                            <thead>
                              <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                <th className="py-3 pr-4">Student</th>
                                <th className="py-3 pr-4">Classes</th>
                                <th className="py-3 pr-4">Lesson Expiry</th>
                                <th className="py-3 pr-4">Account Fee Expiry</th>
                                <th className="py-3 pr-4">Mirai Club Expiry</th>
                                <th className="py-3 pr-4">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {selectedRoster.map((student) => {
                                const status = getStudentStatus(student, todayString)
                                return (
                                  <tr key={student.id} className="align-top">
                                    <td className="py-3 pr-4">
                                      <button
                                        type="button"
                                        onClick={() => onOpenStudentDetail(student.id)}
                                        className="text-left text-sm font-semibold text-slate-900 transition hover:text-[#be185d]"
                                      >
                                        {student.name}
                                      </button>
                                      {!student.isActive && (
                                        <div className="mt-1 text-xs font-semibold text-red-600">
                                          Deactivated
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-3 pr-4 text-sm text-slate-700">
                                      {student.remainingHours}
                                    </td>
                                    <td className="py-3 pr-4">
                                      <ExpiryCell
                                        date={student.lessonExpiryDate}
                                        meta={status.lessonExpiry}
                                      />
                                    </td>
                                    <td className="py-3 pr-4">
                                      <ExpiryCell
                                        date={student.accountFeeExpiryDate}
                                        meta={status.accountFeeExpiry}
                                      />
                                    </td>
                                    <td className="py-3 pr-4">
                                      <ExpiryCell
                                        date={student.miraiClubExpiryDate}
                                        meta={status.miraiClubExpiry}
                                      />
                                    </td>
                                    <td className="py-3 pr-4">
                                      <StatusChip
                                        label={status.isNormal ? 'Normal' : status.tags[0].label}
                                        tone={status.isNormal ? 'healthy' : 'critical'}
                                      />
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}

                  {activeDetailTab === 'students' && (
                    <div className="mt-4 space-y-1">
                      {selectedRoster.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                          No students assigned to this classroom yet.
                        </div>
                      ) : (
                        selectedRoster.map((student) => {
                          const status = getStudentStatus(student, todayString)
                          return (
                            <div
                              key={student.id}
                              className="border-b border-slate-200 py-3 last:border-b-0"
                            >
                              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <button
                                    type="button"
                                    onClick={() => onOpenStudentDetail(student.id)}
                                    className="text-left text-base font-semibold text-slate-900 transition hover:text-[#be185d]"
                                  >
                                    {student.name}
                                  </button>
                                  <div className="mt-1 text-xs text-slate-500">
                                    Classes: {student.remainingHours} - Lesson Expiry:{' '}
                                    {formatDate(student.lessonExpiryDate)}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    Account Fee: {formatDate(student.accountFeeExpiryDate)} - Mirai Club:{' '}
                                    {formatDate(student.miraiClubExpiryDate)}
                                  </div>
                                  {!student.isActive && (
                                    <div className="mt-2 text-sm font-semibold text-red-600">
                                      Deactivated student
                                    </div>
                                  )}
                                </div>
                                <div className="flex max-w-[320px] flex-wrap gap-2">
                                  {status.tags.map((tag) => (
                                    <StatusChip
                                      key={`${selectedClassroom.id}-${student.id}-${tag.label}`}
                                      label={tag.label}
                                      tone={tag.tone}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}

                  {activeDetailTab === 'timetable' && (
                    <div className="mt-4 space-y-3">
                      {selectedSchedules.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                          No weekly timetable set yet.
                        </div>
                      ) : (
                        selectedSchedules.map((schedule) => (
                          <div
                            key={schedule.id}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-slate-900">
                                  {weekdayLabels[schedule.dayOfWeek ?? 0]}
                                </div>
                                <div className="mt-1 text-sm text-slate-500">
                                  {schedule.startTime} - {schedule.endTime}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  Start: {schedule.startRecur ? formatDate(schedule.startRecur) : '-'}
                                  {schedule.endRecur
                                    ? ` • End: ${formatDate(schedule.endRecur)}`
                                    : ''}
                                </div>
                              </div>
                              {isAdminView && (
                                <button
                                  type="button"
                                  onClick={() => onEditSchedule(schedule.id)}
                                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                >
                                  <PencilSimple size={14} aria-hidden="true" />
                                  Edit
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {isAdminView && (
          <div className="border-t border-slate-200 bg-slate-50 px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Classroom Archive
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Archived classrooms are removed from active views while their details and student links remain stored.
                </p>
              </div>
              <span className="text-sm font-semibold text-slate-500">
                {archivedClassrooms.length}
              </span>
            </div>

            {archivedClassrooms.length === 0 ? (
              <div className="mt-3 border-t border-slate-200 pt-4 text-sm text-slate-500">
                No archived classrooms.
              </div>
            ) : (
            <div className="mt-3 divide-y divide-slate-200 border-t border-slate-200">
                {archivedClassrooms.map((classroom) => {
                  const roster = classroomStudentMap.get(classroom.id) ?? []
                  return (
                    <div
                      key={classroom.id}
                      className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">{classroom.name}</div>
                        <div className="mt-1 text-sm text-slate-500">
                          {classroom.ageGroup} / {classroom.programLevel} /{' '}
                          {teacherMap.get(classroom.teacherId ?? -1)?.fullName ?? 'Unassigned'}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {roster.length} linked student{roster.length === 1 ? '' : 's'}
                          {classroom.archivedAt
                            ? ` / Archived ${new Date(classroom.archivedAt).toLocaleString('en-MY')}`
                            : ''}
                        </div>
                        {classroom.notes && (
                          <div className="mt-2 text-sm text-slate-500">{classroom.notes}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={restoringClassroomId === classroom.id}
                        onClick={() => onRestoreClassroom(classroom.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <ArrowCounterClockwise size={16} aria-hidden="true" />
                        {restoringClassroomId === classroom.id ? 'Restoring...' : 'Restore'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
