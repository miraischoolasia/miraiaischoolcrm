import { describe, expect, it } from 'vitest'
import type { PortalAccount } from './portal'
import {
  buildLoginRows,
  fillLoginMessage,
  filterLoginRows,
  groupNewLogins,
  loginCounts,
  newLoginsCsv,
  planLoginJobs,
} from './portalLogins'

const students = [
  { id: 1, name: 'Ali Tan', studentType: 'regular' as const, isActive: true, phone: '0123' },
  { id: 2, name: 'Mei Tan', studentType: 'trial' as const, isActive: true, phone: null },
  { id: 3, name: 'Zed Lim', studentType: 'trial' as const, isActive: true, phone: '0199' },
  { id: 4, name: 'Old Boy', studentType: 'regular' as const, isActive: false, phone: null },
]
const account = (kind: 'student' | 'parent', id: number, username: string): PortalAccount => ({
  authUserId: `${kind}-${id}`,
  username,
  kind,
  studentId: kind === 'student' ? id : null,
  parentPersonId: kind === 'parent' ? id : null,
  isActive: true,
})
// Ali and Mei share parent 50; Zed has none.
const parents = new Map([[50, { id: 50, name: 'Mrs Tan', phone: '0111' }]])
const parentOf = new Map([
  [1, 50],
  [2, 50],
])

describe('buildLoginRows', () => {
  it('puts each login on its student and parent', () => {
    const rows = buildLoginRows(students, [account('student', 1, 'ali.tan'), account('parent', 50, 'mrs.tan')], parentOf, parents)
    const ali = rows.find((row) => row.studentId === 1)!
    const mei = rows.find((row) => row.studentId === 2)!
    expect(ali.studentLogin?.username).toBe('ali.tan')
    expect(mei.studentLogin).toBeNull()
    expect(mei.parentLogin?.username).toBe('mrs.tan')
    expect(rows.find((row) => row.studentId === 3)!.parent).toBeNull()
  })
})

describe('counts and filters', () => {
  const rows = buildLoginRows(students, [account('student', 1, 'ali.tan')], parentOf, parents)

  it('counts active families only, each parent once', () => {
    expect(loginCounts(rows)).toEqual({ students: 3, studentsWithLogin: 1, parents: 1, parentsWithLogin: 0, noParent: 1 })
  })

  it('hides deactivated students unless asked', () => {
    const base = { search: '', show: 'all' as const, type: 'all' as const }
    expect(filterLoginRows(rows, { ...base, inactive: false }).map((row) => row.studentId)).toEqual([1, 2, 3])
    expect(filterLoginRows(rows, { ...base, inactive: true })).toHaveLength(4)
  })

  it('shows who still needs a login, and finds by parent name', () => {
    const base = { search: '', show: 'all' as const, type: 'all' as const, inactive: false }
    // Ali has his own login but his parent has none, so he is still missing one.
    expect(filterLoginRows(rows, { ...base, show: 'missing' }).map((row) => row.studentId)).toEqual([1, 2, 3])
    expect(filterLoginRows(rows, { ...base, show: 'done' })).toEqual([])
    expect(filterLoginRows(rows, { ...base, search: 'mrs' }).map((row) => row.studentId)).toEqual([1, 2])
    expect(filterLoginRows(rows, { ...base, type: 'trial' }).map((row) => row.studentId)).toEqual([2, 3])
  })
})

describe('planLoginJobs', () => {
  const rows = buildLoginRows(students, [account('student', 1, 'ali.tan')], parentOf, parents)

  it('makes a shared parent once and skips logins that exist', () => {
    const jobs = planLoginJobs(rows.filter((row) => row.isActive), { students: true, parents: true })
    expect(jobs).toEqual([
      { kind: 'parent', personId: 50, name: 'Mrs Tan', family: 'parent:50' },
      { kind: 'student', studentId: 2, name: 'Mei Tan', family: 'parent:50' },
      { kind: 'student', studentId: 3, name: 'Zed Lim', family: 'student:3' },
    ])
  })

  it('can make only the parents or only the children', () => {
    expect(planLoginJobs(rows, { students: false, parents: true }).map((job) => job.kind)).toEqual(['parent'])
    expect(planLoginJobs(rows, { students: true, parents: false }).every((job) => job.kind === 'student')).toBe(true)
  })
})

describe('messages to families', () => {
  const rows = buildLoginRows(students, [], parentOf, parents)
  const families = groupNewLogins(rows, [
    { kind: 'student', name: 'Ali Tan', username: 'ali.tan', password: 'sunny-panda-11', family: 'parent:50' },
    { kind: 'parent', name: 'Mrs Tan', username: 'mrs.tan', password: 'brave-otter-22', family: 'parent:50' },
    { kind: 'student', name: 'Zed Lim', username: 'zed.lim', password: 'kind-comet-33', family: 'student:3' },
  ])

  it('groups by family, parent first, sent to the parent phone', () => {
    expect(families).toHaveLength(2)
    expect(families[0]).toMatchObject({ childNames: ['Ali Tan', 'Mei Tan'], phone: '0111', sendToName: 'Mrs Tan' })
    expect(families[0].logins.map((login) => login.kind)).toEqual(['parent', 'student'])
    // No parent: the child's own number.
    expect(families[1]).toMatchObject({ phone: '0199', sendToName: 'Zed Lim', contactId: null })
  })

  it('sends to the chat the CRM knows: the parent chat, else the student own chat', () => {
    const withChats = buildLoginRows(
      students,
      [],
      parentOf,
      new Map([[50, { id: 50, name: 'Mrs Tan', phone: null, contactId: 77 }]]),
      new Map([[3, 88]]),
    )
    const [tan, zed] = groupNewLogins(withChats, [
      { kind: 'parent', name: 'Mrs Tan', username: 'mrs.tan', password: 'a-b-11', family: 'parent:50' },
      { kind: 'student', name: 'Zed Lim', username: 'zed.lim', password: 'c-d-22', family: 'student:3' },
    ])
    expect(tan).toMatchObject({ contactId: 77, phone: '0123' })
    expect(zed).toMatchObject({ contactId: 88, phone: '0199' })
  })

  it('fills the school message', () => {
    const text = fillLoginMessage('', { school: 'Mirai', childNames: families[0].childNames, link: 'https://app.test', logins: families[0].logins })
    expect(text).toContain('Here is the Mirai app for Ali Tan and Mei Tan.')
    expect(text).toContain('Open it here: https://app.test')
    expect(text).toContain('Parent login: mrs.tan\nPassword: brave-otter-22')
    expect(text).toContain('Ali Tan login: ali.tan\nPassword: sunny-panda-11')
  })

  it('leaves out the link line without a link, and never leaves out the logins', () => {
    const text = fillLoginMessage('Hello {child}\nLink: {link}', { school: '', childNames: ['Zed Lim'], link: '', logins: families[1].logins })
    expect(text).toBe('Hello Zed Lim\n\nZed Lim login: zed.lim\nPassword: kind-comet-33')
  })

  it('writes a CSV with one line per login', () => {
    const csv = newLoginsCsv(families)
    expect(csv.split('\n')[0]).toBe('Family,Phone,Who,Name,Login,Password')
    expect(csv).toContain('Ali Tan and Mei Tan,0111,Parent,Mrs Tan,mrs.tan,brave-otter-22')
    expect(csv.trim().split('\n')).toHaveLength(4)
  })
})
