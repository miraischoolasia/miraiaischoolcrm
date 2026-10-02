import { describe, expect, it } from 'vitest'
import {
  computePageFunnel,
  readTracking,
  summarizeSources,
  trafficSourceLabel,
} from './formInsights'
import { createField } from './forms'
import type { FormPage, FormSubmission, FormTracking } from '../types/domain'

describe('readTracking', () => {
  it('reads the utm parts of the link', () => {
    expect(
      readTracking('?form=x&utm_source=facebook&utm_medium=cpc&utm_campaign=spring&utm_content=a', '', 'crm.test'),
    ).toEqual({ source: 'facebook', medium: 'cpc', campaign: 'spring', content: 'a', referrer: '' })
  })

  it('notes the website that sent the visitor, without www, unless it is our own', () => {
    expect(readTracking('?form=x', 'https://www.mirai.my/classes?x=1', 'crm.test')?.referrer).toBe('mirai.my')
    expect(readTracking('?form=x', 'https://crm.test/other', 'crm.test')).toBeNull()
  })

  it('knows the source from an ad click id when nobody added a utm source', () => {
    expect(readTracking('?form=x&fbclid=abc', '', 'crm.test')?.source).toBe('facebook')
    expect(readTracking('?form=x&gclid=abc', '', 'crm.test')?.source).toBe('google')
    expect(readTracking('?form=x&fbclid=abc&utm_source=newsletter', '', 'crm.test')?.source).toBe('newsletter')
  })

  it('records nothing for a plain link, and keeps values short and clean', () => {
    expect(readTracking('?form=x', '', 'crm.test')).toBeNull()
    const long = readTracking(`?utm_source=${'x'.repeat(300)}&utm_campaign=a%07b`, '', 'crm.test')
    expect(long?.source).toHaveLength(100)
    expect(long?.campaign).toBe('ab')
  })

  it('ignores a referrer that is not a web address', () => {
    expect(readTracking('?form=x', 'android-app://com.facebook.katana', 'crm.test')?.referrer).toBe('com.facebook.katana')
    expect(readTracking('?form=x', 'not a url', 'crm.test')).toBeNull()
  })
})

const tracking = (partial: Partial<FormTracking>): FormTracking => ({
  source: '',
  medium: '',
  campaign: '',
  content: '',
  referrer: '',
  ...partial,
})

function submission(overrides: Partial<FormSubmission>): FormSubmission {
  return {
    id: 1,
    formId: 'f1',
    answers: [],
    leadId: null,
    leadWasExisting: false,
    status: 'completed',
    lastPage: null,
    tracking: null,
    createdAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

describe('trafficSourceLabel', () => {
  it('prefers the campaign source, then the referring website, then Direct', () => {
    expect(trafficSourceLabel(tracking({ source: 'facebook', referrer: 'l.facebook.com' }))).toBe('facebook')
    expect(trafficSourceLabel(tracking({ referrer: 'mirai.my' }))).toBe('mirai.my')
    expect(trafficSourceLabel(null)).toBe('Direct')
  })
})

describe('summarizeSources', () => {
  it('counts finished submissions per source and campaign, most first', () => {
    const rows = summarizeSources([
      submission({ id: 1, tracking: tracking({ source: 'facebook', campaign: 'spring' }) }),
      submission({ id: 2, tracking: tracking({ source: 'facebook', campaign: 'spring' }) }),
      submission({ id: 3, tracking: tracking({ source: 'facebook', campaign: 'summer' }) }),
      submission({ id: 4 }),
      submission({ id: 5 }),
      submission({ id: 6 }),
      submission({ id: 7, status: 'partial', tracking: tracking({ source: 'google' }) }),
    ])

    expect(rows).toEqual([
      { source: 'Direct', campaign: '', count: 3 },
      { source: 'facebook', campaign: 'spring', count: 2 },
      { source: 'facebook', campaign: 'summer', count: 1 },
    ])
  })

  it('is empty when nothing is finished', () => {
    expect(summarizeSources([submission({ status: 'partial' })])).toEqual([])
  })
})

describe('computePageFunnel', () => {
  const pages: FormPage[] = [
    {
      id: 'p1',
      title: 'About you',
      description: '',
      rules: [
        {
          id: 'r1',
          fieldId: 'goal',
          op: 'is',
          value: 'Robotics',
          action: { type: 'page', pageId: 'p3' },
        },
      ],
    },
    { id: 'p2', title: '', description: '', rules: [] },
    { id: 'p3', title: 'Last', description: '', rules: [] },
  ]
  const fields = [
    { ...createField('radio', 'p1'), id: 'goal', options: ['Coding', 'Robotics'] },
    { ...createField('short_text', 'p2'), id: 'lvl' },
    { ...createField('short_text', 'p3'), id: 'note' },
  ]
  const answer = (id: string, value: string) => ({ id, label: id, value })

  const submissions = [
    submission({ id: 1, answers: [answer('goal', 'Coding'), answer('lvl', 'x'), answer('note', 'y')] }),
    submission({ id: 2, answers: [answer('goal', 'Robotics'), answer('note', 'y')] }),
    // Left on page 2, which a Coding answer leads to.
    submission({ id: 3, status: 'partial', lastPage: 2, answers: [answer('goal', 'Coding')] }),
    // Robotics jumps past page 2, so page 3 is the one they stopped on.
    submission({ id: 4, status: 'partial', lastPage: 3, answers: [answer('goal', 'Robotics')] }),
  ]

  it('counts who reached each page, following the skip rules, and where unfinished ones stopped', () => {
    const rows = computePageFunnel(pages, fields, submissions, 4)

    expect(rows.map((row) => [row.label, row.reached, row.stoppedHere])).toEqual([
      ['Page 1: About you', 4, 0],
      ['Page 2', 2, 1],
      ['Page 3: Last', 3, 1],
    ])
  })

  it('adds the people who opened the form and left without pressing Next to page 1', () => {
    const rows = computePageFunnel(pages, fields, submissions, 10)

    expect(rows[0]).toMatchObject({ reached: 10, stoppedHere: 6 })
    expect(rows[1].reached).toBe(2)
  })

  it('never goes negative when there are more submissions than views', () => {
    expect(computePageFunnel(pages, fields, submissions, 0)[0]).toMatchObject({ reached: 4, stoppedHere: 0 })
  })

  it('reads a multiple choice answer back as a list for rules that look at it', () => {
    const checkboxPages: FormPage[] = [
      {
        id: 'p1',
        title: '',
        description: '',
        rules: [
          {
            id: 'r1',
            fieldId: 'days',
            op: 'includes',
            value: 'Sun',
            action: { type: 'page', pageId: 'p3' },
          },
        ],
      },
      { id: 'p2', title: '', description: '', rules: [] },
      { id: 'p3', title: '', description: '', rules: [] },
    ]
    const days = { ...createField('checkbox', 'p1'), id: 'days', options: ['Sat', 'Sun'] }
    const rows = computePageFunnel(
      checkboxPages,
      [days],
      [submission({ answers: [answer('days', 'Sat, Sun')] })],
      1,
    )

    expect(rows.map((row) => row.reached)).toEqual([1, 0, 1])
  })
})
