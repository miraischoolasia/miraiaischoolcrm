import { useMemo } from 'react'
import { cn } from '../../lib/cn'
import type { ClassCategory } from '../../lib/classCategories'
import type { StudentRow } from '../../lib/studentRows'
import type { StudentFieldsSetting, StudentProfileExtras } from '../../lib/studentFields'
import { subjectCounts, type RosterCounts } from '../../lib/studentRoster'
import type { Classroom, Teacher } from '../../types/domain'

type Column = {
  key: string
  // The heading, as in the school's master list.
  header: string
  // Hidden when the school does not keep this field.
  shown: (setting: StudentFieldsSetting) => boolean
  value: (row: StudentRow, context: Context) => string | number | null
}

type Context = {
  extras: Map<number, StudentProfileExtras>
  teacherMap: Map<number, Teacher>
  codes: Map<number, string> | undefined
  classrooms: Map<number, Classroom>
  categories: ClassCategory[]
  counts: RosterCounts
  today: string
}

const always = () => true
const teacherName = (context: Context, id: number | null | undefined) => (id ? (context.teacherMap.get(id)?.fullName ?? 'Former staff member') : null)

// The 16 columns of the master list, in its order. Number of subjects, stopped and added are worked out from the class
// history; the rest are the student's own values.
export const ROSTER_COLUMNS: Column[] = [
  { key: 'sales', header: 'SALES PERSON', shown: (s) => s.sales_person, value: (row, c) => teacherName(c, c.extras.get(row.student.id)?.salesPersonId) },
  { key: 'consultant', header: '处理报名的顾问', shown: (s) => s.consultant, value: (row, c) => teacherName(c, c.extras.get(row.student.id)?.consultantId) },
  { key: 'code', header: 'SYSTEM CODE', shown: always, value: (row, c) => c.codes?.get(row.student.id) ?? null },
  { key: 'membership', header: 'PRICE', shown: (s) => s.membership, value: (row, c) => c.extras.get(row.student.id)?.membership ?? null },
  { key: 'kind', header: '种类', shown: (s) => s.student_kind, value: (row, c) => c.extras.get(row.student.id)?.kind ?? null },
  { key: 'name', header: 'STUDENT NAME', shown: always, value: (row) => row.student.name },
  // The list asks for the number without dashes.
  { key: 'phone', header: 'PHONE', shown: always, value: (row) => row.student.phone?.replace(/[^\d+]/g, '') || null },
  { key: 'fb', header: 'FB NAME', shown: (s) => s.fb_name, value: (row, c) => c.extras.get(row.student.id)?.fbName ?? null },
  { key: 'region', header: '西马/东马', shown: (s) => s.region, value: (row, c) => c.extras.get(row.student.id)?.region ?? null },
  { key: 'enrol', header: '报名方式', shown: (s) => s.enrol_method, value: (row, c) => c.extras.get(row.student.id)?.enrolMethod ?? null },
  { key: 'payment', header: '分期/一次性付款', shown: (s) => s.payment_mode, value: (row, c) => c.extras.get(row.student.id)?.paymentMode ?? null },
  { key: 'hero', header: '英雄会员', shown: (s) => s.hero_member, value: (row, c) => c.extras.get(row.student.id)?.heroMember ?? null },
  { key: 'feeMonth', header: '手续费支付月份', shown: (s) => s.fee_month, value: (row, c) => c.extras.get(row.student.id)?.feeMonth ?? null },
  { key: 'subjects', header: '科数', shown: always, value: (row, c) => subjectCounts(row.student, c.classrooms, c.categories, c.counts, c.today).subjects },
  { key: 'stopped', header: '停科', shown: always, value: (row, c) => subjectCounts(row.student, c.classrooms, c.categories, c.counts, c.today).stopped },
  { key: 'added', header: '加科', shown: always, value: (row, c) => subjectCounts(row.student, c.classrooms, c.categories, c.counts, c.today).added },
]

// The Students page as the school's master list: one row per student with the master list's columns.
export function StudentRosterTable({
  rows,
  setting,
  extras,
  teacherMap,
  studentCodes,
  classrooms,
  categories,
  counts,
  todayString,
  onOpenStudent,
}: {
  rows: StudentRow[]
  setting: StudentFieldsSetting
  extras: Map<number, StudentProfileExtras>
  teacherMap: Map<number, Teacher>
  studentCodes: Map<number, string> | undefined
  classrooms: Classroom[]
  categories: ClassCategory[]
  counts: RosterCounts
  todayString: string
  onOpenStudent: (studentId: number) => void
}) {
  const classroomById = useMemo(() => new Map(classrooms.map((classroom) => [classroom.id, classroom])), [classrooms])
  const context: Context = { extras, teacherMap, codes: studentCodes, classrooms: classroomById, categories, counts, today: todayString }
  const columns = ROSTER_COLUMNS.filter((column) => column.shown(setting))

  return (
    <div className="overflow-x-auto border-t border-slate-200">
      <table data-compact-table aria-label="Roster table" className="min-w-max divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
            {columns.map((column) => (
              <th key={column.key} className="whitespace-nowrap px-3 py-3">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((row) => (
            <tr key={row.student.id} className={cn('hover:bg-[#fff8fc]', !row.student.isActive && 'opacity-60')}>
              {columns.map((column) => {
                const value = column.value(row, context)
                return (
                  <td key={column.key} className="whitespace-nowrap px-3 py-2 text-sm text-slate-700">
                    {column.key === 'name' ? (
                      <button type="button" onClick={() => onOpenStudent(row.student.id)} className="font-semibold text-slate-900 hover:text-[#be185d]">
                        {value}
                      </button>
                    ) : (
                      (value ?? '')
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
