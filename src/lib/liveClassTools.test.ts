import { describe, expect, it } from 'vitest'
import { fillLateReminder, readLateReminder, whatsAppLink } from './lateReminder'
import { moveInPlan, nextPlanned } from './questionPlan'
import { studentBackgrounds } from './studentBackground'
import { readClassScreenState, topForScreen } from './classScreen'

describe('late reminder', () => {
  it('fills the school words with the first name', () => {
    expect(fillLateReminder('Hi, {child} ({child}) missed {class} at {time}', { child: 'Lim Loke Yan', className: 'HOA', time: '2:00 pm' })).toBe(
      'Hi, Lim (Lim) missed HOA at 2:00 pm',
    )
  })
  it('reads settings safely', () => {
    expect(readLateReminder({ after_minutes: 10, text: 'x' })).toEqual({ afterMinutes: 10, text: 'x' })
    expect(readLateReminder({ after_minutes: 999, text: ' ' }).afterMinutes).toBe(5)
  })
  it('links to the parent on WhatsApp', () => {
    expect(whatsAppLink('012-345 6789', 'Hi there')).toBe('https://wa.me/60123456789?text=Hi%20there')
    expect(whatsAppLink(null, 'x')).toBeNull()
  })
})

describe('question plan', () => {
  it('gives the next question not popped yet', () => {
    expect(nextPlanned([5, 6, 7], [{ questionId: 5 }, { questionId: null }])).toBe(6)
    expect(nextPlanned([5], [{ questionId: 5 }])).toBeNull()
  })
  it('moves a question up and down', () => {
    expect(moveInPlan([1, 2, 3], 2, -1)).toEqual([2, 1, 3])
    expect(moveInPlan([1, 2, 3], 3, 1)).toEqual([1, 2, 3])
  })
})

describe('student background', () => {
  it('finds lessons left, expiry and the last remark before today', () => {
    const map = studentBackgrounds({
      today: '2026-10-18',
      students: [
        { id: 1, remainingHours: 2, lessonExpiryDate: '2026-11-01', hasPackage: true },
        { id: 2, remainingHours: 20, lessonExpiryDate: '2027-06-01', hasPackage: true },
        { id: 3, remainingHours: 0, lessonExpiryDate: '2026-10-20', hasPackage: false },
      ],
      logs: [
        { id: 10, lessonDate: '2026-10-11', submittedAt: '2026-10-11T10:00:00Z' },
        { id: 11, lessonDate: '2026-10-04', submittedAt: '2026-10-04T10:00:00Z' },
        { id: 12, lessonDate: '2026-10-18', submittedAt: '2026-10-18T10:00:00Z' },
      ],
      reviews: [
        { lessonLogId: 11, studentId: 1, lessonRemark: 'Old' },
        { lessonLogId: 10, studentId: 1, lessonRemark: 'Finished level 2' },
        { lessonLogId: 12, studentId: 1, lessonRemark: 'Today' },
        { lessonLogId: 10, studentId: 2, lessonRemark: '  ' },
      ],
    })
    expect(map.get(1)).toEqual({
      lessonsLeft: 2,
      lowOnLessons: true,
      expiresOn: '2026-11-01',
      expiringSoon: true,
      lastRemark: 'Finished level 2',
      lastRemarkDate: '2026-10-11',
    })
    expect(map.get(2)).toMatchObject({ lowOnLessons: false, expiringSoon: false, lastRemark: null })
    expect(map.get(3)).toMatchObject({ lessonsLeft: null, lowOnLessons: false, expiresOn: null, expiringSoon: false })
  })
})

describe('class screen', () => {
  it('shows only first names with points', () => {
    const names = new Map([
      [1, 'Lim Loke Yan'],
      [2, 'Tan Tian Ying'],
    ])
    expect(topForScreen([{ studentId: 1, points: 20 }, { studentId: 2, points: 0 }], names, 3)).toEqual([{ name: 'Lim', points: 20 }])
    expect(topForScreen([{ studentId: 1, points: 20 }], names, 0)).toEqual([])
  })
  it('ignores junk messages', () => {
    expect(readClassScreenState({ title: 'x' })).toBeNull()
    expect(readClassScreenState({ title: 'x', sentAt: 1, timer: { endsAt: null, pausedLeft: null }, top: [], picked: null, question: null })).not.toBeNull()
  })
})

describe('late reminder link', () => {
  it('fills {link} with the class page, or says the app without one', async () => {
    const { classPageLink, fillLateReminder } = await import('./lateReminder')
    expect(classPageLink('https://app.test/', 42)).toBe('https://app.test/class/42')
    expect(classPageLink('', 42)).toBeNull()
    const base = { child: 'Ali Tan', className: 'C001', time: '8:30 pm' }
    expect(fillLateReminder('Join {child}: {link}', { ...base, link: 'https://app.test/class/42' })).toBe('Join Ali: https://app.test/class/42')
    expect(fillLateReminder('Join from {link}', { ...base, link: null })).toBe('Join from the app')
  })
})
