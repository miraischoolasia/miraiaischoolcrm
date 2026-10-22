import { describe, expect, it } from 'vitest'
import { TRIGGER_ID, triggerInfo, validateDraft, type FlowDraft, type FlowNode } from './automationFlows'
import { FLOW_RECIPES, analyzeFlow } from './flowSteps'
import { pickGroupsFor } from '../components/automations/pickGroups'

const step = (id: string, action: 'make_lead' | 'set_source' | 'add_tag', value: string): FlowNode => ({
  id,
  type: 'action',
  x: 0,
  y: 0,
  action,
  value,
  mins: 0,
  after: true,
})

function draft(nodes: FlowNode[], keywords: string[] = ['I saw your advert']): FlowDraft {
  return {
    id: null,
    name: 'Source keyword',
    trigger: 'first_message_keyword',
    enabled: true,
    graph: {
      trigger: { x: 0, y: 0 },
      nodes,
      edges: nodes.map((node, index) => ({ from: index === 0 ? TRIGGER_ID : nodes[index - 1].id, port: 'out', to: node.id })),
      settings: { keywords, channels: ['whatsapp', 'messenger', 'instagram'] },
    },
  }
}

describe('a source keyword flow', () => {
  it('is a trigger of its own that happens once, at the first message', () => {
    expect(triggerInfo('first_message_keyword').label).toBe('A first message has a source keyword')
    expect(triggerInfo('first_message_keyword').afterOnly).toBe(true)
  })

  it('makes the lead, sets the source and adds tags', () => {
    expect(validateDraft(draft([step('a1', 'make_lead', ''), step('a2', 'set_source', '4'), step('a3', 'add_tag', '9')]))).toBeNull()
    expect(validateDraft(draft([step('a1', 'make_lead', '')]))).toBeNull()
  })

  it('cannot send a message or skip making the lead', () => {
    const message: FlowNode = { id: 'm1', type: 'message', x: 0, y: 0, mins: 5, after: true, text: 'Hi' }
    expect(validateDraft(draft([step('a1', 'make_lead', ''), message]))).toMatch(/can only make the lead/)
    expect(validateDraft(draft([step('a2', 'set_source', '4')]))).toMatch(/needs the step that makes the lead/)
    expect(
      validateDraft(draft([step('a1', 'make_lead', ''), step('a2', 'set_source', '4'), step('a3', 'set_source', '5')])),
    ).toMatch(/one source/)
  })

  it('needs a keyword, and a keyword may be a whole advert line (up to 300 characters)', () => {
    expect(validateDraft(draft([step('a1', 'make_lead', '')], []))).toMatch(/at least one keyword/)
    expect(validateDraft(draft([step('a1', 'make_lead', '')], ['x'.repeat(250)]))).toBeNull()
    expect(validateDraft(draft([step('a1', 'make_lead', '')], ['x'.repeat(301)]))).toMatch(/300 characters/)
  })

  it('offers only its three steps in the "+" menu', () => {
    const kinds = pickGroupsFor('first_message_keyword').flatMap((group) => group.picks.map((pick) => pick.kind))
    expect(kinds.sort()).toEqual(['add_tag', 'make_lead', 'set_source'])
  })

  it('has a recipe the simple view can show', () => {
    const recipe = FLOW_RECIPES.find((entry) => entry.key === 'source_keyword')
    const built = recipe?.build([])
    expect(built?.trigger).toBe('first_message_keyword')
    expect(built && analyzeFlow(built.graph).simple).toBe(true)
  })
})
