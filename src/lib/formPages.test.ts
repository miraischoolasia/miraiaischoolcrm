import { describe, expect, it } from 'vitest'
import {
  computeRoute,
  createRule,
  filterAnswersToPages,
  getNextStep,
  getPageFields,
  getPagesProblem,
  getRuleFieldChoices,
  normalizePages,
  orderFieldsByPages,
  removeRulesForField,
  removeRulesForPage,
  replacePageFields,
  ruleMatches,
} from './formPages'
import { createField, defaultFormSettings, getFormProblem, mapPublicForm, normalizeFormContent } from './forms'
import type { FormField, FormPage, FormRule } from '../types/domain'

const end = { type: 'end', ending: 'default', message: '', redirectUrl: '' } as const

function rule(id: string, fieldId: string, op: FormRule['op'], value: string, action: FormRule['action']): FormRule {
  return { id, fieldId, op, value, action }
}

// The same survey the database tests use (supabase form_visited_pages), so the
// browser and the server are checked against one set of expectations.
const goal: FormField = { ...createField('radio', 'p1'), id: 'goal', label: 'Goal', options: ['Coding', 'Robotics', 'Other'], required: true }
const level: FormField = { ...createField('dropdown', 'p2'), id: 'lvl', label: 'Level', options: ['Beginner', 'Advanced'] }
const days: FormField = { ...createField('checkbox', 'p3'), id: 'days', label: 'Days', options: ['Sat', 'Sun'] }
const note: FormField = { ...createField('long_text', 'p4'), id: 'note', label: 'Anything else' }
const name: FormField = { ...createField('short_text', 'p1'), id: 'name', label: 'Parent' }
const fields = [name, goal, level, days, note]

const pages: FormPage[] = [
  {
    id: 'p1',
    title: 'About you',
    description: '',
    rules: [
      rule('r1', 'goal', 'is', 'Other', { type: 'end', ending: 'message', message: 'Sorry', redirectUrl: '' }),
      rule('r2', 'goal', 'is', 'Robotics', { type: 'page', pageId: 'p3' }),
    ],
  },
  { id: 'p2', title: 'Level', description: '', rules: [rule('r3', 'lvl', 'is', 'Advanced', { type: 'page', pageId: 'p4' })] },
  {
    id: 'p3',
    title: 'Schedule',
    description: '',
    rules: [
      rule('r4', 'days', 'includes', 'Sun', { type: 'page', pageId: 'p4' }),
      rule('r5', 'days', 'excludes', 'Sat', { type: 'page', pageId: 'p1' }),
    ],
  },
  { id: 'p4', title: 'Last', description: '', rules: [] },
]

