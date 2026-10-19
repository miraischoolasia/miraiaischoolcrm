import { describe, expect, it } from 'vitest'
import { lessonFixedZoomLink, normalizeLessonLink, regularLessonOwner, SCHEDULE_SELECT } from './scheduleLinks'
import { mapScheduleRow } from './mappers'
import { buildScheduleFormState } from './schedule'
import type { ScheduleRow } from '../types/domain'

describe('normalizeLessonLink', () => {
  it('keeps empty as no link', () => {
    expect(normalizeLessonLink('')).toEqual({ link: null, error: null })
    expect(normalizeLessonLink('   ')).toEqual({ link: null, error: null })
    expect(normalizeLessonLink(undefined)).toEqual({ link: null, error: null })
  })

  it('adds https to links pasted from the Sheet without it', () => {
    expect(normalizeLessonLink(' www.facebook.com/groups/805402432424631/ ')).toEqual({
      link: 'https://www.facebook.com/groups/805402432424631/',
      error: null,
    })
    expect(normalizeLessonLink('https://us06web.zoom.us/j/123')).toEqual({ link: 'https://us06web.zoom.us/j/123', error: null })
  })

  it('refuses text that is not a link', () => {
    expect(normalizeLessonLink('ask Ms Joey').error).toBe('is not a web link')
    expect(normalizeLessonLink('https://two words.com').error).toBe('is not a web link')
  })
})

describe('lessonFixedZoomLink', () => {
  it("uses the lesson's own link before the class's", () => {
    expect(lessonFixedZoomLink({ zoomLink: 'https://lesson' }, { zoomLink: 'https://class' })).toBe('https://lesson')
    expect(lessonFixedZoomLink({ zoomLink: null }, { zoomLink: 'https://class' })).toBe('https://class')
    expect(lessonFixedZoomLink({ zoomLink: '  ' }, { zoomLink: undefined })).toBeNull()
    expect(lessonFixedZoomLink(null, null)).toBeNull()
  })
})

describe('regularLessonOwner', () => {
  const sciForm1 = { id: 29, name: 'SCI Form 1', teacherId: 26, teacherIds: [26, 25, 52] }

  it('gives a new lesson the class teacher and name', () => {
    expect(regularLessonOwner(sciForm1, null)).toEqual({ teacherId: 26, title: 'SCI Form 1' })
  })

  it("keeps another class teacher's lesson and its name", () => {
    const joey = { classroomId: 29, teacherId: 52, title: 'F1 SAINS MS JOEY' }
    expect(regularLessonOwner(sciForm1, joey)).toEqual({ teacherId: 52, title: 'F1 SAINS MS JOEY' })
  })

  it('moves a lesson to the main teacher when its teacher left the class', () => {
    const gone = { classroomId: 29, teacherId: 99, title: 'F1 SCI old' }
    expect(regularLessonOwner(sciForm1, gone)).toEqual({ teacherId: 26, title: 'F1 SCI old' })
  })

  it('takes the new class teacher and name when the lesson changes class', () => {
    const moved = { classroomId: 54, teacherId: 52, title: 'F2 SAINS MS JOEY' }
    expect(regularLessonOwner(sciForm1, moved)).toEqual({ teacherId: 26, title: 'SCI Form 1' })
  })

  it('works before the class teachers list is loaded', () => {
    const mirai = { id: 3, name: 'Coder A', teacherId: 7 }
    expect(regularLessonOwner(mirai, { classroomId: 3, teacherId: 7, title: 'Coder A' })).toEqual({ teacherId: 7, title: 'Coder A' })
  })
})

describe('lesson links on schedules', () => {
  const row: ScheduleRow = {
    id: 1,
    teacher_id: 52,
    classroom_id: 29,
    title: 'F1 SAINS MS JOEY',
    event_type: 'regular',
    recurrence_type: 'weekly',
    day_of_week: 1,
    scheduled_date: null,
    start_time: '08:15:00',
    end_time: '09:30:00',
    start_recur: '2026-10-26',
    end_recur: '2026-12-31',
    status: 'active',
    notes: null,
    fb_group_url: 'https://www.facebook.com/groups/1',
    zoom_link: 'https://us06web.zoom.us/j/2',
  }

  it('reads both columns', () => {
    expect(SCHEDULE_SELECT).toContain('fb_group_url')
    expect(SCHEDULE_SELECT).toContain('zoom_link')
  })

  it('maps them onto the schedule and the edit form', () => {
    const schedule = mapScheduleRow(row)
    expect(schedule.fbGroupUrl).toBe('https://www.facebook.com/groups/1')
    expect(schedule.zoomLink).toBe('https://us06web.zoom.us/j/2')
    const form = buildScheduleFormState(schedule, '2026-10-19', null, [])
    expect(form.fbGroupUrl).toBe('https://www.facebook.com/groups/1')
    expect(form.zoomLink).toBe('https://us06web.zoom.us/j/2')
  })

  it('starts a new lesson with empty links', () => {
    const form = buildScheduleFormState(null, '2026-10-19', null, [])
    expect(form.fbGroupUrl).toBe('')
    expect(form.zoomLink).toBe('')
  })
})
