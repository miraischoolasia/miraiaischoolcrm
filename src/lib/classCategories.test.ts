import { describe, expect, it } from 'vitest'
import {
  classCategoryOptions,
  classCategoryTabs,
  classroomCategoryName,
  defaultClassCategories,
  type ClassCategory,
} from './classCategories'

const school: ClassCategory[] = [
  { name: 'Trial Class', kind: 'trial', sortOrder: 20, isActive: true },
  { name: 'Regular Class', kind: 'regular', sortOrder: 10, isActive: true },
  { name: '备战班', kind: 'regular', sortOrder: 15, isActive: true },
  { name: 'Camp Class', kind: 'camp', sortOrder: 30, isActive: false },
]

describe('classroomCategoryName', () => {
  it('uses the category an admin gave the class', () => {
    expect(classroomCategoryName({ category: 'regular', categoryName: '备战班' }, school)).toBe('备战班')
  })

  it("falls back to the kind's first shown category", () => {
    expect(classroomCategoryName({ category: 'regular' }, school)).toBe('Regular Class')
    expect(classroomCategoryName({ category: 'trial', categoryName: null }, school)).toBe('Trial Class')
    expect(classroomCategoryName({ category: 'camp' }, school)).toBe('Camp Class')
  })

  it('does not lose a class whose category was just renamed', () => {
    expect(classroomCategoryName({ category: 'regular', categoryName: 'Old name' }, school)).toBe('Regular Class')
  })

  it('works with the usual three before the migration', () => {
    expect(classroomCategoryName({ category: 'trial' }, defaultClassCategories)).toBe('Trial Class')
  })
})

describe('classCategoryTabs', () => {
  it('lists the shown categories in order', () => {
    expect(classCategoryTabs(school, []).map((entry) => entry.name)).toEqual(['Regular Class', '备战班', 'Trial Class'])
  })

  it('keeps a hidden category while a class still uses it', () => {
    const tabs = classCategoryTabs(school, [{ category: 'camp' }])
    expect(tabs.map((entry) => entry.name)).toContain('Camp Class')
  })
})

describe('classCategoryOptions', () => {
  it("offers the shown categories plus the class's own hidden one", () => {
    expect(classCategoryOptions(school, 'Regular Class').map((entry) => entry.name)).not.toContain('Camp Class')
    expect(classCategoryOptions(school, 'Camp Class').map((entry) => entry.name)).toContain('Camp Class')
  })
})
