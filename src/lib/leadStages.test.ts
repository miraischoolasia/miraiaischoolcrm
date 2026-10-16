import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_STAGES,
  getLeadStages,
  isSettableStage,
  leadStatusOptions,
  setLeadStages,
  stageErrorMessage,
  stageLabel,
  stageOf,
  stageStyle,
  STAGE_COLORS,
  validateStageLabel,
  type LeadStage,
} from './leadStages'

const custom: LeadStage = { key: 'stage_ab12cd34ef', label: 'Placement test', color: 'teal', sortOrder: 35, isActive: true, isSystem: false }

describe('lead stages', () => {
  afterEach(() => setLeadStages(DEFAULT_STAGES))

  it('starts with the six the CRM was made with', () => {
    expect(leadStatusOptions.map((stage) => stage.key)).toEqual([
      'new',
      'contacted',
      'trial_scheduled',
      'trial_completed',
      'converted',
      'lost',
    ])
  })

  it("lists the school's own stages in order, in the list the pickers read", () => {
    setLeadStages([...DEFAULT_STAGES, custom])

    expect(leadStatusOptions.map((stage) => stage.key)).toEqual([
      'new',
      'contacted',
      'trial_scheduled',
      'stage_ab12cd34ef',
      'trial_completed',
      'converted',
      'lost',
    ])
    expect(stageLabel('stage_ab12cd34ef')).toBe('Placement test')
    expect(stageStyle('stage_ab12cd34ef')).toBe(STAGE_COLORS.teal)
  })

  it('leaves a stage that is turned off out of the pickers but still names it', () => {
    setLeadStages(DEFAULT_STAGES.map((stage) => (stage.key === 'contacted' ? { ...stage, isActive: false } : stage)))

    expect(leadStatusOptions.some((stage) => stage.key === 'contacted')).toBe(false)
    expect(getLeadStages().some((stage) => stage.key === 'contacted')).toBe(true)
    expect(stageLabel('contacted')).toBe('Contacted')
    expect(isSettableStage('contacted')).toBe(false)
  })

  it('lets a flow move a lead to any stage that is on except Converted', () => {
    setLeadStages([...DEFAULT_STAGES, custom])

    expect(isSettableStage('stage_ab12cd34ef')).toBe(true)
    expect(isSettableStage('lost')).toBe(true)
    expect(isSettableStage('converted')).toBe(false)
    expect(isSettableStage('nope')).toBe(false)
  })

  it('names and colours a stage it does not know instead of failing', () => {
    expect(stageLabel('some_old_stage')).toBe('Some old stage')
    expect(stageStyle('some_old_stage')).toBe(STAGE_COLORS.slate)
  })

  it('checks a stage name', () => {
    expect(validateStageLabel('  ', DEFAULT_STAGES)).toBe('Give the stage a name.')
    expect(validateStageLabel('x'.repeat(41), DEFAULT_STAGES)).toMatch(/up to 40/)
    expect(validateStageLabel(' contacted ', DEFAULT_STAGES)).toBe('Another stage has this name.')
    expect(validateStageLabel('Placement test', DEFAULT_STAGES)).toBeNull()
  })

  it('reads a database row, falling back to grey for a colour it does not know', () => {
    expect(stageOf({ key: 'k', label: 'L', color: 'mauve', sort_order: 5, is_active: true, is_system: false })).toEqual({
      key: 'k',
      label: 'L',
      color: 'slate',
      sortOrder: 5,
      isActive: true,
      isSystem: false,
    })
  })

  it("passes on the database's own sentence for a rule it keeps", () => {
    expect(stageErrorMessage({ code: 'P0001', message: '3 lead(s) are in "Contacted". Move them to another stage first.' }, 'x')).toBe(
      '3 lead(s) are in "Contacted". Move them to another stage first.',
    )
    expect(stageErrorMessage({ message: 'relation "public.lead_stages" does not exist' }, 'x')).toBe(
      'Stages are not set up in the database yet.',
    )
    expect(stageErrorMessage({ message: 'new row violates row-level security policy' }, 'x')).toBe(
      'Only an admin can change the stages.',
    )
    expect(stageErrorMessage(new Error('boom'), 'fallback')).toBe('fallback')
  })
})
