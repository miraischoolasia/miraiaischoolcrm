import { describe, expect, it } from 'vitest'
import {
  TRIGGER_ID,
  addNode,
  addNodeAfter,
  connect,
  describeNode,
  describeOffset,
  disconnect,
  triggerInfo,
  edgeKey,
  newFlowDraft,
  normalizeTestPhone,
  parseGraph,
  previewMessage,
  removeNode,
  simulateFlow,
  splitOffset,
  toOffsetMinutes,
  unknownPlaceholders,
  unreachableMessages,
  validateDraft,
  type FlowDraft,
  type FlowGraph,
  type MessageNode,
} from './automationFlows'

// trigger -> age 10 or older? -> yes: message 1 hour before / no: message 30 minutes before
const split: FlowGraph = {
  trigger: { x: 0, y: 0 },
  nodes: [
    { id: 'c1', type: 'condition', kind: 'age', x: 0, y: 0, min: 10, max: null },
    { id: 'mYes', type: 'message', x: 0, y: 0, mins: 60, text: 'Older {child}' },
    { id: 'mNo', type: 'message', x: 0, y: 0, mins: 30, text: 'Younger {child}' },
  ],
  edges: [
    { from: TRIGGER_ID, port: 'out', to: 'c1' },
    { from: 'c1', port: 'yes', to: 'mYes' },
    { from: 'c1', port: 'no', to: 'mNo' },
  ],
}

const draft = (change: Partial<FlowDraft> = {}): FlowDraft => ({ ...newFlowDraft(), name: 'Class reminder', ...change })

describe('the number a test is sent to', () => {
  it('turns what a person types into digits with the country code', () => {
    expect(normalizeTestPhone('012-345 6789')).toBe('60123456789')
    expect(normalizeTestPhone('+60 12 345 6789')).toBe('60123456789')
    expect(normalizeTestPhone('0060123456789')).toBe('60123456789')
    expect(normalizeTestPhone('60123456789')).toBe('60123456789')
  })

  it('refuses what cannot be a WhatsApp number', () => {
    expect(normalizeTestPhone('')).toBeNull()
    expect(normalizeTestPhone('12345')).toBeNull()
    expect(normalizeTestPhone('abc')).toBeNull()
    expect(normalizeTestPhone('1'.repeat(16))).toBeNull()
  })
})

describe('how long before', () => {
  it('shows the largest unit that divides evenly', () => {
    expect(splitOffset(60)).toEqual({ value: 1, unit: 'hours' })
    expect(splitOffset(2880)).toEqual({ value: 2, unit: 'days' })
    expect(splitOffset(90)).toEqual({ value: 90, unit: 'minutes' })
  })

  it('turns a number and a unit back into minutes and reads as a sentence', () => {
    expect(toOffsetMinutes(2, 'hours')).toBe(120)
    expect(describeOffset(60)).toBe('1 hour')
    expect(describeOffset(1440 * 2)).toBe('2 days')
  })
})

describe('message text', () => {
  it('fills the placeholders with an example child', () => {
    expect(previewMessage('Hi {child}, {class} at {time}')).toBe('Hi Ethan, Coder A at 8:30 pm')
  })

  it('lists words in braces the database would not replace', () => {
    expect(unknownPlaceholders('Hi {child}, bring {laptop} and {laptop}')).toEqual(['{laptop}'])
  })
})

