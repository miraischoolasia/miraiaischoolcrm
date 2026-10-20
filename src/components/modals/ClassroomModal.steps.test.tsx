import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClassroomModal } from './ClassroomModal'
import { AgeGroupsContext } from '../../lib/ageGroups'
import { defaultClassCategories, resetClassCategoriesForTests, type ClassCategory } from '../../lib/classCategories'
import type { Subject } from '../../lib/subjects'
import type { ClassroomFormState, Teacher } from '../../types/domain'

const teachers: Teacher[] = [
  { id: 52, authUserId: null, username: 'joey', fullName: 'Ms Joey', email: null, phone: null, role: 'teacher', isActive: true, permissions: {} },
  { id: 26, authUserId: null, username: 'angeline', fullName: 'Ms Angeline', email: null, phone: null, role: 'teacher', isActive: true, permissions: {} },
]
const subjects = [
  { id: 13, name: 'SCI', sortOrder: 10, isActive: true },
  { id: 8, name: 'SEJ', sortOrder: 20, isActive: true },
] as Subject[]

const empty: ClassroomFormState = {
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

// The modal with the page's form state behind it.
function Harness({ onChange }: { onChange: (field: keyof ClassroomFormState, value: string) => void }) {
  const [form, setForm] = useState(empty)
  return (
    <AgeGroupsContext.Provider value={['Form 1', 'Form 2']}>
      <ClassroomModal
        isCreating
        editingClassroom={null}
        assignableTeachers={teachers}
        formState={form}
        subjects={subjects}
        saveError={null}
        isSaving={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onFieldChange={(field, value) => {
          onChange(field, value)
          setForm((current) => ({ ...current, [field]: value }))
        }}
      />
    </AgeGroupsContext.Provider>
  )
}

// A fixed list: the tests never read the real database.
beforeEach(() => resetClassCategoriesForTests(defaultClassCategories, false))
afterEach(() => resetClassCategoriesForTests(defaultClassCategories, false))

describe('Adding a class: age group, then subject, then teacher', () => {
  it('asks in that order', () => {
    render(<Harness onChange={vi.fn()} />)
    const labels = [
      screen.getByRole('combobox', { name: /^\s*Age Group/ }),
      screen.getByRole('combobox', { name: /^\s*Subject/ }),
      screen.getByRole('combobox', { name: /^\s*Assigned Teacher/ }),
      screen.getByRole('textbox', { name: /^\s*Classroom Name/ }),
    ]
    for (let index = 1; index < labels.length; index += 1) {
      expect(labels[index - 1].compareDocumentPosition(labels[index]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('names the class after them until a name is typed', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /^\s*Age Group/ }), 'Form 2')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /^\s*Subject/ }), '13')
    expect(screen.getByRole('textbox', { name: /^\s*Classroom Name/ })).toHaveValue('SCI Form 2')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /^\s*Assigned Teacher/ }), '52')
    expect(screen.getByRole('textbox', { name: /^\s*Classroom Name/ })).toHaveValue('SCI Form 2 · Ms Joey')

    const name = screen.getByRole('textbox', { name: /^\s*Classroom Name/ })
    await userEvent.clear(name)
    await userEvent.type(name, 'Joey Science')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /^\s*Assigned Teacher/ }), '26')
    expect(name).toHaveValue('Joey Science')
  })

  it("puts the class in one of the school's categories", async () => {
    const school: ClassCategory[] = [
      { name: 'Regular Class', kind: 'regular', sortOrder: 10, isActive: true },
      { name: '备战班', kind: 'regular', sortOrder: 15, isActive: true },
      { name: 'Trial Class', kind: 'trial', sortOrder: 20, isActive: true },
      { name: 'Camp Class', kind: 'camp', sortOrder: 30, isActive: false },
    ]
    resetClassCategoriesForTests(school, true)
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const select = screen.getByLabelText(/Classroom Category/)
    expect(Array.from((select as HTMLSelectElement).options).map((option) => option.value)).toEqual([
      'Regular Class',
      '备战班',
      'Trial Class',
    ])
    await userEvent.selectOptions(select, 'Trial Class')
    expect(onChange).toHaveBeenCalledWith('category', 'trial')
    expect(onChange).toHaveBeenCalledWith('categoryName', 'Trial Class')
  })

  it('only sets the kind before the class categories migration', async () => {
    const onChange = vi.fn()
    resetClassCategoriesForTests(defaultClassCategories, false)
    render(<Harness onChange={onChange} />)
    await userEvent.selectOptions(screen.getByLabelText(/Classroom Category/), 'Trial Class')
    expect(onChange).toHaveBeenCalledWith('category', 'trial')
    expect(onChange).not.toHaveBeenCalledWith('categoryName', expect.anything())
  })
})
