import { useState } from 'react'
import { cn } from '../../lib/cn'
import { SummaryBar } from '../SummaryBar'
import mascotGordo from '../../assets/mascot-gordo.png'
import type { Teacher } from '../../types/domain'
import {
  LockSimple,
  MagnifyingGlass,
  PencilSimple,
  Trash,
  UserPlus,
} from '@phosphor-icons/react'

type TeacherManagementSectionProps = {
  deletingTeacherId: number | null
  isLoading: boolean
  teachers: Teacher[]
  onDeleteTeacher: (teacherId: number) => void
  onEditTeacher: (teacherId: number) => void
  onOpenCreateTeacher: () => void
  protectedTeacherIds: Set<number>
}

export function TeacherManagementSection({
  deletingTeacherId,
  isLoading,
  teachers,
  onDeleteTeacher,
  onEditTeacher,
  onOpenCreateTeacher,
  protectedTeacherIds,
}: TeacherManagementSectionProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredTeachers = normalizedSearch
    ? teachers.filter(
        (teacher) =>
          teacher.fullName.toLowerCase().includes(normalizedSearch) ||
          teacher.username.toLowerCase().includes(normalizedSearch),
      )
    : teachers

  return (
    <div className="space-y-4">
      <SummaryBar
        metrics={[
          {
            label: 'Total Teachers',
            value: teachers.filter((teacher) => teacher.role === 'teacher').length,
          },
          {
            label: 'Admin Accounts',
            value: teachers.filter((teacher) => teacher.role === 'admin').length,
            tone: 'brand',
          },
          {
            label: 'Teacher Accounts',
            value: teachers.filter((teacher) => teacher.role === 'teacher').length,
            tone: 'blue',
          },
          {
            label: 'With Contact Info',
            value: teachers.filter(
              (teacher) => Boolean(teacher.email) || Boolean(teacher.phone),
            ).length,
            tone: 'green',
          },
        ]}
      />

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-[#f8fafc] px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">My Teacher</h2>
              <p className="mt-1 text-sm text-slate-500">
                Review teacher basic information and add new teacher records.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenCreateTeacher}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
            >
              <UserPlus size={16} weight="bold" aria-hidden="true" />
              Add Teacher
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
              placeholder="Search teachers by name or username..."
              className="w-full max-w-xs rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#fc0c97] focus:outline-none"
            />
          </div>
        </div>

        {!isLoading && filteredTeachers.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <img src={mascotGordo} alt="" aria-hidden="true" className="h-24 w-auto" />
            <p className="text-sm text-slate-500">
              {teachers.length === 0
                ? 'No teachers found yet.'
                : 'No teachers match this search.'}
            </p>
          </div>
        )}

        {filteredTeachers.length > 0 && (
          <>
            <ul className="divide-y divide-slate-200 md:hidden">
              {filteredTeachers.map((teacher) => (
                <li key={teacher.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {teacher.fullName}
                      </div>
                      <div className="text-xs text-slate-500">
                        Teacher ID #{String(teacher.id).padStart(3, '0')} ·{' '}
                        {teacher.username}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                        teacher.role === 'admin'
                          ? 'bg-[#fff1f8] text-[#be185d]'
                          : 'bg-sky-50 text-sky-700',
                      )}
                    >
                      {teacher.role === 'admin' ? 'Admin' : 'Teacher'}
                    </span>
                  </div>

                  <dl className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-xs font-medium text-slate-500">Email</dt>
                      <dd className="text-slate-700">{teacher.email || '-'}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-xs font-medium text-slate-500">Phone</dt>
                      <dd className="text-slate-700">{teacher.phone || '-'}</dd>
                    </div>
                  </dl>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onEditTeacher(teacher.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <PencilSimple size={16} aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={
                        protectedTeacherIds.has(teacher.id) ||
                        deletingTeacherId === teacher.id
                      }
                      onClick={() => onDeleteTeacher(teacher.id)}
                      className={cn(
                        'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition',
                        protectedTeacherIds.has(teacher.id)
                          ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                          : 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
                      )}
                    >
                      {protectedTeacherIds.has(teacher.id) ? (
                        <LockSimple size={16} aria-hidden="true" />
                      ) : (
                        <Trash size={16} aria-hidden="true" />
                      )}
                      {protectedTeacherIds.has(teacher.id)
                        ? 'Protected'
                        : deletingTeacherId === teacher.id
                          ? 'Deleting...'
                          : 'Delete'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table data-compact-table className="min-w-full divide-y divide-slate-200 text-left">
                <thead className="bg-white text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Teacher</th>
                    <th className="px-6 py-4">Username</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Phone</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredTeachers.map((teacher) => (
                    <tr key={teacher.id} className="align-top">
                      <td className="px-6 py-5">
                        <div className="font-semibold text-slate-900">
                          {teacher.fullName}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          Teacher ID #{String(teacher.id).padStart(3, '0')}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-sm font-medium text-slate-700">
                        {teacher.username}
                      </td>
                      <td className="px-6 py-5">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                            teacher.role === 'admin'
                              ? 'bg-[#fff1f8] text-[#be185d]'
                              : 'bg-sky-50 text-sky-700',
                          )}
                        >
                          {teacher.role === 'admin' ? 'Admin' : 'Teacher'}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-sm text-slate-600">
                        {teacher.email || '-'}
                      </td>
                      <td className="px-6 py-5 text-sm text-slate-600">
                        {teacher.phone || '-'}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onEditTeacher(teacher.id)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            <PencilSimple size={16} aria-hidden="true" />
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={
                              protectedTeacherIds.has(teacher.id) ||
                              deletingTeacherId === teacher.id
                            }
                            onClick={() => onDeleteTeacher(teacher.id)}
                            className={cn(
                              'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition',
                              protectedTeacherIds.has(teacher.id)
                                ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                                : 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
                            )}
                          >
                            {protectedTeacherIds.has(teacher.id) ? (
                              <LockSimple size={16} aria-hidden="true" />
                            ) : (
                              <Trash size={16} aria-hidden="true" />
                            )}
                            {protectedTeacherIds.has(teacher.id)
                              ? 'Protected'
                              : deletingTeacherId === teacher.id
                                ? 'Deleting...'
                                : 'Delete'}
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
