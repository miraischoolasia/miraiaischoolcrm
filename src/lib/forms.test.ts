import { describe, expect, it } from 'vitest'
import {
  buildEmbedCode,
  buildFormUrl,
  childAnswerKey,
  defaultFormSettings,
  formatConversionRate,
  getChildFields,
  getSlugProblem,
  isSafeRedirectUrl,
  slugify,
  suggestSlug,
  buildSubmissionsCsv,
  createField,
  createStarterFields,
  getFormProblem,
  getLeadMapOptionsFor,
  insertField,
  mapSubmissionRow,
  moveField,
  normalizeFields,
  normalizeSettings,
  validateAnswers,
} from './forms'
import type { FormField } from '../types/domain'

const labels = (fields: FormField[]) => fields.map((field) => field.label)

function named(label: string): FormField {
  return { ...createField('short_text'), label }
}

describe('moving fields', () => {
  const fields = [named('A'), named('B'), named('C')]

  it('drops a field below a later one', () => {
    expect(labels(moveField(fields, 0, 3))).toEqual(['B', 'C', 'A'])
    expect(labels(moveField(fields, 0, 2))).toEqual(['B', 'A', 'C'])
  })

  it('drops a field above an earlier one', () => {
    expect(labels(moveField(fields, 2, 0))).toEqual(['C', 'A', 'B'])
  })

  it('leaves the order alone when dropped where it already is', () => {
    expect(moveField(fields, 1, 1)).toBe(fields)
    expect(moveField(fields, 1, 2)).toBe(fields)
  })

  it('inserts a new field at a slot', () => {
    expect(labels(insertField(fields, named('X'), 1))).toEqual(['A', 'X', 'B', 'C'])
    expect(labels(insertField(fields, named('X'), 99))).toEqual(['A', 'B', 'C', 'X'])
  })
})

describe('getFormProblem', () => {
  it('accepts the starter fields', () => {
    expect(getFormProblem('Contact', createStarterFields())).toBeNull()
  })

  it('wants a name, a field and a label on each field', () => {
    expect(getFormProblem(' ', createStarterFields())).toMatch(/name/)
    expect(getFormProblem('Contact', [])).toMatch(/at least one field/)
    expect(getFormProblem('Contact', [{ ...createField('short_text'), label: ' ' }])).toMatch(/label/)
  })

  it('rejects empty or repeated options', () => {
    const dropdown = createField('dropdown')
    expect(getFormProblem('F', [{ ...dropdown, options: [] }])).toMatch(/option/)
    expect(getFormProblem('F', [{ ...dropdown, options: ['A', ' '] }])).toMatch(/option/)
    expect(getFormProblem('F', [{ ...dropdown, options: ['A', 'a'] }])).toMatch(/twice/)
  })

  it('lets only one field fill each lead column, except notes', () => {
    const two = [
      { ...named('One'), mapTo: 'parent_name' as const },
      { ...named('Two'), mapTo: 'parent_name' as const },
    ]
    expect(getFormProblem('F', two)).toMatch(/Only one field/)
    const notes = two.map((field) => ({ ...field, mapTo: 'notes' as const }))
    expect(getFormProblem('F', notes)).toBeNull()
  })
})

describe('lead column choices', () => {
  it('offers only columns that fit the field type', () => {
    expect(getLeadMapOptionsFor('phone').map((option) => option.value)).toEqual([
      'phone',
      'child_phone',
      'notes',
    ])
    expect(getLeadMapOptionsFor('number').map((option) => option.value)).toEqual([
      'child_age',
      'notes',
    ])
    expect(getLeadMapOptionsFor('dropdown').map((option) => option.value)).toEqual(['notes'])
  })
})

