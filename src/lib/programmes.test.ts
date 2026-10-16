import { describe, expect, it } from 'vitest'
import {
  activeProgrammes,
  categoriesOf,
  DEFAULT_MESSAGE_TEMPLATE,
  fillTemplate,
  groupProgrammes,
  programmeOf,
  sampleValues,
  searchProgrammes,
  type Programme,
  unknownPlaceholders,
  validateProgramme,
  validateStepTitle,
} from './programmes'

describe('fillTemplate', () => {
  it('puts what is saved in the message', () => {
    const text = fillTemplate('Hi, {child} is in {class_time}.', { child: 'Ethan', class_time: 'Sat 10:00' })
    expect(text).toBe('Hi, Ethan is in Sat 10:00.')
  })

  it('leaves out a whole line when something on it is not saved yet', () => {
    const text = fillTemplate('Hello\n\nZoom: {zoom_time}\nLink: {zoom_link}\n\nBye', { zoom_time: 'Fri 20:30' })
    expect(text).toBe('Hello\n\nZoom: Fri 20:30\n\nBye')
  })

  it('does not leave a gap where a line was left out', () => {
    const text = fillTemplate('A\n\n{form_link}\n\nB', {})
    expect(text).toBe('A\n\nB')
  })

  it('keeps a word it does not know as it is', () => {
    expect(fillTemplate('Hi {kid}', {})).toBe('Hi {kid}')
  })

  it('fills the starting message from the sample values', () => {
    const text = fillTemplate(DEFAULT_MESSAGE_TEMPLATE, sampleValues())
    expect(text).toContain('Ethan')
    expect(text).toContain('https://zoom.us/j/123')
    expect(text).not.toContain('{')
  })
})

describe('validateProgramme', () => {
  it('wants a name', () => {
    expect(validateProgramme({ name: '  ', messageTemplate: '' })).toBe('Give the programme a name.')
  })

  it('catches a word the message does not know', () => {
    expect(unknownPlaceholders('Hi {kid} {child}')).toEqual(['{kid}'])
    expect(validateProgramme({ name: 'Maths', messageTemplate: 'Hi {kid}' })).toMatch(/not a word the message knows/)
  })

  it('accepts a name with a good message', () => {
    expect(validateProgramme({ name: 'Maths', messageTemplate: DEFAULT_MESSAGE_TEMPLATE })).toBeNull()
  })
})

describe('validateStepTitle', () => {
  it('wants a name', () => {
    expect(validateStepTitle(' ')).toBe('Give the step a name.')
    expect(validateStepTitle('Placement test')).toBeNull()
  })
})

describe('programmeOf', () => {
  const step = (id: number, programmeId: number, sortOrder: number) => ({
    id,
    programmeId,
    sortOrder,
    kind: 'custom' as const,
    title: `Step ${id}`,
  })

  it('keeps only its own steps, in order', () => {
    const programme = programmeOf(
      { id: 1, name: 'Maths', legacy_key: null, outcome: 'booking', message_template: '', is_active: true, sort_order: 10 },
      [step(3, 1, 20), step(4, 2, 10), step(5, 1, 10)],
    )
    expect(programme.steps.map((entry) => entry.id)).toEqual([5, 3])
  })

  it('offers only the programmes that are on', () => {
    const on = programmeOf(
      { id: 1, name: 'A', legacy_key: null, outcome: 'booking', message_template: '', is_active: true, sort_order: 1 },
      [],
    )
    const off = programmeOf(
      { id: 2, name: 'B', legacy_key: null, outcome: 'booking', message_template: '', is_active: false, sort_order: 2 },
      [],
    )
    expect(activeProgrammes([on, off]).map((entry) => entry.id)).toEqual([1])
  })
})

describe('programme categories', () => {
  const make = (id: number, name: string, category: string | null = null) =>
    ({ id, name, category, legacyKey: null, outcome: 'booking', messageTemplate: '', isActive: true, sortOrder: id * 10, steps: [] }) as Programme

  it('groups by category in the order the school put them, with the rest last under Other', () => {
    const groups = groupProgrammes([make(1, 'A', 'Form 1'), make(2, 'B'), make(3, 'C', 'Form 2'), make(4, 'D', 'form 1 ')])

    expect(groups.map((group) => group.label)).toEqual(['Form 1', 'Form 2', 'Other'])
    expect(groups[0].programmes.map((entry) => entry.name)).toEqual(['A', 'D'])
  })

  it('shows one plain list when no programme has a category', () => {
    expect(groupProgrammes([make(1, 'A'), make(2, 'B')])).toEqual([expect.objectContaining({ label: '' })])
  })

  it('searches the name and the category, every word having to match', () => {
    const list = [make(1, 'Maths', 'Form 1'), make(2, 'Maths', 'Form 2'), make(3, 'Starter kit', 'Products')]

    expect(searchProgrammes(list, 'maths form 2').map((entry) => entry.id)).toEqual([2])
    expect(searchProgrammes(list, 'PRODUCTS').map((entry) => entry.id)).toEqual([3])
    expect(searchProgrammes(list, '')).toHaveLength(3)
  })

  it('lists the categories in use once each, for suggestions', () => {
    expect(categoriesOf([make(1, 'A', 'Form 2'), make(2, 'B', 'form 2'), make(3, 'C', 'Form 1'), make(4, 'D')])).toEqual(['Form 1', 'Form 2'])
  })

  it('limits the length of a category', () => {
    expect(validateProgramme({ name: 'Maths', messageTemplate: '', category: 'x'.repeat(41) })).toMatch(/category can be up to 40/)
  })
})
