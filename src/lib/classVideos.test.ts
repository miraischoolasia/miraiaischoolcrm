import { describe, expect, it } from 'vitest'
import { groupByMonth, isMonthOpen, monthLabel, tusMetadata, videoEmbedUrl, videoStats, type ClassVideo } from './classVideos'

const video = (id: number, year: number, month: number, extra: Partial<ClassVideo> = {}): ClassVideo => ({
  id,
  classroomId: 1,
  teacherId: null,
  title: `Video ${id}`,
  description: null,
  year,
  month,
  lessonDate: null,
  libraryId: '123',
  videoId: `v${id}`,
  status: 'ready',
  source: 'upload',
  views: 0,
  isArchived: false,
  createdAt: `2026-01-0${id}T00:00:00Z`,
  ...extra,
})

describe('class videos', () => {
  it('groups by month, newest month first, lessons in order inside a month', () => {
    const groups = groupByMonth([
      video(1, 2026, 6, { lessonDate: '2026-06-20' }),
      video(2, 2026, 7),
      video(3, 2026, 6, { lessonDate: '2026-06-03' }),
      video(4, 2025, 12),
    ])
    expect(groups.map((group) => monthLabel(group.year, group.month))).toEqual(['July 2026', 'June 2026', 'December 2025'])
    expect(groups[1].videos.map((entry) => entry.id)).toEqual([3, 1])
  })

  it('opens a month only within its dates', () => {
    const access = [
      { studentId: 5, year: 2026, month: 6, startsOn: null, endsOn: null },
      { studentId: 5, year: 2026, month: 7, startsOn: '2026-07-01', endsOn: '2026-07-31' },
    ]
    expect(isMonthOpen(access, 5, 2026, 6, '2026-10-17')).toBe(true)
    expect(isMonthOpen(access, 5, 2026, 7, '2026-10-17')).toBe(false)
    expect(isMonthOpen(access, 5, 2026, 7, '2026-07-15')).toBe(true)
    expect(isMonthOpen(access, 6, 2026, 6, '2026-10-17')).toBe(false)
  })

  it('counts who watched and finished', () => {
    const rows = [
      { studentId: 1, videoId: 9, percentage: 95, completed: true, rewatches: 0, lastWatchedAt: '' },
      { studentId: 2, videoId: 9, percentage: 20, completed: false, rewatches: 0, lastWatchedAt: '' },
      { studentId: 1, videoId: 8, percentage: 50, completed: false, rewatches: 0, lastWatchedAt: '' },
    ]
    expect(videoStats(rows, 9)).toEqual({ watched: 2, completed: 1 })
  })

  it('builds the player link and tus metadata (UTF-8 safe)', () => {
    expect(videoEmbedUrl({ libraryId: '42', videoId: 'abc' })).toBe('https://player.mediadelivery.net/embed/42/abc')
    // '数学 1' in UTF-8, then base64.
    expect(tusMetadata({ filetype: 'video/mp4', title: '数学 1' })).toBe(`filetype ${btoa('video/mp4')},title 5pWw5a2mIDE=`)
  })
})
