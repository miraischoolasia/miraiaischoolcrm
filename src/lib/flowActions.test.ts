import { describe, expect, it } from 'vitest'
import {
  TRIGGER_ID,
  addNode,
  addNodeAfter,
  connect,
  describeAction,
  describeFlow,
  describeNode,
  newFlowDraft,
  parseGraph,
  sendAfterOnly,
  simulateFlow,
  unreachableMessages,
  validateDraft,
  type ActionNode,
  type FlowDraft,
  type FlowGraph,
  type MessageNode,
} from './automationFlows'
import { analyzeFlow } from './flowSteps'
import { buildEnrollments, buildTimeline, type FlowActivity, type FlowLogRow } from './automationLog'

const base: FlowGraph = { trigger: { x: 24, y: 140 }, nodes: [], edges: [] }

const tag = (change: Partial<ActionNode> = {}): ActionNode => ({
  id: 'a1',
  type: 'action',
  x: 0,
  y: 0,
  action: 'add_tag',
  value: '5',
  mins: 0,
  after: true,
  ...change,
})

const draftOf = (graph: FlowGraph, trigger: FlowDraft['trigger'] = 'lead_created'): FlowDraft => ({
  id: null,
  name: 'Tag the ads leads',
  trigger,
  enabled: false,
  graph,
})

describe('steps that change the lead', () => {
  it('are added after a card and start when it happens', () => {
    const first = addNodeAfter(base, TRIGGER_ID, 'out', 'add_tag')
    expect(first.id).toBe('a1')
    const node = first.graph.nodes[0]
    expect(node).toMatchObject({ type: 'action', action: 'add_tag', value: '', mins: 0, after: true })
    expect(first.graph.edges).toContainEqual({ from: TRIGGER_ID, port: 'out', to: 'a1' })

    const stage = addNode(first.graph, 'set_stage')
    expect(stage.graph.nodes[1]).toMatchObject({ action: 'set_stage', value: 'contacted' })
    // Another step can follow one: it has the one way out, like a message.
    const next = connect(stage.graph, { from: 'a1', port: 'out', to: stage.id })
    expect(next.edges).toContainEqual({ from: 'a1', port: 'out', to: stage.id })
    expect(connect(stage.graph, { from: 'a1', port: 'yes', to: stage.id })).toBe(stage.graph)
  })

  it('read like a sentence', () => {
    const name = (kind: string, id: string) => (kind === 'tag' && id === '5' ? 'VIP' : 'Ann')
    expect(describeAction(tag(), name)).toBe('Add the tag “VIP”')
    expect(describeAction(tag({ action: 'assign_pic', value: '9' }), name)).toBe('Assign Ann as the PIC')
    expect(describeAction(tag({ action: 'set_stage', value: 'lost' }), name)).toBe('Move the lead to Lost')
    expect(describeAction(tag({ value: '' }))).toBe('Add a tag')
    expect(describeNode(tag())).toBe('When it happens')
    expect(describeNode(tag({ mins: 60 }))).toBe('1 hour after')
  })

  it('are counted in the flow summary', () => {
    const draft = newFlowDraft()
    const graph: FlowGraph = { ...draft.graph, nodes: [...draft.graph.nodes, tag()] }
    expect(describeFlow({ trigger: 'class_start', graph })).toMatch(/1 message · 1 action$/)
  })

  it('are walked by the tester and listed apart from the messages', () => {
    const graph: FlowGraph = {
      ...base,
      nodes: [
        { id: 'c1', type: 'condition', kind: 'age', x: 0, y: 0, min: 5, max: 9 },
        tag(),
      ],
      edges: [
        { from: TRIGGER_ID, port: 'out', to: 'c1' },
        { from: 'c1', port: 'yes', to: 'a1' },
      ],
    }
    expect(simulateFlow(graph, { age: 7, classroomId: null }).actions.map((node) => node.id)).toEqual(['a1'])
    expect(simulateFlow(graph, { age: 12, classroomId: null }).actions).toEqual([])
  })
})

