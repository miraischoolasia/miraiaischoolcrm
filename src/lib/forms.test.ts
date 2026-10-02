import { describe, expect, it } from 'vitest'
import {
  buildEmbedCode,
  getFormTitle,
  buildPreviewUrl,
  clampImageWidth,
  isDisplayField,
  readPreviewDraft,
  savePreviewDraft,
  getImageFileProblem,
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
  isClosedByDeadline,
  isValidEmail,
  isoToLocalInput,
  localInputToIso,
  mapPublicForm,
  mapSubmissionRow,
  splitEmailList,
  moveField,
  normalizeFields,
  normalizeSettings,
  getPhoneBoxText,
  toMalaysianLocalPart,
  toMalaysianPhone,
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
      status: 'completed',
      last_page: null,
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
        status: 'completed',
        last_page: null,
        created_at: '2026-10-01T00:00:00Z',
      }),
      mapSubmissionRow({
        id: 2,
        form_id: 'f1',
        answers: [{ id: 'a', label: 'Name', value: 'Lim, Ken' }],
        lead_id: null,
        lead_was_existing: false,
        status: 'completed',
        last_page: null,
        created_at: '2026-10-02T00:00:00Z',
      }),
    ]
    const lines = buildSubmissionsCsv(submissions, new Map([['f1', 'Contact']]))
      .trim()
      .split('\r\n')
    expect(lines[0]).toBe('Submitted,Form,Status,Source,Medium,Campaign,Name,Phone')
    expect(lines[1]).toBe(
      '2026-10-01T00:00:00Z,Contact,Completed,Direct,,,"\'=HYPERLINK(""x"")",+60 12-345',
    )
    expect(lines[2]).toBe('2026-10-02T00:00:00Z,Contact,Completed,Direct,,,"Lim, Ken",')
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