describe('what a child gets', () => {
  it('sends an older child down Yes and a younger one down No', () => {
    const older = simulateFlow(split, { age: 10, classroomId: null })
    expect(older.messages.map((m) => m.id)).toEqual(['mYes'])
    expect(older.edges.has(edgeKey({ from: 'c1', port: 'yes', to: 'mYes' }))).toBe(true)

    const younger = simulateFlow(split, { age: 8, classroomId: null })
    expect(younger.messages.map((m) => m.id)).toEqual(['mNo'])
  })

  it('treats an unknown age as No', () => {
    expect(simulateFlow(split, { age: null, classroomId: null }).messages.map((m) => m.id)).toEqual(['mNo'])
  })

  it('answers a class condition by the class the child is in', () => {
    const graph: FlowGraph = {
      trigger: { x: 0, y: 0 },
      nodes: [
        { id: 'c1', type: 'condition', kind: 'classroom', x: 0, y: 0, ids: [2, 3] },
        { id: 'm1', type: 'message', x: 0, y: 0, mins: 60, text: 'In' },
      ],
      edges: [
        { from: TRIGGER_ID, port: 'out', to: 'c1' },
        { from: 'c1', port: 'yes', to: 'm1' },
      ],
    }
    expect(simulateFlow(graph, { age: 9, classroomId: 3 }).messages).toHaveLength(1)
    expect(simulateFlow(graph, { age: 9, classroomId: 5 }).messages).toHaveLength(0)
    expect(simulateFlow(graph, { age: 9, classroomId: null }).messages).toHaveLength(0)
  })

  it('answers a lessons-left condition: at or under the number is Yes, unknown is No', () => {
    const graph: FlowGraph = {
      trigger: { x: 0, y: 0 },
      nodes: [
        { id: 'h1', type: 'condition', kind: 'hours', x: 0, y: 0, max: 2 },
        { id: 'm1', type: 'message', x: 0, y: 0, mins: 60, text: 'Low' },
      ],
      edges: [
        { from: TRIGGER_ID, port: 'out', to: 'h1' },
        { from: 'h1', port: 'yes', to: 'm1' },
      ],
    }
    expect(simulateFlow(graph, { age: 9, classroomId: null, hours: 2 }).messages).toHaveLength(1)
    expect(simulateFlow(graph, { age: 9, classroomId: null, hours: 0 }).messages).toHaveLength(1)
    expect(simulateFlow(graph, { age: 9, classroomId: null, hours: 3 }).messages).toHaveLength(0)
    expect(simulateFlow(graph, { age: 9, classroomId: null }).messages).toHaveLength(0)
  })

  it('answers a lead-stage condition by the lead stage', () => {
    const graph: FlowGraph = {
      trigger: { x: 0, y: 0 },
      nodes: [
        { id: 's1', type: 'condition', kind: 'stage', x: 0, y: 0, stages: ['new', 'contacted'] },
        { id: 'm1', type: 'message', x: 0, y: 0, mins: 60, text: 'Still open', after: true },
      ],
      edges: [
        { from: TRIGGER_ID, port: 'out', to: 's1' },
        { from: 's1', port: 'yes', to: 'm1' },
      ],
    }
    expect(simulateFlow(graph, { age: null, classroomId: null, stage: 'new' }).messages).toHaveLength(1)
    expect(simulateFlow(graph, { age: null, classroomId: null, stage: 'converted' }).messages).toHaveLength(0)
    expect(simulateFlow(graph, { age: null, classroomId: null }).messages).toHaveLength(0)
  })

  it('can send several messages for one event and survives a loop', () => {
    const graph: FlowGraph = {
      trigger: { x: 0, y: 0 },
      nodes: [
        { id: 'a', type: 'message', x: 0, y: 0, mins: 1440, text: 'A' },
        { id: 'b', type: 'message', x: 0, y: 0, mins: 60, text: 'B' },
        { id: 'c1', type: 'condition', kind: 'age', x: 0, y: 0, min: 1, max: null },
      ],
      edges: [
        { from: TRIGGER_ID, port: 'out', to: 'a' },
        { from: TRIGGER_ID, port: 'out', to: 'c1' },
        { from: 'c1', port: 'yes', to: 'b' },
        { from: 'c1', port: 'yes', to: 'c1' },
      ],
    }
    expect(
      simulateFlow(graph, { age: 5, classroomId: null })
        .messages.map((m) => m.id)
        .sort(),
    ).toEqual(['a', 'b'])
  })
})

