import { describe, expect, it } from 'vitest'
import { pickView, readTodayEc, readTodayLc, readTodayRoles, readTodayTeam, todayViews } from './today'
import { readRoleNames } from './roleNames'

describe('which versions of Today a person gets', () => {
  const none = { teacherId: 1, ec: false, lc: false }

  it('gives an admin the admin version first, and the jobs they really do', () => {
    expect(todayViews({ isAdmin: true, isTeacherAccount: false, roles: none })).toEqual(['admin'])
    expect(todayViews({ isAdmin: true, isTeacherAccount: false, roles: { ...none, ec: true } })).toEqual(['admin', 'ec'])
  })

  it('gives a teacher the teacher version, plus any other job', () => {
    expect(todayViews({ isAdmin: false, isTeacherAccount: true, roles: none })).toEqual(['teacher'])
    expect(todayViews({ isAdmin: false, isTeacherAccount: true, roles: { ...none, lc: true } })).toEqual(['teacher', 'lc'])
  })

  it('gives staff their jobs, or the general version when they have none', () => {
    expect(todayViews({ isAdmin: false, isTeacherAccount: false, roles: { ...none, ec: true, lc: true } })).toEqual(['ec', 'lc'])
    expect(todayViews({ isAdmin: false, isTeacherAccount: false, roles: none })).toEqual(['admin'])
    expect(todayViews({ isAdmin: false, isTeacherAccount: false, roles: null })).toEqual(['admin'])
  })

  it('starts on the version used last, if they still have it', () => {
    expect(pickView(['ec', 'lc'], 'lc')).toBe('lc')
    expect(pickView(['ec', 'lc'], 'teacher')).toBe('ec')
    expect(pickView(['ec', 'lc'], null)).toBe('ec')
    expect(pickView([], 'ec')).toBeNull()
  })
})

describe('reading what the database sends', () => {
  it('reads roles and refuses a reply without a person', () => {
    expect(readTodayRoles({ teacher_id: 4, ec: true, lc: false })).toEqual({ teacherId: 4, ec: true, lc: false })
    expect(readTodayRoles({})).toBeNull()
    expect(readTodayRoles(null)).toBeNull()
  })

  it('reads an EC reply, and an empty one as nothing to show', () => {
    const ec = readTodayEc({
      available: true,
      leads_open: 3,
      revenue_month: 1200,
      quotations: [{ reference: 'Q-1', child_name: 'Mia', total: 900, status: 'sent', lead_id: 7, sent_on: '2026-10-20', parent_said_wrong: true }],
      trials_today: [{ lead_id: 7, child_name: 'Mia', start_time: '17:00:00', class_name: 'HOA' }],
    })
    expect(ec.leadsOpen).toBe(3)
    expect(ec.quotations[0]).toMatchObject({ reference: 'Q-1', parentSaidWrong: true, leadId: 7 })
    expect(ec.trialsToday[0].startTime).toBe('17:00')
    expect(readTodayEc(null)).toMatchObject({ available: false, quotations: [], trialsToday: [] })
  })

  it('reads an LC reply and a team reply', () => {
    const lc = readTodayLc({ available: true, students: 5, at_risk: [{ student_id: 1, name: 'A', why: 'absent twice', lesson_date: '2026-10-22' }] })
    expect(lc.students).toBe(5)
    expect(lc.atRisk[0].why).toBe('absent twice')
    expect(readTodayLc(undefined).expiring).toEqual([])

    const team = readTodayTeam({ people: [{ teacher_id: 2, name: 'B', is_ec: true, overdue_followups: 4 }], approvals: [{ reference: 'Q-2', discount_amount: 50 }] })
    expect(team.people[0]).toMatchObject({ teacherId: 2, isEc: true, overdueFollowups: 4 })
    expect(team.approvals[0].discountAmount).toBe(50)
  })

  it('keeps EC and LC when a school has not renamed them, and takes its own words', () => {
    expect(readRoleNames(null)).toEqual({ ec: 'EC', lc: 'LC' })
    expect(readRoleNames({ ec: ' Sales ', lc: '' })).toEqual({ ec: 'Sales', lc: 'LC' })
  })
})