describe('image fields', () => {
  const poster = { ...createField('image'), label: 'Poster', imageUrl: 'https://img.test/p.png' }

  it('start empty, never required and never filling a lead column', () => {
    expect(createField('image')).toMatchObject({ imageUrl: '', required: false, mapTo: null })
    expect(getLeadMapOptionsFor('image')).toEqual([])
  })

  it('need an image before the form can be saved, but no label', () => {
    expect(getFormProblem('F', [...createStarterFields(), poster])).toBeNull()
    expect(getFormProblem('F', [{ ...poster, imageUrl: '' }])).toMatch(/no image/)
    expect(getFormProblem('F', [{ ...poster, imageUrl: 'javascript:alert(1)' }])).toMatch(/no image/)
    expect(getFormProblem('F', [{ ...poster, label: '' }, ...createStarterFields()])).toBeNull()
  })

  it('are skipped when checking answers', () => {
    expect(validateAnswers([{ ...poster, required: true }], {})).toEqual({})
  })

  it('keep their picture when read back, and other fields never get one', () => {
    const [image, text] = normalizeFields([
      { id: 'i', type: 'image', label: 'Poster', imageUrl: 'https://img.test/p.png', mapTo: 'notes' },
      { id: 't', type: 'short_text', label: 'Name', imageUrl: 'https://img.test/x.png' },
    ])
    expect(image).toMatchObject({ imageUrl: 'https://img.test/p.png', mapTo: null })
    expect(text.imageUrl).toBe('')
  })

  it('accepts only PNG, JPG, WebP and GIF files up to 5 MB', () => {
    expect(getImageFileProblem({ type: 'image/png', size: 1000 })).toBeNull()
    expect(getImageFileProblem({ type: 'image/webp', size: 5 * 1024 * 1024 })).toBeNull()
    expect(getImageFileProblem({ type: 'image/svg+xml', size: 1000 })).toMatch(/PNG/)
    expect(getImageFileProblem({ type: 'application/pdf', size: 1000 })).toMatch(/PNG/)
    expect(getImageFileProblem({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/)
  })
})

describe('text blocks and poster size', () => {
  const text = { ...createField('text_block'), content: 'Hello' }

  it('are display-only: never required, never mapped, never validated', () => {
    expect(isDisplayField('text_block')).toBe(true)
    expect(isDisplayField('image')).toBe(true)
    expect(isDisplayField('short_text')).toBe(false)
    expect(createField('text_block')).toMatchObject({ required: false, mapTo: null })
    expect(createField('text_block').content).not.toBe('')
    expect(getLeadMapOptionsFor('text_block')).toEqual([])
    expect(validateAnswers([{ ...text, required: true }], {})).toEqual({})
  })

  it('need some text before the form can be saved, but no label', () => {
    expect(getFormProblem('F', [...createStarterFields(), text])).toBeNull()
    expect(getFormProblem('F', [{ ...text, content: '  \n ' }])).toMatch(/text block is empty/)
    expect(getFormProblem('F', [{ ...text, content: 'x'.repeat(4001) }])).toMatch(/4000/)
    expect(getFormProblem('F', [{ ...text, label: '' }, ...createStarterFields()])).toBeNull()
  })

  it('keep their text and look when read back, and other fields never get them', () => {
    const [block, plain] = normalizeFields([
      { id: 't', type: 'text_block', content: 'Hi', textStyle: 'heading', required: true, mapTo: 'notes' },
      { id: 'n', type: 'short_text', label: 'Name', content: 'sneaky', imageUrl: 'https://x.test/a.png' },
    ])
    expect(block).toMatchObject({ content: 'Hi', textStyle: 'heading', required: false, mapTo: null })
    expect(plain).toMatchObject({ content: '', imageUrl: '' })
  })

  it('keep the poster width in range, in steps of 5, with a safe default', () => {
    expect(clampImageWidth(60)).toBe(60)
    expect(clampImageWidth(62)).toBe(60)
    expect(clampImageWidth(3)).toBe(25)
    expect(clampImageWidth(900)).toBe(100)
    expect(clampImageWidth(undefined)).toBe(100)
    expect(clampImageWidth('50')).toBe(100)
    expect(createField('image')).toMatchObject({ imageWidth: 100, imageAlign: 'center' })
  })

  it('read the poster size and side back, falling back for bad values', () => {
    const [good, bad] = normalizeFields([
      { id: 'a', type: 'image', imageUrl: 'https://x.test/a.png', imageWidth: 50, imageAlign: 'right' },
      { id: 'b', type: 'image', imageUrl: 'https://x.test/b.png', imageWidth: 'wide', imageAlign: 'diagonal' },
    ])
    expect(good).toMatchObject({ imageWidth: 50, imageAlign: 'right' })
    expect(bad).toMatchObject({ imageWidth: 100, imageAlign: 'center' })
  })
})

describe('preview drafts', () => {
  it('builds a preview address from the form id', () => {
    expect(buildPreviewUrl('https://crm.test', 'abc')).toBe('https://crm.test/?form=abc&preview=1')
  })

  it('hands the unsaved form to the preview tab and reads it back', () => {
    window.localStorage.clear()
    const fields = [...createStarterFields(), { ...createField('text_block'), content: 'Details' }]
    expect(savePreviewDraft('f1', { name: 'Draft', fields, settings: defaultFormSettings })).toBe(true)

    const draft = readPreviewDraft('f1')
    expect(draft).toMatchObject({ id: 'f1', name: 'Draft' })
    expect(draft?.fields).toHaveLength(6)
    expect(draft?.fields.at(-1)).toMatchObject({ type: 'text_block', content: 'Details' })
  })

  it('finds no draft for another form or after the data is damaged', () => {
    window.localStorage.clear()
    expect(readPreviewDraft('nope')).toBeNull()
    window.localStorage.setItem('mirai-form-preview-bad', '{not json')
    expect(readPreviewDraft('bad')).toBeNull()
  })
})

describe('form title', () => {
  it('is what visitors see, falling back to the form name when none is written', () => {
    expect(getFormTitle('Eduhero 2', { title: '' })).toBe('Eduhero 2')
    expect(getFormTitle('Eduhero 2', { title: '   ' })).toBe('Eduhero 2')
    expect(getFormTitle('Eduhero 2', { title: 'Free AI Class' })).toBe('Free AI Class')
  })

  it('is read from saved settings, empty for forms saved before it existed', () => {
    expect(normalizeSettings({ title: 'Free AI Class' }).title).toBe('Free AI Class')
    expect(normalizeSettings({}).title).toBe('')
    expect(normalizeSettings({ title: 42 }).title).toBe('')
  })
})

describe('closing a form and alerts', () => {
  const fields = createStarterFields()

  it('reads the saved settings and drops anything that is not valid', () => {
    expect(
      normalizeSettings({
        closesAt: '2026-10-20T04:00:00Z',
        maxSubmissions: 30,
        closedMessage: 'Full house!',
        notifyEmails: ['Boss@Example.com', 'not an email', 'boss@example.com', 5],
      }),
    ).toMatchObject({
      closesAt: '2026-10-20T04:00:00.000Z',
      maxSubmissions: 30,
      closedMessage: 'Full house!',
      // One valid address, once.
      notifyEmails: ['Boss@Example.com'],
    })

    expect(
      normalizeSettings({ closesAt: 'soon', maxSubmissions: 0, notifyEmails: 'a@b.co' }),
    ).toMatchObject({ closesAt: '', maxSubmissions: null, notifyEmails: [] })
    expect(normalizeSettings({ maxSubmissions: 2.5 }).maxSubmissions).toBeNull()
    expect(normalizeSettings(undefined)).toMatchObject({
      closesAt: '',
      maxSubmissions: null,
      closedMessage: '',
      notifyEmails: [],
    })
  })

  it('keeps at most five alert addresses', () => {
    const many = Array.from({ length: 8 }, (_, index) => `p${index}@example.com`)
    expect(normalizeSettings({ notifyEmails: many }).notifyEmails).toHaveLength(5)
  })

  it('tells the admin what is wrong with the closing and alert settings', () => {
    const settings = defaultFormSettings
    expect(getFormProblem('F', fields, { ...settings, maxSubmissions: 0 })).toMatch(/limit on submissions/)
    expect(getFormProblem('F', fields, { ...settings, maxSubmissions: 1.5 })).toMatch(/limit on submissions/)
    expect(getFormProblem('F', fields, { ...settings, closesAt: 'nonsense' })).toMatch(/close the form/)
    expect(getFormProblem('F', fields, { ...settings, notifyEmails: ['a@b.co', 'oops'] })).toMatch(
      /"oops" is not a valid email/,
    )
    expect(
      getFormProblem('F', fields, {
        ...settings,
        notifyEmails: Array.from({ length: 6 }, (_, index) => `p${index}@example.com`),
      }),
    ).toMatch(/at most 5/)
    expect(
      getFormProblem('F', fields, {
        ...settings,
        closesAt: '2030-01-01T00:00:00.000Z',
        maxSubmissions: 30,
        notifyEmails: ['a@b.co'],
      }),
    ).toBeNull()
  })

  it('splits a typed list of emails and keeps the wrong ones so they can be reported', () => {
    expect(splitEmailList('a@b.co, c@d.co;  e@f.co\ng@h.co, a@b.co')).toEqual([
      'a@b.co',
      'c@d.co',
      'e@f.co',
      'g@h.co',
    ])
    expect(splitEmailList('a@b.co, oops')).toEqual(['a@b.co', 'oops'])
    expect(splitEmailList('  ')).toEqual([])
    expect(isValidEmail(' a@b.co ')).toBe(true)
    expect(isValidEmail('a@b')).toBe(false)
  })

  it('moves a closing time between the date box and one exact moment', () => {
    // A time typed in the admin's own zone comes back unchanged.
    const iso = localInputToIso('2026-10-20T18:30')
    expect(new Date(iso).getHours()).toBe(18)
    expect(isoToLocalInput(iso)).toBe('2026-10-20T18:30')
    expect(localInputToIso('')).toBe('')
    expect(isoToLocalInput('')).toBe('')
    expect(isoToLocalInput('garbage')).toBe('')
  })

  it('knows when the deadline has passed', () => {
    const now = Date.parse('2026-10-20T00:00:00Z')
    expect(isClosedByDeadline({ closesAt: '2026-10-19T00:00:00Z' }, now)).toBe(true)
    expect(isClosedByDeadline({ closesAt: '2026-10-20T00:00:00Z' }, now)).toBe(true)
    expect(isClosedByDeadline({ closesAt: '2026-10-21T00:00:00Z' }, now)).toBe(false)
    expect(isClosedByDeadline({ closesAt: '' }, now)).toBe(false)
  })

  it('reads why the public page is closed and whether alerts are on', () => {
    const base = { id: 'f1', name: 'F', fields: [], settings: {} }
    expect(mapPublicForm({ ...base, notify: true, closedReason: 'full' })).toMatchObject({
      notify: true,
      closedReason: 'full',
    })
    expect(mapPublicForm({ ...base, closedReason: 'deadline' })?.closedReason).toBe('deadline')
    expect(mapPublicForm({ ...base, closedReason: 'whatever' })).toMatchObject({
      notify: false,
      closedReason: null,
    })
  })
})

describe('where a submission came from', () => {
  const row = {
    id: 1,
    form_id: 'f1',
    answers: [],
    lead_id: null,
    lead_was_existing: false,
    status: 'completed',
    last_page: null,
    created_at: '2026-10-01T00:00:00Z',
  }

  it('reads the saved tracking, and nothing when it is empty or missing', () => {
    expect(
      mapSubmissionRow({ ...row, tracking: { source: 'facebook', campaign: 'spring' } }).tracking,
    ).toEqual({ source: 'facebook', medium: '', campaign: 'spring', content: '', referrer: '' })
    expect(mapSubmissionRow({ ...row, tracking: {} }).tracking).toBeNull()
    expect(mapSubmissionRow({ ...row, tracking: null }).tracking).toBeNull()
    expect(mapSubmissionRow(row).tracking).toBeNull()
  })

  it('goes into the export as source, medium and campaign', () => {
    const submission = mapSubmissionRow({
      ...row,
      tracking: { source: 'facebook', medium: 'cpc', campaign: 'spring' },
    })
    const lines = buildSubmissionsCsv([submission], new Map([['f1', 'Contact']]))
      .trim()
      .split('\r\n')
    expect(lines[1]).toBe('2026-10-01T00:00:00Z,Contact,Completed,facebook,cpc,spring')
  })

  it('has the embed code hand the website page campaign parts on to the form', () => {
    const code = buildEmbedCode('https://crm.test/?form=abc', 'abc', 'Hi')
    expect(code).toContain('utm_source')
    expect(code).toContain('utm_campaign')
    expect(code).toContain('f.src=u.href')
    expect(code).toContain('mirai-form-height')
    // Still one iframe followed by one script.
    expect(code.match(/<iframe/g)).toHaveLength(1)
    expect(code.match(/<script>/g)).toHaveLength(1)
  })
})

describe('Malaysian phone numbers', () => {
  it('keeps only the digits after +60, without a leading 0', () => {
    expect(toMalaysianLocalPart('12-345 6789')).toBe('123456789')
    expect(toMalaysianLocalPart('012-345 6789')).toBe('123456789')
    expect(toMalaysianLocalPart('+60 12-345 6789')).toBe('123456789')
    expect(toMalaysianLocalPart('60123456789')).toBe('123456789')
    expect(toMalaysianLocalPart('abc')).toBe('')
    expect(toMalaysianLocalPart('0')).toBe('')
    expect(toMalaysianLocalPart('1234567890123')).toBe('1234567890')
  })

  it('does not mistake a number that begins with 60 for a country code while it is typed', () => {
    expect(toMalaysianLocalPart('60')).toBe('60')
    expect(toMalaysianLocalPart('6012')).toBe('6012')
  })

  it('keeps the answer with the code, and nothing for an empty box', () => {
    expect(toMalaysianPhone('012-345 6789')).toBe('+60123456789')
    expect(toMalaysianPhone('')).toBe('')
    expect(toMalaysianPhone('0')).toBe('')
  })

  it('shows a kept answer without the code', () => {
    expect(getPhoneBoxText('+60123456789')).toBe('123456789')
    expect(getPhoneBoxText('012-345 6789')).toBe('123456789')
    expect(getPhoneBoxText('')).toBe('')
  })

  it('wants 8 to 10 digits after +60, but leaves other numbers alone', () => {
    const phone = { ...createField('phone'), id: 'p' }
    expect(validateAnswers([phone], { p: '+60123456789' })).toEqual({})
    expect(validateAnswers([phone], { p: '+6038765432' })).toEqual({})
    expect(validateAnswers([phone], { p: '+60123' })).toHaveProperty('p')
    expect(validateAnswers([phone], { p: '+60123456789012' })).toHaveProperty('p')
    expect(validateAnswers([phone], { p: '+65 9123 4567' })).toEqual({})
  })
})
