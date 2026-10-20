import { useState } from 'react'
import { ClassListingSection } from '../components/sections/ClassListingSection'
import { ClassroomModal } from '../components/modals/ClassroomModal'
import { ClassCategoriesSettings } from '../components/ClassCategoriesSettings'
import { AgeGroupsContext } from '../lib/ageGroups'
import { resetClassCategoriesForTests, sortClassCategories, type ClassCategory } from '../lib/classCategories'
import type { Subject } from '../lib/subjects'
import type { Classroom, ClassroomFormState, Student, Teacher } from '../types/domain'

// Only the dev server shows this (/?demo=classes): My Classroom with made-up EduHero classes and no
// network, to look at the 20-a-page roster, the school's class categories and the new-class steps.

let categories: ClassCategory[] = [
  { name: 'Regular Class', kind: 'regular', sortOrder: 10, isActive: true },
  { name: 'Trial Class', kind: 'trial', sortOrder: 20, isActive: true },
  { name: 'Camp Class', kind: 'camp', sortOrder: 30, isActive: true },
]
resetClassCategoriesForTests(categories, true)

// Saves into the page only, like the database would.
async function saveLocally(current: ClassCategory | null, changes: Partial<ClassCategory>) {
  if (current === null) {
    if (categories.some((entry) => entry.name === changes.name)) return `"${changes.name}" is already a class category.`
    categories = [...categories, { name: changes.name ?? '', kind: changes.kind ?? 'regular', sortOrder: 100, isActive: true }]
  } else {
    categories = categories.map((entry) => (entry.name === current.name ? { ...entry, ...changes } : entry))
  }
  resetClassCategoriesForTests(sortClassCategories(categories), true)
  return null
}

const teachers: Teacher[] = [
  ['Ms Angeline', 26],
  ['Ms Joey', 52],
  ['Mr Jack', 38],
].map(([fullName, id]) => ({
  id: id as number,
  authUserId: null,
  username: String(fullName),
  fullName: String(fullName),
  email: null,
  phone: null,
  role: 'teacher' as const,
  isActive: true,
  permissions: {},
}))

const subjects = [
  { id: 13, name: 'SCI', sortOrder: 10, isActive: true },
  { id: 8, name: 'SEJ', sortOrder: 20, isActive: true },
] as Subject[]

const base: Classroom = {
  id: 29,
  name: 'SCI Form 1 · Ms Angeline',
  category: 'regular',
  ageGroup: 'Form 1',
  programLevel: '常规班',
  teacherId: 26,
  status: 'active',
  notes: null,
  archivedAt: null,
  subjectId: 13,
  categoryName: 'Regular Class',
}
const classrooms: Classroom[] = [
  base,
  { ...base, id: 30, name: 'SCI Form 1 · Ms Joey', teacherId: 52 },
  { ...base, id: 31, name: 'SEJ Form 1 Trial', subjectId: 8, teacherId: 38, category: 'trial', categoryName: 'Trial Class' },
]

const roster: Student[] = Array.from({ length: 45 }, (_, index) => ({
  id: index + 1,
  name: `Pupil ${String(index + 1).padStart(2, '0')}`,
  isActive: true,
  remainingHours: 4,
  lessonExpiryDate: '2026-12-31',
  accountFeeExpiryDate: '2026-12-31',
  miraiClubExpiryDate: '2026-12-31',
  studentType: 'regular',
})) as unknown as Student[]

const emptyForm: ClassroomFormState = {
  category: 'regular',
  name: '',
  ageGroup: 'Form 1',
  programLevel: '常规班',
  teacherId: '',
  teacherEffectiveDate: '2026-10-19',
  notes: '',
  zoomLink: '',
  programmeId: '',
  subjectId: '',
}

export function ClassroomDemo() {
  const [selected, setSelected] = useState(29)
  const [ageGroup, setAgeGroup] = useState('Form 1')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [created, setCreated] = useState<string | null>(null)
  const noop = () => undefined

  return (
    <AgeGroupsContext.Provider value={['Form 1', 'Form 2', 'Form 3']}>
      <div className="mx-auto max-w-6xl space-y-6 p-4">
        <ClassListingSection
          classrooms={classrooms}
          classroomStudentMap={new Map([[29, roster], [30, roster.slice(0, 12)]])}
          deletingClassroomId={null}
          restoringClassroomId={null}
          canEdit
          onEditClassroom={noop}
          onEditSchedule={noop}
          onOpenCreateClassroom={() => {
            setForm(emptyForm)
            setCreating(true)
          }}
          onOpenStudentDetail={noop}
          onSelectAgeGroup={setAgeGroup}
          schedules={[]}
          selectedAgeGroup={ageGroup}
          selectedClassroomId={selected}
          setSelectedClassroomId={setSelected}
          teacherMap={new Map(teachers.map((teacher) => [teacher.id, teacher]))}
          todayString="2026-10-19"
          subjects={subjects}
        />
        {created && (
          <pre aria-label="Created class" className="rounded bg-slate-900 p-2 text-xs text-white">
            {created}
          </pre>
        )}
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <ClassCategoriesSettings save={saveLocally} />
        </section>
      </div>
      {creating && (
        <ClassroomModal
          isCreating
          editingClassroom={null}
          assignableTeachers={teachers}
          formState={form}
          subjects={subjects}
          saveError={null}
          isSaving={false}
          onClose={() => setCreating(false)}
          onSubmit={(event) => {
            event.preventDefault()
            setCreated(JSON.stringify(form))
            setCreating(false)
          }}
          onFieldChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
        />
      )}
    </AgeGroupsContext.Provider>
  )
}
