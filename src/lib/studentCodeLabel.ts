import { numberKey } from './studentNumberCheck'

// The school's student code in front of a name: "S1234567 · KEW KAYDEN". A family with several children lists every code:
// "S1234567 / S1234568 · KEW KAYDEN's Parent". Nothing in front when there is no code (a lead that is not a student yet, a
// school that does not use codes).

// The codes once each, in order, joined with " / "; '' when there is none.
export function codesLabel(codes: (string | null | undefined)[]): string {
  const unique = [...new Set(codes.map((code) => (code ?? '').trim()).filter((code) => code !== ''))]
  return unique.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(' / ')
}

// The name with the codes in front. The name alone when there is no code; the codes alone when there is no name.
// A name that already starts with them is left as it is, so nothing is written twice.
export function withCodes(name: string | null | undefined, codes: (string | null | undefined)[]): string {
  const label = codesLabel(codes)
  const text = (name ?? '').trim()
  if (label === '') {
    return text
  }
  if (text === '') {
    return label
  }
  return text.startsWith(`${label} · `) ? text : `${label} · ${text}`
}

type LeadForCodes = { phone: string | null; convertedStudentId: number | null }
type StudentForCodes = { id: number; phone: string | null }

// The codes of the students a lead stands for: the student it became, and every student with the lead's phone number
// (brothers and sisters share the parent's number, which is how the database ties them to the lead too).
export function makeLeadCodes(students: StudentForCodes[], codes: Map<number, string>) {
  const byNumber = new Map<string, number[]>()
  for (const student of students) {
    const key = numberKey(student.phone)
    if (key !== null && codes.has(student.id)) {
      byNumber.set(key, [...(byNumber.get(key) ?? []), student.id])
    }
  }
  return (lead: LeadForCodes): string[] => {
    const ids = new Set<number>(lead.convertedStudentId !== null ? [lead.convertedStudentId] : [])
    const key = numberKey(lead.phone)
    for (const id of key !== null ? (byNumber.get(key) ?? []) : []) {
      ids.add(id)
    }
    return [...ids].flatMap((id) => codes.get(id) ?? [])
  }
}
