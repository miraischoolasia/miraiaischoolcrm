import type { Lead } from '../types/domain'
import { gradeNow } from './grade'

// One child of a lead, as a row of its own in the Children view of the Leads page.
export type ChildRow = {
  key: string
  leadId: number
  // Empty when the parent gave only an age.
  childName: string
  age: number
  // The school grade the child had and the year it was true, for a school that shows grade.
  gradeLevel?: number | null
  gradeYear?: number | null
  childPhone: string | null
  parentName: string | null
  parentPhone: string | null
}

export const CHILD_AGE_GROUPS = [
  { key: '6-8', label: '6-8 years', min: 6, max: 8 },
  { key: '9-11', label: '9-11 years', min: 9, max: 11 },
  { key: '12-14', label: '12-14 years', min: 12, max: 14 },
  { key: '15-17', label: '15-17 years', min: 15, max: 17 },
] as const

const digitsOf = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '')

// Every child of the given leads, one row each. Words typed in the search find a child by their name or
// number, and every child of a parent found by the parent's name or number.
export function buildChildRows(
  leads: Lead[],
  // grade: the school grade (1-12) to keep, for a school that shows grade; it then replaces the age group, and
  // a child with no grade stored is left out. today: the day the grade is worked out for.
  options: { search?: string; ageGroup?: string; grade?: number | null; today?: string } = {},
): ChildRow[] {
  const query = (options.search ?? '').trim().toLowerCase()
  const queryDigits = digitsOf(query)
  const group = CHILD_AGE_GROUPS.find((entry) => entry.key === options.ageGroup)
  const text = (value: string | null | undefined) => (value ?? '').toLowerCase().includes(query)
  const phone = (value: string | null | undefined) =>
    text(value) || (queryDigits.length > 0 && digitsOf(value).includes(queryDigits))

  const rows: ChildRow[] = []
  for (const lead of leads) {
    const parentMatches = !query || text(lead.fullName) || phone(lead.phone)
    lead.children.forEach((child, index) => {
      if (query && !parentMatches && !text(child.name) && !phone(child.phone)) {
        return
      }
      if (options.grade != null) {
        if (gradeNow(child.gradeLevel, child.gradeYear, options.today ?? new Date().toISOString().slice(0, 10)) !== options.grade) {
          return
        }
      } else if (group && (child.age < group.min || child.age > group.max)) {
        return
      }
      rows.push({
        key: `${lead.id}:${index}`,
        leadId: lead.id,
        childName: child.name,
        age: child.age,
        gradeLevel: child.gradeLevel,
        gradeYear: child.gradeYear,
        childPhone: child.phone,
        parentName: lead.fullName,
        parentPhone: lead.phone,
      })
    })
  }
  return rows
}
