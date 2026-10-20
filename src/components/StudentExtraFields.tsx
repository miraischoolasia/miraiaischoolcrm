import {
  NOT_SET,
  type StudentExtrasFilter,
  type StudentExtrasForm,
  type StudentFieldsSetting,
  type StudentKind,
  type StudentProfileExtras,
} from '../lib/studentFields'
import type { Teacher } from '../types/domain'

const inputClassName =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]'

// The school's extra student fields in the Edit and New Student forms (only the ones it shows).
export function StudentExtraInputs({
  setting,
  form,
  kinds,
  consultants,
  onChange,
}: {
  setting: StudentFieldsSetting
  form: StudentExtrasForm
  kinds: StudentKind[]
  consultants: Teacher[]
  onChange: (field: keyof StudentExtrasForm, value: string) => void
}) {
  // A hidden kind or a staff member who left stays visible on the students that have them.
  const kindOptions = kinds.filter((kind) => kind.isActive || kind.name === form.studentKind)
  const consultantMissing = form.consultantId !== '' && !consultants.some((entry) => String(entry.id) === form.consultantId)

  return (
    <>
      {setting.name_zh && (
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Chinese name</span>
          <input
            type="text"
            value={form.nameZh}
            maxLength={60}
            placeholder="e.g. 李小明"
            onChange={(event) => onChange('nameZh', event.target.value)}
            className={inputClassName}
          />
        </label>
      )}
      {setting.student_kind && (
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Kind of student</span>
          <select value={form.studentKind} onChange={(event) => onChange('studentKind', event.target.value)} className={inputClassName}>
            <option value="">Not set</option>
            {kindOptions.map((kind) => (
              <option key={kind.name} value={kind.name}>
                {kind.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {setting.consultant && (
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Consultant</span>
          <select value={form.consultantId} onChange={(event) => onChange('consultantId', event.target.value)} className={inputClassName}>
            <option value="">Not set</option>
            {consultantMissing && <option value={form.consultantId}>Former staff member</option>}
            {consultants.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.fullName}
              </option>
            ))}
          </select>
        </label>
      )}
      {setting.second_parent_phone && (
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Second parent phone</span>
          <input
            type="tel"
            value={form.secondParentPhone}
            maxLength={30}
            placeholder="e.g. 012-345 6789"
            onChange={(event) => onChange('secondParentPhone', event.target.value)}
            className={inputClassName}
          />
        </label>
      )}
    </>
  )
}

// The same fields on the student's profile (only the ones the school shows and the student has).
export function StudentExtraSummary({
  setting,
  extras,
  consultantName,
}: {
  setting: StudentFieldsSetting
  extras: StudentProfileExtras | undefined
  consultantName: string | null
}) {
  const rows: [string, string][] = []
  if (setting.name_zh && extras?.nameZh) rows.push(['Chinese name', extras.nameZh])
  if (setting.student_kind && extras?.kind) rows.push(['Kind of student', extras.kind])
  if (setting.consultant && extras?.consultantId) rows.push(['Consultant', consultantName ?? 'Former staff member'])
  if (setting.second_parent_phone && extras?.secondParentPhone) rows.push(['Second parent phone', extras.secondParentPhone])
  if (rows.length === 0) return null

  return (
    <dl aria-label="Student fields" className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-2">
          <dt className="text-slate-500">{label}:</dt>
          <dd className="font-medium text-slate-800">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

// The student list filters for kind and consultant (only the ones the school shows).
export function StudentExtrasFilters({
  setting,
  filter,
  kinds,
  consultants,
  onChange,
}: {
  setting: StudentFieldsSetting
  filter: StudentExtrasFilter
  kinds: StudentKind[]
  consultants: Teacher[]
  onChange: (filter: StudentExtrasFilter) => void
}) {
  if (!setting.student_kind && !setting.consultant) return null
  const selectClassName = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700'

  return (
    <>
      {setting.student_kind && (
        <select
          aria-label="Filter by kind of student"
          value={filter.kind}
          onChange={(event) => onChange({ ...filter, kind: event.target.value })}
          className={selectClassName}
        >
          <option value="">All kinds</option>
          {kinds.map((kind) => (
            <option key={kind.name} value={kind.name}>
              {kind.name}
            </option>
          ))}
          <option value={NOT_SET}>Kind not set</option>
        </select>
      )}
      {setting.consultant && (
        <select
          aria-label="Filter by consultant"
          value={filter.consultantId}
          onChange={(event) => onChange({ ...filter, consultantId: event.target.value })}
          className={selectClassName}
        >
          <option value="">All consultants</option>
          {consultants.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.fullName}
            </option>
          ))}
          <option value={NOT_SET}>No consultant</option>
        </select>
      )}
    </>
  )
}
