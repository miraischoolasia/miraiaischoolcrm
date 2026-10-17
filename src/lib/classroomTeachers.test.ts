import { describe, expect, it } from 'vitest'
import { classroomTeacherIds, teachesClassroom } from './classroomTeachers'

describe('class teachers', () => {
  it('lists the main teacher first, then the others', () => {
    expect(classroomTeacherIds({ teacherId: 7, teacherIds: [3, 7, 9] })).toEqual([7, 3, 9])
    expect(classroomTeacherIds({ teacherId: null, teacherIds: [3] })).toEqual([3])
  })

  it('falls back to the main teacher before the class teachers list exists', () => {
    expect(classroomTeacherIds({ teacherId: 7 })).toEqual([7])
  })

  it('a teacher teaches the class when they are any of its teachers', () => {
    expect(teachesClassroom({ teacherId: 7, teacherIds: [7, 9] }, 9)).toBe(true)
    expect(teachesClassroom({ teacherId: 7, teacherIds: [7, 9] }, 4)).toBe(false)
    expect(teachesClassroom({ teacherId: 7 }, null)).toBe(false)
  })
})
