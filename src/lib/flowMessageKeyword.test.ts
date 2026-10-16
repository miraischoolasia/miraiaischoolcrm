import { describe, expect, it } from 'vitest'
import {
  TRIGGER_ID,
  addNode,
  cleanKeywords,
  describeAction,
  keywordMissReason,
  parseGraph,
  simulateFlow,
  testChildOf,
  EMPTY_TEST,
  triggerInfo,
  updateSettings,
  validateDraft,
  type ActionNode,
  type FlowDraft,
  type FlowGraph,
} from './automationFlows'
import { FLOW_RECIPES, TRIGGER_GROUPS, analyzeFlow } from './flowSteps'
import { buildEnrollments, buildTimeline, type FlowLogRow } from './automationLog'

const base: FlowGraph = { trigger: { x: 24, y: 140 }, nodes: [], edges: [] }

const step = (change: Partial<ActionNode>): ActionNode => ({
  id: 'a1',
  type: 'action',
  x: 0,
  y: 0,
  action: 'make_lead',
  value: '',
  mins: 0,
  after: true,
  ...change,
})

const draft = (nodes: ActionNode[], settings: FlowGraph['settings'], trigger: FlowDraft['trigger'] = 'message_keyword'): FlowDraft => ({
  id: null,
  name: 'Keyword to lead',
  trigger,
  enabled: false,
  graph: { ...base, nodes, edges: [], ...(settings ? { settings } : {}) },
})

describe('a flow that starts from a message with a keyword', () => {
  it('is a trigger that can only act after the message', () => {
    expect(triggerInfo('message_keyword')).toMatchObject({ afterOnly: true, classroomCategory: null })
    expect(TRIGGER_GROUPS.some((group) => group.keys.includes('message_keyword'))).toBe(true)
  })

  it('needs at least one keyword', () => {
    expect(validateDraft(draft([step({})], undefined))).toMatch(/at least one keyword/)
    expect(validateDraft(draft([step({})], { keywords: ['  ', ''] }))).toMatch(/at least one keyword/)
    expect(validateDraft(draft([step({})], { keywords: ['HOA course'] }))).toBeNull()
  })

  it('keeps the keywords tidy: trimmed, no blanks, no repeats whatever the capitals', () => {
    expect(cleanKeywords(['  HOA   course ', '', 'hoa course', 'Camp'])).toEqual(['HOA course', 'Camp'])
    const graph = updateSettings(base, { keywords: [' HOA ', '', 'hoa'] })
    expect(graph.settings).toEqual({ keywords: ['HOA'] })
    // Nothing left: the setting disappears and so does an unticked "every time".
    expect(updateSettings(graph, { keywords: ['  '], everyTime: false }).settings).toBeUndefined()
    expect(updateSettings(base, { keywords: ['x'], everyTime: true }).settings).toEqual({ keywords: ['x'], everyTime: true })
  })

  it('refuses too many or too long keywords', () => {
    const many = Array.from({ length: 21 }, (_, index) => `word ${index}`)
    expect(validateDraft(draft([step({})], { keywords: many }))).toMatch(/up to 20 keywords/)
    expect(validateDraft(draft([step({})], { keywords: ['x'.repeat(101)] }))).toMatch(/up to 20 keywords/)
  })

  it('reads the keywords back from the saved flow and drops anything else', () => {
    const graph = parseGraph({
      trigger: { x: 1, y: 2 },
      nodes: [],
      edges: [],
      settings: { keywords: ['HOA', 3, ' hoa ', 'Camp'], everyTime: true, channels: ['whatsapp', 'messenger'] },
    })
    expect(graph.settings).toEqual({ keywords: ['HOA', 'Camp'], everyTime: true, channels: ['whatsapp', 'messenger'] })
    expect(parseGraph({ trigger: {}, nodes: [], edges: [], settings: { everyTime: 'yes' } }).settings).toBeUndefined()
  })
})

describe('the steps make the lead and set the source', () => {
  it('can be added from the picker, make_lead first in the list of steps', () => {
    const lead = addNode(base, 'make_lead')
    expect(lead.graph.nodes[0]).toMatchObject({ type: 'action', action: 'make_lead', value: '', mins: 0, after: true })
    const source = addNode(lead.graph, 'set_source')
    expect(source.graph.nodes[1]).toMatchObject({ action: 'set_source', value: '' })
  })

  it('are read back from a saved flow', () => {
    const graph = parseGraph({
      trigger: {},
      nodes: [
        { id: 'a1', type: 'action', x: 0, y: 0, action: 'make_lead', value: '', mins: 0, after: true },
        { id: 'a2', type: 'action', x: 0, y: 0, action: 'set_source', value: '4', mins: 0, after: true },
      ],
      edges: [],
    })
    expect(graph.nodes.map((node) => node.type === 'action' && node.action)).toEqual(['make_lead', 'set_source'])
  })

  it('are described in a line', () => {
    expect(describeAction(step({}))).toBe('Make them a lead')
    expect(describeAction(step({ action: 'set_source', value: '' }))).toBe('Set the source')
    expect(describeAction(step({ action: 'set_source', value: '4' }), (_kind, id) => (id === '4' ? 'Advertisement' : id))).toBe(
      'Set the source to “Advertisement”',
    )
  })

  it('need a source picked, and making a lead only works for a message flow', () => {
    const keywords = { keywords: ['HOA'] }
    expect(validateDraft(draft([step({ action: 'set_source', value: '' })], keywords))).toMatch(/needs a source picked/)
    expect(validateDraft(draft([step({ action: 'set_source', value: '4' })], keywords))).toBeNull()
    expect(validateDraft(draft([step({})], undefined, 'lead_created'))).toMatch(/only works in a flow that starts from a message/)
  })
})