describe('editing the graph', () => {
  it('adds blocks with free ids and removes a block with its lines', () => {
    const added = addNode(split, 'message')
    expect(added.id).toBe('m1')
    expect(addNode(added.graph, 'age').id).toBe('c2')
    const removed = removeNode(split, 'c1')
    expect(removed.nodes.map((n) => n.id)).toEqual(['mYes', 'mNo'])
    expect(removed.edges).toEqual([])
  })

  it('adds a block after a card, joined to that exit', () => {
    const afterTrigger = addNodeAfter({ ...split, edges: [] }, TRIGGER_ID, 'out', 'message')
    expect(afterTrigger.id).toBe('m1')
    expect(afterTrigger.graph.edges).toEqual([{ from: TRIGGER_ID, port: 'out', to: 'm1' }])
    const placed = afterTrigger.graph.nodes.find((n) => n.id === 'm1')
    expect(placed).toMatchObject({ x: 300, y: 0 })

    const afterYes = addNodeAfter(split, 'c1', 'yes', 'age')
    expect(afterYes.graph.edges).toContainEqual({ from: 'c1', port: 'yes', to: afterYes.id })
    // Two blocks after the same exit do not sit on top of each other.
    const second = addNodeAfter(afterYes.graph, 'c1', 'yes', 'message')
    const first = second.graph.nodes.find((n) => n.id === afterYes.id)
    const other = second.graph.nodes.find((n) => n.id === second.id)
    expect(first && other && first.x === other.x && first.y !== other.y).toBe(true)

    expect(addNodeAfter(split, 'nope', 'out', 'message')).toEqual({ graph: split, id: null })
  })

  it('lets a message be followed by another block', () => {
    const chained = connect(split, { from: 'mYes', port: 'out', to: 'mNo' })
    expect(chained.edges).toContainEqual({ from: 'mYes', port: 'out', to: 'mNo' })
    const added = addNodeAfter(split, 'mYes', 'out', 'classroom')
    expect(added.graph.edges).toContainEqual({ from: 'mYes', port: 'out', to: added.id })
  })

  it('walks on past a message to what follows it', () => {
    const graph: FlowGraph = {
      trigger: { x: 0, y: 0 },
      nodes: [
        { id: 'a', type: 'message', x: 0, y: 0, mins: 1440, text: 'A' },
        { id: 'c1', type: 'condition', kind: 'age', x: 0, y: 0, min: 10, max: null },
        { id: 'b', type: 'message', x: 0, y: 0, mins: 60, text: 'B' },
      ],
      edges: [
        { from: TRIGGER_ID, port: 'out', to: 'a' },
        { from: 'a', port: 'out', to: 'c1' },
        { from: 'c1', port: 'yes', to: 'b' },
      ],
    }
    expect(simulateFlow(graph, { age: 12, classroomId: null }).messages.map((m) => m.id)).toEqual(['a', 'b'])
    expect(simulateFlow(graph, { age: 8, classroomId: null }).messages.map((m) => m.id)).toEqual(['a'])
    expect(unreachableMessages(graph)).toEqual([])
  })

  it('refuses lines that mean nothing', () => {
    // A condition has Yes and No, not "out"; the trigger and a message have only "out".
    expect(connect(split, { from: 'c1', port: 'out', to: 'mYes' })).toBe(split)
    expect(connect(split, { from: 'mYes', port: 'yes', to: 'mNo' })).toBe(split)
    expect(connect(split, { from: TRIGGER_ID, port: 'no', to: 'mNo' })).toBe(split)
    expect(connect(split, { from: 'nope', port: 'out', to: 'mNo' })).toBe(split)
    expect(connect(split, { from: 'mYes', port: 'out', to: TRIGGER_ID })).toBe(split)
    expect(connect(split, { from: 'mYes', port: 'out', to: 'mYes' })).toBe(split)
    expect(connect(split, { from: 'c1', port: 'yes', to: TRIGGER_ID })).toBe(split)
    expect(connect(split, { from: 'c1', port: 'yes', to: 'c1' })).toBe(split)
    expect(connect(split, { from: 'c1', port: 'yes', to: 'mYes' })).toBe(split)
    expect(connect(split, { from: 'c1', port: 'yes', to: 'nope' })).toBe(split)
    const more = connect(split, { from: TRIGGER_ID, port: 'out', to: 'mYes' })
    expect(more.edges).toHaveLength(4)
    expect(disconnect(more, edgeKey({ from: TRIGGER_ID, port: 'out', to: 'mYes' })).edges).toHaveLength(3)
  })

  it('finds messages no line reaches', () => {
    const loose = disconnect(split, edgeKey({ from: 'c1', port: 'no', to: 'mNo' }))
    expect(unreachableMessages(loose).map((m) => m.id)).toEqual(['mNo'])
    expect(unreachableMessages(split)).toEqual([])
  })

  it('reads a block as a short question', () => {
    expect(describeNode(split.nodes[0])).toBe('Age 10 or older?')
    expect(describeNode({ id: 'c', type: 'condition', kind: 'classroom', x: 0, y: 0, ids: [1] }, () => 'Coder A')).toBe(
      'In Coder A?',
    )
    expect(describeNode(split.nodes[1])).toBe('1 hour before')
  })

  it('says who a message goes to when it is for a contact', () => {
    const toLex = { ...(split.nodes[1] as MessageNode), contactId: 4 }
    expect(describeNode(toLex, undefined, () => 'Lex')).toBe('1 hour before · to Lex')
    expect(describeNode({ ...toLex, contactId: null })).toBe('1 hour before')
  })
})

