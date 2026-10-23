// Run from the CRM folder: npx vitest run --root student-app
import { describe, expect, it } from 'vitest'

import { englishReportWords as words, lateText, nextLessonLabel, nextLessonOf, pointLines, reportBadge, reportTitle } from './lessonReportRules'
import type { UpcomingClass } from './portal'

const lesson = (date: string, start: string, cls = 'Y5 BM'): UpcomingClass => ({ date, start, end: '20:00', title: cls, class: cls, teacher: null, zoom_link: null })

describe('student lesson report', () => {
  it('has one title for every child who came, another for a missed class', () => {
    expect(reportTitle({ attended: true }, words)).toBe('Class over! Well done')
    expect(reportTitle({ attended: false }, words)).toBe('You missed this class')
  })

  it('shows the place only for the top three, and never compares with last time', () => {
    expect(reportBadge({ place: 2 }, words)).toEqual({ kind: 'place', text: 'No. 2 in the class!' })
    expect(reportBadge({ place: 7 }, words)).toBeNull()
    expect(reportBadge({ place: null }, words)).toBeNull()
  })

  it('says late from 5 minutes', () => {
    expect(lateText({ late_minutes: 4 }, words)).toBe('On time')
    expect(lateText({ late_minutes: 8 }, words)).toBe('8 min late')
  })

  it('lists the right answers as one line and each award', () => {
    expect(
      pointLines(
        [
          { reason: 'question', kind: 'question', emoji: null, points: 40 },
          { reason: 'Great answer', kind: 'award', emoji: '🌟', points: 5 },
        ],
        words,
      ),
    ).toEqual([
      { label: 'Right answers', emoji: '✅', points: 40 },
      { label: 'Great answer', emoji: '🌟', points: 5 },
    ])
  })

  it('finds the next lesson of the same class and says how far away it is', () => {
    const schedule = [lesson('2026-10-22', '19:00'), lesson('2026-10-24', '10:00', 'Y5 Maths'), lesson('2026-10-29', '19:00'), lesson('2026-11-05', '19:00')]
    const next = nextLessonOf({ date: '2026-10-22', start: '19:00', class: 'Y5 BM', title: null }, schedule)
    expect(next?.date).toBe('2026-10-29')
    expect(nextLessonLabel(next!, '2026-10-22', words)).toEqual({ line: 'Next class: Thu 7:00 pm', day: 29, month: 'OCT', away: 'in 7 days' })
  })
})