describe('validateAnswers', () => {
  const email = { ...createField('email'), required: true }
  const phone = createField('phone')
  const count = createField('number')

  it('requires required fields, counting a blank as missing', () => {
    expect(validateAnswers([email], { [email.id]: '  ' })).toHaveProperty(email.id)
    expect(validateAnswers([email], {})).toHaveProperty(email.id)
  })

  it('checks email, phone and number shapes', () => {
    const answers = { [email.id]: 'nope', [phone.id]: 'abc', [count.id]: '1x' }
    expect(Object.keys(validateAnswers([email, phone, count], answers))).toHaveLength(3)
    const good = { [email.id]: 'a@b.co', [phone.id]: '012-345 6789', [count.id]: '9' }
    expect(validateAnswers([email, phone, count], good)).toEqual({})
  })

  it('does not check optional fields left empty', () => {
    expect(validateAnswers([phone, count], {})).toEqual({})
  })
})

describe('reading saved data', () => {
  it('drops entries that are not real fields', () => {
    const fields = normalizeFields([
      { id: 'a', type: 'phone', label: 'Phone', required: true, mapTo: 'phone' },
      { id: 'b', type: 'hologram', label: 'Nope' },
      'junk',
      { type: 'phone' },
    ])
    expect(fields).toHaveLength(1)
    expect(fields[0]).toMatchObject({ id: 'a', required: true, mapTo: 'phone', options: [] })
  })

  it('fills missing settings with the defaults', () => {
    expect(normalizeSettings(null)).toMatchObject({ submitLabel: 'Submit', createLead: true })
    expect(normalizeSettings({ createLead: false }).createLead).toBe(false)
  })

  it('reads submission answers defensively', () => {
    const submission = mapSubmissionRow({
      id: 1,
      form_id: 'f',
      answers: [{ id: 'a', label: 'Name', value: 'Lim' }, 3],
      lead_id: null,
      lead_was_existing: false,
      created_at: '2026-10-01T00:00:00Z',
    })
    expect(submission.answers).toEqual([{ id: 'a', label: 'Name', value: 'Lim' }])
  })
})

describe('exporting', () => {
  it('writes one column per answered field and guards against formulas', () => {
    const submissions = [
      mapSubmissionRow({
        id: 1,
        form_id: 'f1',
        answers: [
          { id: 'a', label: 'Name', value: '=HYPERLINK("x")' },
          { id: 'b', label: 'Phone', value: '+60 12-345' },
        ],
        lead_id: 3,
        lead_was_existing: false,
        created_at: '2026-10-01T00:00:00Z',
      }),
      mapSubmissionRow({
        id: 2,
        form_id: 'f1',
        answers: [{ id: 'a', label: 'Name', value: 'Lim, Ken' }],
        lead_id: null,
        lead_was_existing: false,
        created_at: '2026-10-02T00:00:00Z',
      }),
    ]
    const lines = buildSubmissionsCsv(submissions, new Map([['f1', 'Contact']]))
      .trim()
      .split('\r\n')
    expect(lines[0]).toBe('Submitted,Form,Name,Phone')
    expect(lines[1]).toBe('2026-10-01T00:00:00Z,Contact,"\'=HYPERLINK(""x"")",+60 12-345')
    expect(lines[2]).toBe('2026-10-02T00:00:00Z,Contact,"Lim, Ken",')
  })

  it('builds an iframe that listens for the form height', () => {
    const code = buildEmbedCode('https://crm.test/?form=abc', 'abc', 'Say "hi"')
    expect(code).toContain('src="https://crm.test/?form=abc"')
    expect(code).toContain('title="Say &quot;hi&quot;"')
    expect(code).toContain('mirai-form-height')
  })
})

describe('starter fields', () => {
  it('cover what a lead needs, in order, with the required ones marked', () => {
    const fields = createStarterFields()
    expect(fields.map((field) => [field.label, field.mapTo, field.required])).toEqual([
      ["Parent's name", 'parent_name', true],
      ["Child's name", 'child_name', true],
      ['Phone number', 'phone', true],
      ["Child's phone number", 'child_phone', false],
      ["Child's age", 'child_age', true],
    ])
    expect(getFormProblem('Trial', fields)).toBeNull()
  })
})

