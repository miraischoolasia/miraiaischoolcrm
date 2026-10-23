import { describe, expect, it } from 'vitest'
import { brand } from './brand'
import { buildCampMessage, buildEnrolMessage } from './enrolMessage'

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

  it('gives the Zoom time without a link line when the meeting has no link', () => {
    const text = buildEnrolMessage({
      childName: 'Ethan',
      classTime: null,
      zoom: { startsAt: new Date(2026, 9, 16, 20, 30), link: '' },
      formUrl: null,
      paid: false,
    })

    expect(text).toContain('Fri 16 Oct, 20:30')
    expect(text).not.toContain('Zoom 链接')
  })

  it('leaves out what is not saved yet', () => {
    const text = buildEnrolMessage({ childName: '', classTime: null, zoom: null, formUrl: null, paid: false })

    expect(text).not.toContain('Zoom')
    expect(text).not.toContain('报名表')
    expect(text).not.toContain('课程已经安排')
    expect(text).not.toContain('已收到款项')
  })

  it('speaks to the student themself, not to a parent', () => {
    const text = buildEnrolMessage({
      childName: 'Ethan',
      classTime: 'Sat 18 Oct, 10:00 to 12:00',
      zoom: null,
      formUrl: 'https://crm.example.com/?form=hoa',
      paid: true,
      toStudent: true,
    })

    expect(text).toContain('谢谢你')
    expect(text).toContain('你的 HOA 课程已经安排在 Sat 18 Oct, 10:00 to 12:00')
    expect(text).not.toContain('您')
    expect(text).not.toContain('Ethan')
  })

  it('calls the child "孩子" when there is no name', () => {
    expect(buildEnrolMessage({ childName: ' ', classTime: 'Sat', zoom: null, formUrl: null, paid: false })).toContain('孩子 的 HOA')
  })
})

describe('the course and school names', () => {
  const camp = {
    childName: 'Ethan',
    enrolled: { className: 'Camp A', startDate: 'Mon 20 Oct', classes: 8 },
    zoom: null,
    formUrl: null,
    paid: false,
  }

  it('names the school from its settings, never a fixed school', () => {
    const text = buildCampMessage(camp)
    expect(text).toContain(`Ethan 已经报名 ${brand.name} 的 Holiday Camp（Camp A），Mon 20 Oct 开始上课，共 8 堂。`)
    expect(text).not.toContain('Mirai Online')
  })

  it('uses the programme name the school gave the course', () => {
    expect(buildCampMessage({ ...camp, courseName: ' 寒假营 ' })).toContain(`已经报名 ${brand.name} 的 寒假营（Camp A）`)
    expect(
      buildEnrolMessage({ childName: 'Ethan', classTime: 'Sat', zoom: null, formUrl: null, paid: false, courseName: 'Trial Class' }),
    ).toContain('Ethan 的 Trial Class 课程已经安排在 Sat')
  })
})
