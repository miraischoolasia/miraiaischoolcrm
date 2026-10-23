import { useMemo } from 'react'
import { arrangeColumns, type RosterColumnPref } from '../../lib/rosterColumnPrefs'
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

// The 16 columns of the master list, in its order, with the student's name first (it stays on screen while the rest scrolls). Number of subjects, stopped and added are worked out from the class
// history; the rest are the student's own values.
export const ROSTER_COLUMNS: Column[] = [
  { key: 'name', header: 'STUDENT NAME', shown: always, value: (row) => row.student.name },
  { key: 'sales', header: 'SALES PERSON', shown: (s) => s.sales_person, value: (row, c) => teacherName(c, c.extras.get(row.student.id)?.salesPersonId) },
  { key: 'consultant', header: '处理报名的顾问', shown: (s) => s.consultant, value: (row, c) => teacherName(c, c.extras.get(row.student.id)?.consultantId) },
  { key: 'code', header: 'SYSTEM CODE', shown: always, value: (row, c) => c.codes?.get(row.student.id) ?? null },
  { key: 'membership', header: 'PRICE', shown: (s) => s.membership, value: (row, c) => c.extras.get(row.student.id)?.membership ?? null },
  { key: 'kind', header: '种类', shown: (s) => s.student_kind, value: (row, c) => c.extras.get(row.student.id)?.kind ?? null },
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

// The columns the school keeps (its field switches), in the usual order.
export function schoolRosterColumns(setting: StudentFieldsSetting) {
  return ROSTER_COLUMNS.filter((column) => column.shown(setting))
}

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
  columnPref,
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
  // This person's own choice of columns (which, and in what order).
  columnPref: RosterColumnPref
  onOpenStudent: (studentId: number) => void
}) {
  const classroomById = useMemo(() => new Map(classrooms.map((classroom) => [classroom.id, classroom])), [classrooms])
  const context: Context = { extras, teacherMap, codes: studentCodes, classrooms: classroomById, categories, counts, today: todayString }
  const columns = arrangeColumns(schoolRosterColumns(setting), columnPref)

  // A click anywhere on a row opens the student, except on its own buttons.
  function openFromRow(event: React.MouseEvent, studentId: number) {
    if ((event.target as HTMLElement).closest('button, a, input, select, textarea')) {
      return
    }
    onOpenStudent(studentId)
  }

  // The table scrolls inside its own box, as high as the window allows: the sideways scroll bar sits at the bottom of the
  // box (always in view), the headings stay on top and the name stays on the left.
  return (
    <div className="max-h-[calc(100dvh-18rem)] overflow-auto md:max-h-[calc(100dvh-13rem)] border-t border-slate-200">
      <table data-compact-table aria-label="Roster table" className="min-w-max border-separate border-spacing-0">
        <thead>
          <tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
            {columns.map((column, index) => (
              <th
                key={column.key}
                className={cn(
                  'sticky top-0 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-3',
                  index === 0 ? 'left-0 z-30' : 'z-20',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.student.id}
              onClick={(event) => openFromRow(event, row.student.id)}
              className={cn('group cursor-pointer', !row.student.isActive && 'opacity-60')}
            >
              {columns.map((column, index) => {
                const value = column.value(row, context)
                const empty = value === null || value === undefined || value === ''
                return (
                  <td
                    key={column.key}
                    className={cn(
                      'whitespace-nowrap border-b border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 group-hover:bg-[#fff8fc]',
                      index === 0 && 'sticky left-0 z-10',
                    )}
                  >
                    {column.key === 'name' ? (
                      <button type="button" onClick={() => onOpenStudent(row.student.id)} className="font-semibold text-slate-900 hover:text-[#be185d]">
                        {value}
                      </button>
                    ) : empty ? (
                      <span className="text-slate-400">-</span>
                    ) : (
                      value
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