describe('checking a flow with such steps', () => {
  it('accepts a flow that only changes the lead', () => {
    expect(validateDraft(draftOf({ ...base, nodes: [tag()], edges: [{ from: TRIGGER_ID, port: 'out', to: 'a1' }] }))).toBeNull()
  })

  it('wants a tag, a PIC or a stage the step can really use', () => {
    const check = (change: Partial<ActionNode>) =>
      validateDraft(draftOf({ ...base, nodes: [tag(change)], edges: [] }))
    expect(check({ value: '' })).toMatch(/tag picked/)
    expect(check({ action: 'assign_pic', value: '' })).toMatch(/person picked/)
    expect(check({ action: 'set_stage', value: 'converted' })).toMatch(/stage picked/)
    expect(check({ action: 'set_stage', value: 'lost' })).toBeNull()
    expect(check({ mins: -1 })).toMatch(/0 minutes to 60 days/)
  })

  it('wants every step of a flow that starts after something happened to go after it', () => {
    const before = tag({ after: false })
    expect(validateDraft(draftOf({ ...base, nodes: [before], edges: [] }))).toMatch(/can only happen after/)
    const fixed = sendAfterOnly({ ...base, nodes: [before] })
    expect(fixed.nodes[0]).toMatchObject({ after: true })
  })

  it('says when a step is not connected', () => {
    expect(unreachableMessages({ ...base, nodes: [tag()], edges: [] }).map((node) => node.id)).toEqual(['a1'])
  })
})

describe('saving and reading', () => {
  it('keeps a step through the database', () => {
    const graph: FlowGraph = { ...base, nodes: [tag({ action: 'set_stage', value: 'contacted', mins: 90 })], edges: [] }
    const read = parseGraph(JSON.parse(JSON.stringify(graph)))
    expect(read.nodes[0]).toMatchObject({ type: 'action', action: 'set_stage', value: 'contacted', mins: 90, after: true })
  })

  it('drops a step of a kind it does not know', () => {
    const read = parseGraph({ nodes: [{ id: 'a1', type: 'action', action: 'delete_lead', value: '1', mins: 0 }], edges: [] })
    expect(read.nodes).toEqual([])
  })

  it('is shown in the list when the steps come one after another before the messages', () => {
    const graph: FlowGraph = { ...base, nodes: [tag()], edges: [{ from: TRIGGER_ID, port: 'out', to: 'a1' }] }
    const analysis = analyzeFlow(graph)
    expect(analysis.simple).toBe(true)
    expect(analysis.simple && analysis.actions?.map((step) => step.id)).toEqual(['a1'])
  })

  it('is read in the advanced editor when a step comes after a message', () => {
    const message: MessageNode = { id: 'm1', type: 'message', x: 0, y: 0, mins: 60, text: 'Hi', after: true }
    const graph: FlowGraph = {
      ...base,
      nodes: [message, { ...tag(), id: 'a1' }],
      edges: [
        { from: TRIGGER_ID, port: 'out', to: 'm1' },
        { from: 'm1', port: 'out', to: 'a1' },
      ],
    }
    expect(analyzeFlow(graph).simple).toBe(false)
  })
})

describe('what the logs say', () => {
  const row = (change: Partial<FlowLogRow> = {}): FlowLogRow => ({
    id: 1,
    eventKey: 'lead:3',
    nodeId: 'a1',
    kind: 'action_done',
    detail: 'Added the tag “VIP”.',
    phone: '60123456789',
    parentName: 'Mrs Lim',
    childName: null,
    createdAt: '2026-10-14T03:00:00Z',
    ...change,
  })

  it('shows a step that changed the lead as done, and one that could not as not done', () => {
    const activity: FlowActivity = {
      queue: [],
      log: [row(), row({ id: 2, eventKey: 'lead:4', kind: 'action_skipped', detail: 'This family has no lead.' })],
    }
    const timeline = buildTimeline(activity)
    expect(timeline.find((entry) => entry.eventKey === 'lead:3')).toMatchObject({
      title: 'Step done',
      tone: 'ok',
      group: 'sent',
    })
    expect(timeline.find((entry) => entry.eventKey === 'lead:4')).toMatchObject({
      title: 'Step not done',
      tone: 'warn',
      group: 'skipped',
    })
    const enrollments = buildEnrollments(activity)
    expect(enrollments.find((entry) => entry.eventKey === 'lead:3')).toMatchObject({
      status: 'done',
      label: 'Done',
      reason: 'Added the tag “VIP”.',
    })
    expect(enrollments.find((entry) => entry.eventKey === 'lead:4')).toMatchObject({ status: 'not_sent' })
  })
})
