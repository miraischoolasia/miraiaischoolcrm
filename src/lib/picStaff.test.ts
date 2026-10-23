import { describe, expect, it } from 'vitest'
import { picOfStaff, staffOfPic } from './picStaff'

const staff = [
  { id: 4, name: '喵喵老师' },
  { id: 5, name: 'Xue Ling' },
]
const pics = [
  { id: 30, teacherId: 5, label: 'Xue Ling' },
  { id: 31, teacherId: null, label: '喵喵小老师' },
]

describe('PIC names and staff accounts', () => {
  it('finds the staff member by the account, never by a similar name', () => {
    expect(staffOfPic(pics[0], staff)?.name).toBe('Xue Ling')
    expect(staffOfPic(pics[1], staff)).toBeNull()
    expect(staffOfPic(undefined, staff)).toBeNull()
  })

  it("finds a staff member's own PIC name", () => {
    expect(picOfStaff(5, pics)?.id).toBe(30)
    expect(picOfStaff(4, pics)).toBeUndefined()
  })
})