describe('checking a flow before it is saved', () => {
  it('accepts the starting flow once it has a name', () => {
    expect(validateDraft(draft())).toBeNull()
  })

  it('asks for a name, a message and sensible times and ages', () => {
    expect(validateDraft(draft({ name: ' ' }))).toBe('Give the flow a name.')
    expect(validateDraft(draft({ graph: { ...split, nodes: [] } }))).toBe('Add at least one message block.')
    expect(
      validateDraft(
        draft({ graph: { ...split, nodes: [{ id: 'm1', type: 'message', x: 0, y: 0, mins: 2, text: 'x' }] } }),
      ),
    ).toBe('A message must be set at least 3 minutes before or after.')
    expect(
      validateDraft(
        draft({
          graph: {
            ...split,
            nodes: [
              { id: 'c1', type: 'condition', kind: 'age', x: 0, y: 0, min: 12, max: 8 },
              { id: 'm1', type: 'message', x: 0, y: 0, mins: 60, text: 'x' },
            ],
          },
        }),
      ),
    ).toBe('The lowest age is higher than the highest age.')
  })
})

describe('after-the-event messages and the new triggers', () => {
  const afterOnlyDraft = (change: Partial<FlowDraft> = {}): FlowDraft =>
    draft({
      trigger: 'lead_created',
      graph: {
        trigger: { x: 0, y: 0 },
        nodes: [{ id: 'm1', type: 'message', x: 0, y: 0, mins: 5, text: 'Welcome', after: true }],
        edges: [{ from: TRIGGER_ID, port: 'out', to: 'm1' }],
      },
      ...change,
    })

  it('describes a message as before or after the event', () => {
    const message: MessageNode = { id: 'm', type: 'message', x: 0, y: 0, mins: 60, text: 'Hi' }
    expect(describeNode(message)).toBe('1 hour before')
    expect(describeNode({ ...message, after: true })).toBe('1 hour after')
  })

  it('describes the lessons-left and stage questions', () => {
    expect(describeNode({ id: 'h', type: 'condition', kind: 'hours', x: 0, y: 0, max: 2 })).toBe(
      '2 hours left or fewer?',
    )
    expect(describeNode({ id: 'h', type: 'condition', kind: 'hours', x: 0, y: 0, max: 1 })).toBe(
      '1 hour left or fewer?',
    )
    expect(describeNode({ id: 's', type: 'condition', kind: 'stage', x: 0, y: 0, stages: [] })).toBe('Any stage?')
    expect(describeNode({ id: 's', type: 'condition', kind: 'stage', x: 0, y: 0, stages: ['new'] })).toMatch(
      /^Stage is .+\?$/,
    )
  })

  it('says a new-lead flow can only send after it', () => {
    expect(triggerInfo('lead_created').afterOnly).toBe(true)
    expect(triggerInfo('form_submitted').afterOnly).toBe(true)
    expect(triggerInfo('class_start').afterOnly).toBeFalsy()
    expect(validateDraft(afterOnlyDraft())).toBeNull()
    const before = afterOnlyDraft({
      graph: {
        trigger: { x: 0, y: 0 },
        nodes: [{ id: 'm1', type: 'message', x: 0, y: 0, mins: 5, text: 'Welcome' }],
        edges: [{ from: TRIGGER_ID, port: 'out', to: 'm1' }],
      },
    })
    expect(validateDraft(before)).toMatch(/can only be sent after it/)
  })

  it('accepts up to 60 days and rejects more', () => {
    const withMins = (mins: number) =>
      afterOnlyDraft({
        graph: {
          trigger: { x: 0, y: 0 },
          nodes: [{ id: 'm1', type: 'message', x: 0, y: 0, mins, text: 'x', after: true }],
          edges: [{ from: TRIGGER_ID, port: 'out', to: 'm1' }],
        },
      })
    expect(validateDraft(withMins(60 * 24 * 60))).toBeNull()
    expect(validateDraft(withMins(60 * 24 * 60 + 1))).toBe('A message can be set up to 60 days before or after.')
  })

  it('checks the hours and the stages before saving', () => {
    const withCondition = (node: FlowGraph['nodes'][number]) =>
      draft({
        graph: {
          trigger: { x: 0, y: 0 },
          nodes: [node, { id: 'm1', type: 'message', x: 0, y: 0, mins: 60, text: 'x' }],
          edges: [
            { from: TRIGGER_ID, port: 'out', to: node.id },
            { from: node.id, port: 'yes', to: 'm1' },
          ],
        },
      })
    expect(
      validateDraft(withCondition({ id: 'h', type: 'condition', kind: 'hours', x: 0, y: 0, max: 501 })),
    ).toBe('Hours left must be a whole number from 0 to 500.')
    expect(
      validateDraft(withCondition({ id: 's', type: 'condition', kind: 'stage', x: 0, y: 0, stages: [] })),
    ).toBe('A stage block needs at least one stage ticked.')
    expect(
      validateDraft(withCondition({ id: 'h', type: 'condition', kind: 'hours', x: 0, y: 0, max: 2 })),
    ).toBeNull()
  })

  it('adds the new blocks with sensible starting values', () => {
    const empty: FlowGraph = { trigger: { x: 0, y: 0 }, nodes: [], edges: [] }
    const hours = addNode(empty, 'hours', { x: 1, y: 2 }).graph.nodes[0]
    expect(hours).toMatchObject({ type: 'condition', kind: 'hours', max: 2 })
    const stage = addNode(empty, 'stage', { x: 1, y: 2 }).graph.nodes[0]
    expect(stage).toMatchObject({ type: 'condition', kind: 'stage', stages: ['new'] })
  })

  it('reads the new blocks and the after flag back, dropping unknown stages', () => {
    const graph = parseGraph({
      trigger: { x: 0, y: 0 },
      nodes: [
        { id: 'm1', type: 'message', mins: 5, text: 'Hi', after: true },
        { id: 'm2', type: 'message', mins: 5, text: 'Hi', after: 'yes' },
        { id: 'h', type: 'condition', kind: 'hours', max: 3 },
        { id: 's', type: 'condition', kind: 'stage', stages: ['new', 'bogus', 7] },
      ],
      edges: [],
    })
    expect(graph.nodes[0]).toMatchObject({ id: 'm1', after: true })
    expect('after' in graph.nodes[1]).toBe(false)
    expect(graph.nodes[2]).toMatchObject({ kind: 'hours', max: 3 })
    expect(graph.nodes[3]).toMatchObject({ kind: 'stage', stages: ['new'] })
  })
})

