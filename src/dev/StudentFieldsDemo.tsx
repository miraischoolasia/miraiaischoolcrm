import { useMemo, useState } from 'react'
import { StudentFieldsSettings, type StudentFieldsApi } from '../components/StudentFieldsSettings'
import { StudentExtraInputs, StudentExtraSummary, StudentExtrasFilters } from '../components/StudentExtraFields'
import {
  consultantOptions,
  extrasChanges,
  extrasToForm,
  matchesExtrasFilter,
  NO_EXTRAS_FILTER,
  NO_STUDENT_FIELDS,
  type StudentKind,
  type StudentProfileExtras,
} from '../lib/studentFields'
import type { Teacher } from '../types/domain'

// Only the dev server shows this (/?demo=studentfields): Class Settings > Student fields, the
// fields in the Edit Student form, on the profile and as list filters, on made-up students
// (saving into the page only, no network).

const team = [
  { id: 1, fullName: 'Teacher Tan', role: 'teacher', isActive: true },
  { id: 2, fullName: 'Crystal', role: 'staff', isActive: true },
  { id: 3, fullName: 'Ms Eunice', role: 'staff', isActive: true },
] as Teacher[]
const consultants = consultantOptions(team)

let kindsStore: StudentKind[] = [
  { name: '新生', sortOrder: 10, isActive: true },
  { name: '续报', sortOrder: 20, isActive: true },
  { name: '回流生', sortOrder: 30, isActive: true },
]
const api: StudentFieldsApi = {
  setFields: async () => null,
  fetchKinds: async () => kindsStore,
  saveKind: async (current, changes) => {
    if (!current) kindsStore = [...kindsStore, { name: changes.name!, sortOrder: 40, isActive: true }]
    else kindsStore = kindsStore.map((kind) => (kind.name === current.name ? { ...kind, ...changes } : kind))
    return null
  },
}

const students = ['Ali', 'Siti', 'Mei', 'Kumar'].map((name, index) => ({ id: index + 1, name }))

export function StudentFieldsDemo() {
  const [setting, setSetting] = useState(NO_STUDENT_FIELDS)
  const [kinds, setKinds] = useState(kindsStore)
  const [extras, setExtras] = useState(
    new Map<number, StudentProfileExtras>([
      [1, { nameZh: '阿里', kind: '新生', consultantId: 2, secondParentPhone: null }],
      [2, { nameZh: null, kind: '续报', consultantId: 3, secondParentPhone: '0198765432' }],
    ]),
  )
  const [filter, setFilter] = useState(NO_EXTRAS_FILTER)
  const [editing, setEditing] = useState(1)
  const [form, setForm] = useState(extrasToForm(extras.get(1)))
  const [message, setMessage] = useState<string | null>(null)

  const shown = useMemo(() => students.filter((student) => matchesExtrasFilter(extras.get(student.id), filter)), [extras, filter])

  function open(id: number) {
    setEditing(id)
    setForm(extrasToForm(extras.get(id)))
    setMessage(null)
  }

  function save() {
    try {
      const current = extras.get(editing)
      const changes = extrasChanges(form, current, setting)
      if (changes) {
        setExtras((map) =>
          new Map(map).set(editing, {
            nameZh: 'name_zh' in changes ? (changes.name_zh ?? null) : (current?.nameZh ?? null),
            kind: 'student_kind' in changes ? (changes.student_kind ?? null) : (current?.kind ?? null),
            consultantId: 'consultant_id' in changes ? (changes.consultant_id ?? null) : (current?.consultantId ?? null),
            secondParentPhone: 'second_parent_phone' in changes ? (changes.second_parent_phone ?? null) : (current?.secondParentPhone ?? null),
          }),
        )
      }
      setMessage(changes ? 'Saved.' : 'Nothing changed.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save.')
    }
  }

  const current = extras.get(editing)
  return (
    <div className="mx-auto grid max-w-5xl gap-6 p-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Class Settings</h2>
        <StudentFieldsSettings setting={setting} onSettingChange={setSetting} onKindsChange={setKinds} api={api} />
      </section>
      <section className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold">Students</h2>
          <div className="my-2 flex flex-wrap gap-2">
            <StudentExtrasFilters setting={setting} filter={filter} kinds={kinds} consultants={consultants} onChange={setFilter} />
          </div>
          <ul aria-label="Student list" className="divide-y divide-slate-100">
            {shown.map((student) => (
              <li key={student.id}>
                <button type="button" onClick={() => open(student.id)} className="py-1 text-sm text-[#be185d] underline">
                  {student.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold">{students.find((student) => student.id === editing)?.name} · profile</h2>
          <StudentExtraSummary
            setting={setting}
            extras={current}
            consultantName={team.find((teacher) => teacher.id === current?.consultantId)?.fullName ?? null}
          />
          <h3 className="pt-2 text-sm font-semibold">Edit Student</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <StudentExtraInputs
              setting={setting}
              form={form}
              kinds={kinds}
              consultants={consultants}
              onChange={(field, value) => setForm((entry) => ({ ...entry, [field]: value }))}
            />
          </div>
          <button type="button" onClick={save} className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white">
            Save Changes
          </button>
          {message && <p role="status">{message}</p>}
        </div>
      </section>
    </div>
  )
}
