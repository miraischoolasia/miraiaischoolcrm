import { useState } from 'react'
import { ROSTER_LIST_FIELDS, sortFieldOptions, type FieldOption } from '../lib/studentRoster'
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
  salesPeople,
  options = [],
  onChange,
}: {
  setting: StudentFieldsSetting
  form: StudentExtrasForm
  kinds: StudentKind[]
  consultants: Teacher[]
  // Who can be the Sales person (staff, admins and teachers); the consultants when not given.
  salesPeople?: Teacher[]
  // The choices of the roster lists (membership, region ...).
  options?: FieldOption[]
  onChange: (field: keyof StudentExtrasForm, value: string) => void
}) {
  // A hidden kind or a staff member who left stays visible on the students that have them.
  const kindOptions = kinds.filter((kind) => kind.isActive || kind.name === form.studentKind)
  const consultantMissing = form.consultantId !== '' && !consultants.some((entry) => String(entry.id) === form.consultantId)
  const salesPersonId = form.salesPersonId ?? ''
  const salesChoices = salesPeople ?? consultants
  const salesPersonMissing = salesPersonId !== '' && !salesChoices.some((entry) => String(entry.id) === salesPersonId)

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
          <span className="text-sm font-semibold text-slate-700">{setting.sales_person ? 'Learning Consultant' : 'Consultant'}</span>
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
      {setting.sales_person && (
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Sales person (Education Consultant)</span>
          <select value={salesPersonId} onChange={(event) => onChange('salesPersonId', event.target.value)} className={inputClassName}>
            <option value="">Not set</option>
            {salesPersonMissing && <option value={salesPersonId}>Former staff member</option>}
            {salesChoices.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.fullName}
              </option>
            ))}
          </select>
        </label>
      )}
      {ROSTER_LIST_FIELDS.filter((entry) => setting[entry.field]).map((entry) => {
        const current = form[entry.formKey] ?? ''
        // A hidden choice stays visible on the students that have it.
        const choices = sortFieldOptions(options.filter((option) => option.field === entry.field)).filter((option) => option.isActive || option.name === current)
        return (
          <label key={entry.field} className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">{entry.label}</span>
            <select value={current} onChange={(event) => onChange(entry.formKey, event.target.value)} className={inputClassName}>
              <option value="">Not set</option>
              {choices.map((option) => (
                <option key={option.name} value={option.name}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
        )
      })}
      {setting.fb_name && (
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Facebook name</span>
          <input
            type="text"
            value={form.fbName ?? ''}
            maxLength={80}
            onChange={(event) => onChange('fbName', event.target.value)}
            className={inputClassName}
          />
        </label>
      )}
      {setting.fee_month && (
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Fee payment month</span>
          <select value={form.feeMonth ?? ''} onChange={(event) => onChange('feeMonth', event.target.value)} className={inputClassName}>
            <option value="">Not set</option>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
              <option key={month} value={month}>
                {month}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  )
}

// The same fields on the student's profile (only the ones the school shows and the student has).
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type SummaryEntry = { label: string; value: string | null }

// The student's extra fields on the profile (only the ones the school keeps), as in design B: one line with the four
// most used (Learning Consultant, Membership, how they pay, fee month) and "All details" for every field in three
// groups. A field the school keeps but nobody filled in shows "-".
export function StudentExtraSummary({
  setting,
  extras,
  consultantName,
  salesPersonName = null,
}: {
  setting: StudentFieldsSetting
  extras: StudentProfileExtras | undefined
  consultantName: string | null
  salesPersonName?: string | null
}) {
  const [open, setOpen] = useState(false)
  const listValue = (field: (typeof ROSTER_LIST_FIELDS)[number]['formKey']) => extras?.[field] || null
  const label = (field: (typeof ROSTER_LIST_FIELDS)[number]['field']) => ROSTER_LIST_FIELDS.find((entry) => entry.field === field)!.label
  const consultantLabel = setting.sales_person ? 'Learning Consultant' : 'Consultant'
  const consultant: SummaryEntry = {
    label: consultantLabel,
    value: extras?.consultantId ? (consultantName ?? 'Former staff member') : null,
  }
  const feeMonth: SummaryEntry = {
    label: 'Fee payment month',
    value: extras?.feeMonth ? (MONTH_NAMES[extras.feeMonth - 1] ?? String(extras.feeMonth)) : null,
  }

  const identity: SummaryEntry[] = []
  if (setting.name_zh) identity.push({ label: 'Chinese name', value: extras?.nameZh || null })
  if (setting.student_kind) identity.push({ label: 'Kind of student', value: extras?.kind || null })
  if (setting.enrol_method) identity.push({ label: label('enrol_method'), value: listValue('enrolMethod') })
  if (setting.region) identity.push({ label: label('region'), value: listValue('region') })
  if (setting.fb_name) identity.push({ label: 'Facebook name', value: extras?.fbName || null })

  const people: SummaryEntry[] = []
  if (setting.consultant) people.push(consultant)
  if (setting.sales_person) people.push({ label: 'Sales person', value: extras?.salesPersonId ? (salesPersonName ?? 'Former staff member') : null })
  if (setting.second_parent_phone) people.push({ label: 'Second parent phone', value: extras?.secondParentPhone || null })

  const payment: SummaryEntry[] = []
  if (setting.membership) payment.push({ label: label('membership'), value: listValue('membership') })
  if (setting.hero_member) payment.push({ label: label('hero_member'), value: listValue('heroMember') })
  if (setting.payment_mode) payment.push({ label: label('payment_mode'), value: listValue('paymentMode') })
  if (setting.fee_month) payment.push(feeMonth)

  const groups = [
    { title: 'Identity', entries: identity },
    { title: 'People', entries: people },
    { title: 'Payment', entries: payment },
  ].filter((group) => group.entries.length > 0)
  if (groups.length === 0) return null

  const summary: { label: string; value: string | null }[] = []
  if (setting.consultant) summary.push({ label: setting.sales_person ? 'LC' : 'Consultant', value: consultant.value })
  if (setting.membership) summary.push({ label: 'Membership', value: listValue('membership') })
  if (setting.payment_mode) summary.push({ label: 'Pays', value: listValue('paymentMode') })
  if (setting.fee_month) summary.push({ label: 'Fee month', value: feeMonth.value })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        {summary.map((entry) => (
          <span key={entry.label} className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500">{entry.label}</span>
            <span className={entry.value ? 'font-bold text-slate-900' : 'text-slate-400'}>{entry.value ?? '-'}</span>
          </span>
        ))}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="ml-auto text-sm font-semibold text-[#be185d] hover:underline"
        >
          All details {open ? '\u25B4' : '\u25BE'}
        </button>
      </div>
      {open && (
        <div aria-label="Student fields" className="mt-2 grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-3">
          {groups.map((group) => (
            <div key={group.title}>
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{group.title}</h4>
              <dl className="mt-1.5 space-y-1.5 text-sm">
                {group.entries.map((entry) => (
                  <div key={entry.label}>
                    <dt className="text-xs text-slate-500">{entry.label}</dt>
                    <dd className={entry.value ? 'font-semibold text-slate-900' : 'text-slate-400'}>{entry.value ?? '-'}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
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
