import { supabase } from './supabase'
import { familyOf } from './family'
import type { Person } from './peopleApi'

// "Handled by" for a chat that has no lead (a family that came in through the students list): the person in charge
// of the family. Read-only: it is worked out from what the database already holds, so it is never out of step.
//   1. The students' consultant (students.consultant_id) - the school's own list wins.
//   2. Else the PIC that a tag on the family names (lead_options.pic_option_id on a tag).
// A family whose students have different consultants, or whose tags name different PICs, has no answer.

export type FamilyHandler = { teacherId: number } | { picOptionId: number } | null

type Sources = {
  consultantOf: (studentId: number) => number | undefined
  picOfTag: (tagId: number) => number | undefined
}

export function familyHandler(contactId: number, people: Person[], sources: Sources): FamilyHandler {
  const family = familyOf(contactId, people)
  if (!family) {
    return null
  }
  const members = new Map<number, Person>()
  for (const person of [family.me, family.parent, ...family.children]) {
    if (person) {
      members.set(person.id, person)
    }
  }

  const consultants = new Set<number>()
  for (const person of members.values()) {
    const consultant = person.studentId !== null ? sources.consultantOf(person.studentId) : undefined
    if (consultant !== undefined) {
      consultants.add(consultant)
    }
  }
  if (consultants.size > 0) {
    return consultants.size === 1 ? { teacherId: [...consultants][0] } : null
  }

  const pics = new Set<number>()
  for (const person of members.values()) {
    for (const tagId of person.tagIds ?? []) {
      const pic = sources.picOfTag(tagId)
      if (pic !== undefined) {
        pics.add(pic)
      }
    }
  }
  return pics.size === 1 ? { picOptionId: [...pics][0] } : null
}

const PAGE_SIZE = 1000

// Every student that has a consultant: student id -> the staff account. Empty where the column does not exist yet.
export async function fetchStudentConsultants(): Promise<Map<number, number>> {
  const map = new Map<number, number>()
  if (!supabase) {
    return map
  }
  try {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('students')
        .select('id, consultant_id')
        .not('consultant_id', 'is', null)
        .order('id')
        .range(from, from + PAGE_SIZE - 1)
      if (error) {
        return map
      }
      for (const row of data ?? []) {
        if (row.consultant_id !== null) {
          map.set(row.id, row.consultant_id)
        }
      }
      if ((data ?? []).length < PAGE_SIZE) {
        return map
      }
    }
  } catch {
    return map
  }
}

// Every tag that names a PIC: tag id -> PIC option id. Empty before the migration.
export async function fetchTagPicLinks(): Promise<Map<number, number>> {
  const map = new Map<number, number>()
  if (!supabase) {
    return map
  }
  try {
    const { data, error } = await supabase.from('lead_options').select('id, pic_option_id').eq('kind', 'tag').not('pic_option_id', 'is', null)
    if (error) {
      return map
    }
    for (const row of (data ?? []) as unknown as { id: number; pic_option_id: number | null }[]) {
      if (row.pic_option_id !== null) {
        map.set(row.id, row.pic_option_id)
      }
    }
  } catch {
    return map
  }
  return map
}

// Sets (or takes off, with null) the PIC a tag names. Throws with a reason to show.
export async function setTagPicLink(tagId: number, picOptionId: number | null) {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  const { error } = await supabase.from('lead_options').update({ pic_option_id: picOptionId } as never).eq('id', tagId)
  if (error) {
    throw new Error(error.code === '42703' ? "This can't be saved until the database update for it is applied." : error.message || "Couldn't save.")
  }
}

export type TagPicRow = { id: number; label: string; isActive: boolean; picOptionId: number | null }
export type PicChoice = { id: number; label: string }

// For the settings list: every tag with the PIC it names, and the PIC names to choose from.
export async function fetchTagPicRules(): Promise<{ tags: TagPicRow[]; pics: PicChoice[] }> {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  const { data, error } = await supabase.from('lead_options').select('id, kind, label, is_active, pic_option_id').in('kind', ['tag', 'pic']).order('label')
  if (error) {
    throw new Error(error.code === '42703' ? "This isn't available until the database update for it is applied." : error.message || "Couldn't load the tags.")
  }
  const rows = (data ?? []) as unknown as { id: number; kind: string; label: string; is_active: boolean; pic_option_id: number | null }[]
  return {
    tags: rows.filter((row) => row.kind === 'tag').map((row) => ({ id: row.id, label: row.label, isActive: row.is_active, picOptionId: row.pic_option_id })),
    pics: rows.filter((row) => row.kind === 'pic' && row.is_active).map((row) => ({ id: row.id, label: row.label })),
  }
}
