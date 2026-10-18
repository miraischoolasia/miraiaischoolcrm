import type { StudentType } from '../types/domain'
import type { PortalAccount } from './portal'

// The App Logins page: every student with their own login and their parent's,
// making many logins in one go, and the message that sends them to a family.

export type ParentInfo = { id: number; name: string | null; phone: string | null; contactId?: number | null }

export type LoginRow = {
  studentId: number
  studentName: string
  studentType: StudentType
  isActive: boolean
  studentPhone: string | null
  // The student's own chat (a student who writes themself), when the CRM knows it.
  studentContactId?: number | null
  studentLogin: PortalAccount | null
  parent: ParentInfo | null
  parentLogin: PortalAccount | null
}

type StudentLike = { id: number; name: string; studentType: StudentType; isActive: boolean; phone: string | null }

export function buildLoginRows(
  students: StudentLike[],
  accounts: PortalAccount[],
  parentOfStudent: Map<number, number>,
  parents: Map<number, ParentInfo>,
  studentContacts: Map<number, number> = new Map(),
): LoginRow[] {
  const byStudent = new Map<number, PortalAccount>()
  const byParent = new Map<number, PortalAccount>()
  for (const account of accounts) {
    if (account.kind === 'student' && account.studentId !== null) byStudent.set(account.studentId, account)
    if (account.kind === 'parent' && account.parentPersonId !== null) byParent.set(account.parentPersonId, account)
  }
  return students
    .map((student) => {
      const parentId = parentOfStudent.get(student.id) ?? null
      const parent = parentId !== null ? (parents.get(parentId) ?? null) : null
      return {
        studentId: student.id,
        studentName: student.name,
        studentType: student.studentType,
        isActive: student.isActive,
        studentPhone: student.phone,
        studentContactId: studentContacts.get(student.id) ?? null,
        studentLogin: byStudent.get(student.id) ?? null,
        parent,
        parentLogin: parent ? (byParent.get(parent.id) ?? null) : null,
      }
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName))
}

// Missing: the child has no login, or a linked parent has none.
export function isMissing(row: LoginRow) {
  return !row.studentLogin || (row.parent !== null && !row.parentLogin)
}

export type LoginFilter = { search: string; show: 'all' | 'missing' | 'done'; type: 'all' | StudentType; inactive: boolean }

export function filterLoginRows(rows: LoginRow[], filter: LoginFilter) {
  const words = filter.search.trim().toLowerCase()
  return rows.filter((row) => {
    if (!filter.inactive && !row.isActive) return false
    if (filter.type !== 'all' && row.studentType !== filter.type) return false
    if (filter.show === 'missing' && !isMissing(row)) return false
    if (filter.show === 'done' && isMissing(row)) return false
    if (!words) return true
    return [row.studentName, row.parent?.name, row.studentLogin?.username, row.parentLogin?.username, row.parent?.phone, row.studentPhone]
      .some((value) => value?.toLowerCase().includes(words))
  })
}

// Active students only, so the numbers are about families still with the school.
export function loginCounts(rows: LoginRow[]) {
  const active = rows.filter((row) => row.isActive)
  const parentIds = new Set(active.flatMap((row) => (row.parent ? [row.parent.id] : [])))
  const parentsWithLogin = new Set(active.flatMap((row) => (row.parent && row.parentLogin ? [row.parent.id] : [])))
  return {
    students: active.length,
    studentsWithLogin: active.filter((row) => row.studentLogin).length,
    parents: parentIds.size,
    parentsWithLogin: parentsWithLogin.size,
    noParent: active.filter((row) => !row.parent).length,
  }
}

export type LoginJob =
  | { kind: 'student'; studentId: number; name: string; family: string }
  | { kind: 'parent'; personId: number; name: string; family: string }

// The family a login belongs to: the parent when there is one (brothers and
// sisters share it), else the child alone.
export function familyKey(row: Pick<LoginRow, 'studentId' | 'parent'>) {
  return row.parent ? `parent:${row.parent.id}` : `student:${row.studentId}`
}

