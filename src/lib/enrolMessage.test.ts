import { describe, expect, it } from 'vitest'
import { buildEnrolMessage } from './enrolMessage'

describe('buildEnrolMessage', () => {
  it('says the class time, the Zoom meeting and the form, in that order', () => {
    const text = buildEnrolMessage({
      childName: 'Ethan',
      classTime: 'Sat 18 Oct, 10:00 to 12:00',
      zoom: { startsAt: new Date(2026, 9, 16, 20, 30), link: ' https://zoom.us/j/123 ' },
      formUrl: 'https://crm.miraischool.asia/?form=hoa',
      paid: true,
    })

    expect(text).toContain('已收到款项')
    expect(text).toContain('Ethan 的 HOA 课程已经安排在 Sat 18 Oct, 10:00 to 12:00')
    expect(text).toContain('Fri 16 Oct, 20:30')
    expect(text).toContain('Zoom 链接：https://zoom.us/j/123')
    expect(text.indexOf('课程已经安排')).toBeLessThan(text.indexOf('Zoom'))
    expect(text.indexOf('Zoom')).toBeLessThan(text.indexOf('报名表'))
  })

  it('leaves out what is not saved yet', () => {
    const text = buildEnrolMessage({ childName: '', classTime: null, zoom: null, formUrl: null, paid: false })

    expect(text).not.toContain('Zoom')
    expect(text).not.toContain('报名表')
    expect(text).not.toContain('课程已经安排')
    expect(text).not.toContain('已收到款项')
  })

  it('calls the child "孩子" when there is no name', () => {
    expect(buildEnrolMessage({ childName: ' ', classTime: 'Sat', zoom: null, formUrl: null, paid: false })).toContain('孩子 的 HOA')
  })
})