describe('computeRoute', () => {
  it('goes page by page when no rule matches', () => {
    expect(computeRoute(pages, { goal: 'Coding' }).visited).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('jumps forward when a rule matches, skipping the pages in between', () => {
    expect(computeRoute(pages, { goal: 'Coding', lvl: 'Advanced' }).visited).toEqual(['p1', 'p2', 'p4'])
    expect(computeRoute(pages, { goal: 'Robotics' }).visited).toEqual(['p1', 'p3', 'p4'])
  })

  it('checks rules top to bottom, and the first match wins', () => {
    expect(computeRoute(pages, { goal: 'Robotics', days: ['Sun'] }).visited).toEqual(['p1', 'p3', 'p4'])
  })

  it('ignores a rule that would jump back, and carries on to the next page', () => {
    expect(computeRoute(pages, { goal: 'Robotics', days: [] }).visited).toEqual(['p1', 'p3', 'p4'])
    expect(computeRoute(pages, { goal: 'Robotics', days: ['Sat'] }).visited).toEqual(['p1', 'p3', 'p4'])
  })

  it('ends the form where a rule says, with that rule\'s own ending', () => {
    const route = computeRoute(pages, { goal: 'Other' })
    expect(route.visited).toEqual(['p1'])
    expect(route.ending).toMatchObject({ ending: 'message', message: 'Sorry' })
  })

  it('treats an end rule with the usual ending as the usual ending', () => {
    const route = computeRoute([{ ...pages[0], rules: [rule('x', 'goal', 'is', 'Other', end)] }, pages[1]], { goal: 'Other' })
    expect(route.visited).toEqual(['p1'])
    expect(route.ending).toBeNull()
  })

  it('walks a single page, and an empty list of pages, without trouble', () => {
    expect(computeRoute([pages[3]], {}).visited).toEqual(['p4'])
    expect(computeRoute([], {})).toEqual({ visited: [], ending: null })
  })

  it('cannot loop, because it only ever moves forward', () => {
    const looping: FormPage[] = [
      { id: 'a', title: '', description: '', rules: [rule('1', 'goal', 'is', 'Coding', { type: 'page', pageId: 'b' })] },
      { id: 'b', title: '', description: '', rules: [rule('2', 'goal', 'is', 'Coding', { type: 'page', pageId: 'a' })] },
    ]
    expect(computeRoute(looping, { goal: 'Coding' }).visited).toEqual(['a', 'b'])
  })
})

describe('ruleMatches', () => {
  const r = (op: FormRule['op']) => rule('r', 'q', op, 'A', end)

  it('compares single answers with is / is not', () => {
    expect(ruleMatches(r('is'), { q: 'A' })).toBe(true)
    expect(ruleMatches(r('is'), { q: 'B' })).toBe(false)
    expect(ruleMatches(r('is'), {})).toBe(false)
    expect(ruleMatches(r('is_not'), { q: 'B' })).toBe(true)
    expect(ruleMatches(r('is_not'), {})).toBe(true)
    expect(ruleMatches(r('is_not'), { q: 'A' })).toBe(false)
  })

  it('looks inside multiple answers with includes / does not include', () => {
    expect(ruleMatches(r('includes'), { q: ['A', 'B'] })).toBe(true)
    expect(ruleMatches(r('includes'), { q: ['B'] })).toBe(false)
    expect(ruleMatches(r('includes'), {})).toBe(false)
    expect(ruleMatches(r('excludes'), { q: ['B'] })).toBe(true)
    expect(ruleMatches(r('excludes'), {})).toBe(true)
    expect(ruleMatches(r('excludes'), { q: ['A'] })).toBe(false)
  })
})

describe('getNextStep', () => {
  it('says what follows a page: another page, the end, or the submit', () => {
    expect(getNextStep(pages, 0, { goal: 'Coding' })).toEqual({ kind: 'page', index: 1 })
    expect(getNextStep(pages, 0, { goal: 'Robotics' })).toEqual({ kind: 'page', index: 2 })
    expect(getNextStep(pages, 0, { goal: 'Other' })).toMatchObject({ kind: 'end' })
    expect(getNextStep(pages, 3, {})).toEqual({ kind: 'submit' })
  })
})

describe('filterAnswersToPages', () => {
  it('keeps only answers to questions on the pages that were visited, extra children included', () => {
    const child = { ...createField('short_text', 'p2'), id: 'kid', mapTo: 'child_name' as const }
    const all = [...fields, child]
    const answers = { name: 'A', goal: 'Robotics', lvl: 'Beginner', days: ['Sat'], 'kid#2': 'Mei', note: 'x' }
    expect(filterAnswersToPages(all, ['p1', 'p3', 'p4'], answers)).toEqual({
      name: 'A',
      goal: 'Robotics',
      days: ['Sat'],
      note: 'x',
    })
    expect(filterAnswersToPages(all, ['p1', 'p2'], answers)).toEqual({
      name: 'A',
      goal: 'Robotics',
      lvl: 'Beginner',
      'kid#2': 'Mei',
    })
  })
})

describe('page helpers', () => {
  it('keeps every page\'s fields together, in page order', () => {
    const next = replacePageFields(fields, pages, 'p1', [goal, name])
    expect(next.map((field) => field.id)).toEqual(['goal', 'name', 'lvl', 'days', 'note'])
    expect(orderFieldsByPages([note, level, goal, name], pages).map((field) => field.id)).toEqual(['goal', 'name', 'lvl', 'note'])
    expect(getPageFields(fields, 'p1').map((field) => field.id)).toEqual(['name', 'goal'])
  })

  it('offers only choice questions from this page and the pages before it', () => {
    expect(getRuleFieldChoices(pages, fields, 0).map((field) => field.id)).toEqual(['goal'])
    expect(getRuleFieldChoices(pages, fields, 2).map((field) => field.id)).toEqual(['goal', 'lvl', 'days'])
  })

  it('starts a new rule on the first question, jumping to the next page', () => {
    expect(createRule(pages, fields, 0)).toMatchObject({
      fieldId: 'goal',
      op: 'is',
      value: 'Coding',
      action: { type: 'page', pageId: 'p2' },
    })
    expect(createRule(pages, fields, 3)).toMatchObject({ action: { type: 'end', ending: 'default' } })
    expect(createRule([pages[3]], [note], 0)).toBeNull()
  })

  it('removes the rules that pointed at a deleted page or question', () => {
    const withoutP3 = removeRulesForPage(pages, 'p3')
    expect(withoutP3.map((page) => page.id)).toEqual(['p1', 'p2', 'p4'])
    expect(withoutP3[0].rules.map((r) => r.id)).toEqual(['r1'])
    expect(removeRulesForField(pages, 'days')[2].rules).toEqual([])
    expect(removeRulesForField(pages, 'goal')[0].rules).toEqual([])
  })
})

describe('getPagesProblem', () => {
  // The survey above, without the rule that (deliberately) points backwards.
  const clean: FormPage[] = pages.map((page) => (page.id === 'p3' ? { ...page, rules: page.rules.slice(0, 1) } : page))

  it('accepts the survey above', () => {
    expect(getPagesProblem(clean, fields)).toBeNull()
  })

  it('wants every page to have a field', () => {
    expect(getPagesProblem([...clean, { id: 'p5', title: 'Empty', description: '', rules: [] }], fields)).toMatch(
      /Page 5: Empty has no fields/,
    )
  })

  it('rejects a rule that reads a question from a later page, or one that is gone', () => {
    const early = [{ ...clean[0], rules: [rule('x', 'lvl', 'is', 'Advanced', end)] }, ...clean.slice(1)]
    expect(getPagesProblem(early, fields)).toMatch(/gone or comes later/)
    const gone = [{ ...clean[0], rules: [rule('x', 'nope', 'is', 'A', end)] }, ...clean.slice(1)]
    expect(getPagesProblem(gone, fields)).toMatch(/gone or comes later/)
  })

  it('rejects an option that no longer exists, and an operator that does not fit', () => {
    const stale = [{ ...clean[0], rules: [rule('x', 'goal', 'is', 'Maths', end)] }, ...clean.slice(1)]
    expect(getPagesProblem(stale, fields)).toMatch(/no longer exists/)
    const wrongOp = [{ ...clean[0], rules: [rule('x', 'goal', 'includes', 'Coding', end)] }, ...clean.slice(1)]
    expect(getPagesProblem(wrongOp, fields)).toMatch(/does not fit/)
  })

  it('rejects a jump to the same or an earlier page', () => {
    const back = [clean[0], { ...clean[1], rules: [rule('x', 'goal', 'is', 'Coding', { type: 'page', pageId: 'p1' })] }, ...clean.slice(2)]
    expect(getPagesProblem(back, fields)).toMatch(/later page/)
  })

  it('wants a full web address when a rule ends the form by sending people elsewhere', () => {
    const redirect = (url: string) => [
      { ...clean[0], rules: [rule('x', 'goal', 'is', 'Other', { type: 'end', ending: 'redirect', message: '', redirectUrl: url })] },
      ...clean.slice(1),
    ]
    expect(getPagesProblem(redirect('thanks'), fields)).toMatch(/web address/)
    expect(getPagesProblem(redirect('https://mirai.my/no'), fields)).toBeNull()
  })

  it('is part of whether the form can be saved', () => {
    const settings = { ...defaultFormSettings, pages: [{ ...clean[0], rules: [rule('x', 'goal', 'is', 'Maths', end)] }, ...clean.slice(1)] }
    expect(getFormProblem('Survey', fields, settings)).toMatch(/no longer exists/)
    expect(getFormProblem('Survey', fields, { ...defaultFormSettings, pages: clean })).toBeNull()
  })
})

describe('reading saved pages', () => {
  it('gives a form saved before pages existed one page holding everything', () => {
    const { fields: read, settings } = normalizeFormContent(
      [{ id: 'a', type: 'short_text', label: 'Name' }, { id: 'b', type: 'phone', label: 'Phone' }],
      { submitLabel: 'Go' },
    )
    expect(settings.pages).toHaveLength(1)
    expect(read.every((field) => field.pageId === settings.pages[0].id)).toBe(true)
  })

  it('moves a field on a page that is gone to the first page', () => {
    const { fields: read, settings } = normalizeFormContent(
      [{ id: 'a', type: 'short_text', label: 'Name', pageId: 'gone' }, { id: 'b', type: 'phone', label: 'Phone', pageId: 'p2' }],
      { pages: [{ id: 'p1' }, { id: 'p2' }] },
    )
    expect(settings.pages.map((page) => page.id)).toEqual(['p1', 'p2'])
    expect(read.map((field) => field.pageId)).toEqual(['p1', 'p2'])
  })

  it('drops damaged pages and rules instead of failing', () => {
    const read = normalizePages([
      'junk',
      { title: 'no id' },
      {
        id: 'p1',
        title: 'Good',
        rules: [
          { fieldId: 'goal', op: 'is', value: 'A', action: { type: 'page', pageId: 'p2' } },
          { fieldId: 'goal', op: 'sideways', value: 'A', action: { type: 'page', pageId: 'p2' } },
          { fieldId: 'goal', op: 'is', value: 'A', action: { type: 'teleport' } },
        ],
      },
    ])
    expect(read).toHaveLength(1)
    expect(read[0].rules).toHaveLength(1)
    expect(read[0].rules[0].id).toMatch(/^rule_/)
  })

  it('reads the public form with its pages', () => {
    const form = mapPublicForm({ id: 'f', name: 'S', fields, settings: { pages } })
    expect(form?.settings.pages).toHaveLength(4)
    expect(form?.fields.find((field) => field.id === 'lvl')?.pageId).toBe('p2')
  })
})
