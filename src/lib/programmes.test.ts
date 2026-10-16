import { describe, expect, it } from 'vitest'
import {
  activeProgrammes,
  DEFAULT_MESSAGE_TEMPLATE,
  fillTemplate,
  programmeOf,
  sampleValues,
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