// What to make for the picked rows: each missing child login, and each
// missing parent login once (one parent can have several children picked).
export function planLoginJobs(rows: LoginRow[], make: { students: boolean; parents: boolean }): LoginJob[] {
  const jobs: LoginJob[] = []
  const parentsPlanned = new Set<number>()
  for (const row of rows) {
    const family = familyKey(row)
    if (make.parents && row.parent && !row.parentLogin && !parentsPlanned.has(row.parent.id)) {
      parentsPlanned.add(row.parent.id)
      jobs.push({ kind: 'parent', personId: row.parent.id, name: row.parent.name || 'Parent', family })
    }
    if (make.students && !row.studentLogin) {
      jobs.push({ kind: 'student', studentId: row.studentId, name: row.studentName, family })
    }
  }
  return jobs
}

export type NewLogin = { kind: 'student' | 'parent'; name: string; username: string; password: string }

// The logins made for one family this time, and where to send them.
export type FamilyLogins = {
  family: string
  childNames: string[]
  phone: string | null
  // The family's chat (Messenger, Instagram or WhatsApp) when it is known; else the phone finds it.
  contactId: number | null
  sendToName: string | null
  logins: NewLogin[]
}

export function groupNewLogins(rows: LoginRow[], made: Array<NewLogin & { family: string }>): FamilyLogins[] {
  const groups = new Map<string, FamilyLogins>()
  for (const login of made) {
    let group = groups.get(login.family)
    if (!group) {
      const members = rows.filter((row) => familyKey(row) === login.family)
      const first = members[0]
      group = {
        family: login.family,
        childNames: members.map((row) => row.studentName),
        phone: first?.parent?.phone || first?.studentPhone || null,
        contactId: first?.parent ? (first.parent.contactId ?? null) : (first?.studentContactId ?? null),
        sendToName: first?.parent?.name || first?.studentName || null,
        logins: [],
      }
      groups.set(login.family, group)
    }
    group.logins.push({ kind: login.kind, name: login.name, username: login.username, password: login.password })
  }
  // Parent first, then the children, in each family.
  for (const group of groups.values()) group.logins.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'parent' ? -1 : 1))
  return [...groups.values()]
}

export const DEFAULT_LOGIN_MESSAGE = `Hi! Here is the {school} app for {child}.

Open it here: {link}

{logins}

Please keep the password safe. If you forget it, just ask us for a new one.`

export function loginLines(logins: NewLogin[]) {
  return logins
    .map((login) => `${login.kind === 'parent' ? 'Parent' : login.name} login: ${login.username}\nPassword: ${login.password}`)
    .join('\n\n')
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? 'your child'
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// The school's message with its words filled in. A line asking for the link
// is left out while the school has no link yet.
export function fillLoginMessage(
  template: string,
  values: { school: string; childNames: string[]; link: string; logins: NewLogin[] },
) {
  const text = template.trim() ? template : DEFAULT_LOGIN_MESSAGE
  const lines = values.link.trim() ? text.split('\n') : text.split('\n').filter((line) => !line.includes('{link}'))
  const filled = lines
    .join('\n')
    .replaceAll('{school}', values.school.trim() || 'school')
    .replaceAll('{child}', joinNames(values.childNames))
    .replaceAll('{link}', values.link.trim())
    .replaceAll('{logins}', loginLines(values.logins))
  // A missing {logins} would send the family nothing to sign in with.
  const withLogins = text.includes('{logins}') ? filled : `${filled.trimEnd()}\n\n${loginLines(values.logins)}`
  return withLogins.replace(/\n{3,}/g, '\n\n').trim()
}

function csvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export function newLoginsCsv(families: FamilyLogins[]) {
  const lines = [['Family', 'Phone', 'Who', 'Name', 'Login', 'Password'].join(',')]
  for (const family of families) {
    for (const login of family.logins) {
      lines.push(
        [joinNames(family.childNames), family.phone ?? '', login.kind === 'parent' ? 'Parent' : 'Child', login.name, login.username, login.password]
          .map(csvCell)
          .join(','),
      )
    }
  }
  return `${lines.join('\n')}\n`
}