describe('reading the graph from the database', () => {
  it('keeps good blocks and lines and drops anything unexpected', () => {
    const graph = parseGraph({
      trigger: { x: 5, y: 6 },
      nodes: [
        { id: 'm1', type: 'message', mins: 60, text: 'Hi', x: 1, y: 2 },
        { id: 'weird', type: 'banana' },
        'not a node',
        { id: 'c1', type: 'condition', kind: 'age', min: 8, max: null },
      ],
      edges: [
        { from: 'trigger', port: 'out', to: 'm1' },
        { from: 'trigger', port: 'sideways', to: 'm1' },
        { from: 'trigger', port: 'out', to: 'gone' },
      ],
    })
    expect(graph.trigger).toEqual({ x: 5, y: 6 })
    expect(graph.nodes.map((n) => n.id)).toEqual(['m1', 'c1'])
    expect(graph.edges).toEqual([{ from: 'trigger', port: 'out', to: 'm1' }])
    expect(parseGraph(null).nodes).toEqual([])
  })

  it('keeps the contact a message goes to, and ignores anything that is not an id', () => {
    const graph = parseGraph({
      trigger: { x: 0, y: 0 },
      nodes: [
        { id: 'a', type: 'message', mins: 60, text: 'Team', contactId: 4 },
        { id: 'b', type: 'message', mins: 60, text: 'Parent', contactId: null },
        { id: 'c', type: 'message', mins: 60, text: 'Odd', contactId: 'abc' },
      ],
      edges: [],
    })
    expect(graph.nodes[0]).toMatchObject({ id: 'a', contactId: 4 })
    expect('contactId' in graph.nodes[1]).toBe(false)
    expect('contactId' in graph.nodes[2]).toBe(false)
  })
})
