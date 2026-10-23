import type { LeadOption } from '../types/domain'

// A PIC name stands for a staff account (made from the staff list, 20261101300000): the two are matched by the
// account, never by the name ("喵喵小老师" and "喵喵老师" are not compared).

// The staff member a PIC name stands for, or null for an old name not linked to anyone yet.
export function staffOfPic<T extends { id: number }>(pic: Pick<LeadOption, 'teacherId'> | undefined, staff: T[]) {
  return pic?.teacherId != null ? (staff.find((person) => person.id === pic.teacherId) ?? null) : null
}

// A staff member's own PIC name (an old name linked to them counts), or undefined for a teacher who has none.
export function picOfStaff<T extends Pick<LeadOption, 'teacherId'>>(staffId: number, pics: T[]) {
  return pics.find((pic) => pic.teacherId === staffId)
}