describe('the recipe that turns a keyword message into a lead', () => {
  const recipe = FLOW_RECIPES.find((entry) => entry.key === 'keyword_to_lead')

  it('is a message flow on every channel with the steps in order', () => {
    const built = recipe?.build([])
    expect(built).not.toBeNull()
    expect(built?.trigger).toBe('message_keyword')
    expect(built?.graph.nodes.map((node) => (node.type === 'action' ? node.action : node.type))).toEqual([
      'make_lead',
      'add_tag',
      'set_source',
      'message',
    ])
    expect(built?.graph.edges[0]).toEqual({ from: TRIGGER_ID, port: 'out', to: 'a1' })
    expect(built?.graph.settings?.channels).toEqual(['whatsapp', 'messenger', 'instagram'])
  })

  it('cannot be saved before the keywords, the tag and the source are filled in', () => {
    const built = recipe?.build([]) as FlowDraft
    expect(validateDraft(built)).toMatch(/keyword/)
    const withWords = { ...built, graph: updateSettings(built.graph, { keywords: ['HOA'] }) }
    expect(validateDraft(withWords)).toMatch(/needs a tag picked/)
  })

  it('opens in the simple list, with its three steps ahead of the message', () => {
    const built = recipe?.build([]) as FlowDraft
    const analysis = analyzeFlow(built.graph)
    expect(analysis.simple).toBe(true)
    expect(analysis.simple && analysis.actions?.map((step) => step.action)).toEqual(['make_lead', 'add_tag', 'set_source'])
    expect(analysis.simple && analysis.messages).toHaveLength(1)
  })
})

describe('the log of a flow that starts from a message', () => {
  const matched: FlowLogRow = {
    id: 1,
    eventKey: 'kw:7:70',
    nodeId: '',
    kind: 'keyword_matched',
    detail: 'They wrote “HOA course” on Messenger.',
    phone: null,
    parentName: 'Mei',
    childName: null,
    createdAt: '2026-10-16T10:00:00Z',
  }

  it('says what the person wrote, and counts them as waiting while nothing else has happened', () => {
    const [enrollment] = buildEnrollments({ queue: [], log: [matched] })
    expect(enrollment).toMatchObject({ person: 'Mei', status: 'waiting', reason: 'They wrote “HOA course” on Messenger.' })
    expect(buildTimeline({ queue: [], log: [matched] })[0]).toMatchObject({ title: 'Wrote a keyword', group: 'other' })
  })

  it('gives the real reason when a step then stopped the flow', () => {
    const stopped: FlowLogRow = { ...matched, id: 2, nodeId: 'c1', kind: 'condition_no', detail: 'Stage is not New.' }
    const [enrollment] = buildEnrollments({ queue: [], log: [stopped, matched] })
    expect(enrollment).toMatchObject({ status: 'not_sent', reason: 'Stage is not New.' })
  })
})

describe('trying a flow that starts from a message', () => {
  const graph: FlowGraph = {
    ...base,
    nodes: [step({ id: 'a1', action: 'make_lead' })],
    edges: [{ from: TRIGGER_ID, port: 'out', to: 'a1' }],
    settings: { keywords: ['HOA', 'Hari Terbuka'] },
  }
  const child = (change: Partial<typeof EMPTY_TEST>) => testChildOf({ ...EMPTY_TEST, ...change })

  it('walks the steps when the text holds a keyword, whatever the capitals and punctuation', () => {
    expect(simulateFlow(graph, child({ message: 'Hi! I want to join h.o.a? ' })).actions).toHaveLength(0)
    expect(simulateFlow(graph, child({ message: 'hello, hari   terbuka please' })).actions).toHaveLength(1)
    expect(simulateFlow(graph, child({ message: 'Interested in HOA!' })).actions).toHaveLength(1)
  })

  it('stops with a reason when no keyword is in the text', () => {
    expect(simulateFlow(graph, child({ message: 'good morning' })).actions).toHaveLength(0)
    expect(keywordMissReason(graph.settings, 'good morning', null)).toMatch(/none of the keywords/)
    expect(keywordMissReason(graph.settings, '  ', null)).toMatch(/Type what the parent writes/)
    expect(keywordMissReason(graph.settings, 'HOA', null)).toBeNull()
  })

  it('does not start on a channel the flow does not listen on', () => {
    expect(keywordMissReason(graph.settings, 'HOA', 'messenger')).toMatch(/does not listen on Messenger/)
    const everywhere = { ...graph.settings, channels: ['whatsapp', 'messenger'] as const }
    expect(keywordMissReason({ ...everywhere, channels: [...everywhere.channels] }, 'HOA', 'messenger')).toBeNull()
    expect(simulateFlow(graph, child({ message: 'HOA', channel: 'instagram' })).actions).toHaveLength(0)
  })

  it('leaves other flows alone: no keywords means no text is needed', () => {
    const plain: FlowGraph = { ...graph, settings: undefined }
    expect(simulateFlow(plain, child({})).actions).toHaveLength(1)
  })
})