describe('after sending', () => {
  const fields = createStarterFields()

  it('needs a real web address when the form redirects', () => {
    const redirect = { ...defaultFormSettings, afterSubmit: 'redirect' as const }
    expect(getFormProblem('F', fields, { ...redirect, redirectUrl: '' })).toMatch(/web address/)
    expect(getFormProblem('F', fields, { ...redirect, redirectUrl: 'thank-you' })).toMatch(
      /web address/,
    )
    expect(
      getFormProblem('F', fields, { ...redirect, redirectUrl: 'https://mirai.my/thanks' }),
    ).toBeNull()
  })

  it('ignores the address while the form shows a message', () => {
    expect(getFormProblem('F', fields, { ...defaultFormSettings, redirectUrl: 'junk' })).toBeNull()
  })

  it('only accepts http and https addresses', () => {
    expect(isSafeRedirectUrl('https://a.com/x?y=1')).toBe(true)
    expect(isSafeRedirectUrl(' http://a.com ')).toBe(true)
    expect(isSafeRedirectUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeRedirectUrl('//a.com')).toBe(false)
  })
})

describe('several children', () => {
  const fields = createStarterFields()

  it('finds the questions that describe one child', () => {
    expect(getChildFields(fields).map((field) => field.mapTo)).toEqual([
      'child_name',
      'child_phone',
      'child_age',
    ])
  })

  it('keys the first child by the field id and the others with a number', () => {
    expect(childAnswerKey('f_a', 1)).toBe('f_a')
    expect(childAnswerKey('f_a', 2)).toBe('f_a#2')
  })

  it('needs a child question before more children can be allowed', () => {
    const settings = { ...defaultFormSettings, allowMoreChildren: true }
    expect(getFormProblem('F', fields, settings)).toBeNull()
    expect(getFormProblem('F', [createField('short_text')], settings)).toMatch(/child/)
  })

  it('wants a whole age for the child age field', () => {
    const age = { ...createField('number'), mapTo: 'child_age' as const }
    expect(validateAnswers([age], { [age.id]: '9.5' })).toHaveProperty(age.id)
    expect(validateAnswers([age], { [age.id]: '0' })).toHaveProperty(age.id)
    expect(validateAnswers([age], { [age.id]: '9' })).toEqual({})
  })
})

describe('link names', () => {
  it('turns a form name into a link name', () => {
    expect(slugify('Trial Class - Oct 2026!')).toBe('trial-class-oct-2026')
    expect(slugify('  ')).toBe('')
  })

  it('checks the rules the database enforces', () => {
    expect(getSlugProblem('trial-class')).toBeNull()
    expect(getSlugProblem('ab')).toMatch(/characters/)
    expect(getSlugProblem('Trial')).toMatch(/lower case/)
    expect(getSlugProblem('a--b')).toMatch(/lower case/)
    expect(getSlugProblem('trial-')).toMatch(/lower case/)
    expect(getSlugProblem('12345678-1234-1234-1234-123456789abc')).toMatch(/form id/)
  })

  it('suggests a valid name with a tail, even for a name with no letters', () => {
    expect(getSlugProblem(suggestSlug('Contact Us'))).toBeNull()
    expect(suggestSlug('Contact Us')).toMatch(/^contact-us-[a-z0-9]{4}$/)
    expect(getSlugProblem(suggestSlug('!!!'))).toBeNull()
    expect(getSlugProblem(suggestSlug('x'.repeat(200)))).toBeNull()
  })

  it('builds the public link from the link name', () => {
    expect(buildFormUrl('https://crm.test', 'trial-class')).toBe(
      'https://crm.test/?form=trial-class',
    )
  })
})

describe('conversion', () => {
  it('is submissions over views, and blank without views', () => {
    expect(formatConversionRate(5, 20)).toBe('25%')
    expect(formatConversionRate(0, 10)).toBe('0%')
    expect(formatConversionRate(3, 0)).toBe('-')
    expect(formatConversionRate(9, 4)).toBe('100%')
  })
})
