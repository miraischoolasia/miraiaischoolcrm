import { describe, expect, it } from 'vitest'
import { TRIGGER_ID, validateDraft, type FlowGraph, type MessageNode } from './automationFlows'
import {
  FLOW_RECIPES,
  TRIGGER_GROUPS,
  addActionStep,
  addFilter,
  addMessageStep,
  analyzeFlow,
  buildGraph,
  orderMessages,
  removeFilter,
  removeMessageStep,
  removeActionStep,
  reorderMessages,
} from './flowSteps'

const msg = (id: string, mins: number, after = false): MessageNode => ({
  id,
  type: 'message',
  x: 0,
  y: 0,
  mins,
  text: `text ${id}`,
  ...(after ? { after: true } : {}),
})

const base: FlowGraph = { trigger: { x: 24, y: 140 }, nodes: [], edges: [] }

describe('flowSteps', () => {
  it('reads a list of filters and messages back from the graph it built', () => {
    const graph = buildGraph(base, {
      filters: [{ id: 'c1', type: 'condition', kind: 'age', x: 0, y: 0, min: 6, max: 9 }],
      messages: [msg('m1', 60), msg('m2', 30)],
    })
    const analysis = analyzeFlow(graph)
    expect(analysis.simple).toBe(true)
    if (analysis.simple) {
      expect(analysis.filters.map((filter) => filter.id)).toEqual(['c1'])
      // 60 minutes before comes first, then 30 minutes before.
      expect(analysis.messages.map((message) => message.id)).toEqual(['m1', 'm2'])
    }
    expect(graph.edges).toContainEqual({ from: TRIGGER_ID, port: 'out', to: 'c1' })
    expect(graph.edges).toContainEqual({ from: 'c1', port: 'yes', to: 'm1' })
  })

  it('adds steps that change the lead before the messages, and takes them away again', () => {
    let graph = buildGraph(base, { filters: [], messages: [msg('m1', 60, true)] })
    const tag = addActionStep(graph, 'add_tag')
    const source = addActionStep(tag.graph, 'set_source')
    graph = source.graph
    const analysis = analyzeFlow(graph)
    expect(analysis.simple && analysis.actions?.map((step) => step.action)).toEqual(['add_tag', 'set_source'])
    // trigger -> tag -> source -> message
    expect(graph.edges).toContainEqual({ from: TRIGGER_ID, port: 'out', to: tag.id })
    expect(graph.edges).toContainEqual({ from: tag.id, port: 'out', to: source.id })
    expect(graph.edges).toContainEqual({ from: source.id, port: 'out', to: 'm1' })

    const removed = removeActionStep(graph, tag.id)
    const again = analyzeFlow(removed)
    expect(again.simple && again.actions?.map((step) => step.id)).toEqual([source.id])
    expect(removed.edges).toContainEqual({ from: TRIGGER_ID, port: 'out', to: source.id })
  })

  it('keeps the steps when a message is added or a filter is put in front', () => {
    let graph = addActionStep(buildGraph(base, { filters: [], messages: [] }), 'assign_pic').graph
    graph = addFilter(graph, 'stage')
    graph = addMessageStep(graph, 'lead_created').graph
    const analysis = analyzeFlow(graph)
    expect(analysis.simple).toBe(true)
    expect(analysis.simple && analysis.filters).toHaveLength(1)
    expect(analysis.simple && analysis.actions).toHaveLength(1)
    expect(analysis.simple && analysis.messages).toHaveLength(1)
  })

  it('puts messages in time order: before the event furthest first, then after it soonest first', () => {
    const ordered = orderMessages([msg('a', 10, true), msg('b', 30), msg('c', 5, true), msg('d', 90)])
    expect(ordered.map((message) => message.id)).toEqual(['d', 'b', 'c', 'a'])
  })

  it('reorders the graph once a time has been changed', () => {
    const graph = buildGraph(base, { filters: [], messages: [msg('m1', 60), msg('m2', 30)] })
    const changed: FlowGraph = {
      ...graph,
      nodes: graph.nodes.map((node) => (node.id === 'm1' && node.type === 'message' ? { ...node, mins: 5 } : node)),
    }
    const analysis = analyzeFlow(reorderMessages(changed))
    expect(analysis.simple && analysis.messages.map((message) => message.id)).toEqual(['m2', 'm1'])
  })

  it('keeps the settings and the trigger place when the list is rebuilt', () => {
    const withSettings: FlowGraph = { ...base, settings: { stopStages: ['lost'], cooldownDays: 7 } }
    const next = removeMessageStep(
      buildGraph(withSettings, { filters: [], messages: [msg('m1', 60), msg('m2', 30)] }),
      'm1',
    )
    expect(next.settings).toEqual({ stopStages: ['lost'], cooldownDays: 7 })
    expect(next.trigger).toEqual({ x: 24, y: 140 })
    expect(next.nodes.map((node) => node.id)).toEqual(['m2'])
  })

  it('adds and removes a filter in front of the messages', () => {
    const start = buildGraph(base, { filters: [], messages: [msg('m1', 60)] })
    const added = addFilter(start, 'age')
    const analysis = analyzeFlow(added)
    expect(analysis.simple && analysis.filters).toHaveLength(1)
    expect(added.edges).toContainEqual({ from: TRIGGER_ID, port: 'out', to: 'c1' })
    expect(added.edges).toContainEqual({ from: 'c1', port: 'yes', to: 'm1' })

    const removed = removeFilter(added, 'c1')
    expect(removed.edges).toEqual([{ from: TRIGGER_ID, port: 'out', to: 'm1' }])
  })

  it('adds a message a day after the last one for a trigger that can only go after', () => {
    const start = buildGraph(base, { filters: [], messages: [msg('m1', 240, true)] })
    const { graph, id } = addMessageStep(start, 'parent_no_reply')
    const added = graph.nodes.find((node) => node.id === id)
    expect(added).toMatchObject({ type: 'message', after: true, mins: 240 + 1440 })
  })

  it('adds a message an hour before for a trigger that can be told early', () => {
    const start = buildGraph(base, { filters: [], messages: [msg('m1', 60)] })
    const { graph, id } = addMessageStep(start, 'class_start')
    const added = graph.nodes.find((node) => node.id === id)
    expect(added).toMatchObject({ type: 'message', mins: 60 })
    expect(added && 'after' in added).toBe(false)
  })

  it('gives a flow with a Yes and a No branch to the advanced editor', () => {
    const graph: FlowGraph = {
      trigger: { x: 0, y: 0 },
      nodes: [
        { id: 'c1', type: 'condition', kind: 'age', x: 0, y: 0, min: 6, max: 9 },
        msg('m1', 60),
        msg('m2', 60),
      ],
      edges: [
        { from: TRIGGER_ID, port: 'out', to: 'c1' },
        { from: 'c1', port: 'yes', to: 'm1' },
        { from: 'c1', port: 'no', to: 'm2' },
      ],
    }
    const analysis = analyzeFlow(graph)
    expect(analysis).toMatchObject({ simple: false })
  })

  it('gives a flow with a block no line reaches to the advanced editor', () => {
    const graph: FlowGraph = {
      trigger: { x: 0, y: 0 },
      nodes: [msg('m1', 60), msg('m2', 30)],
      edges: [{ from: TRIGGER_ID, port: 'out', to: 'm1' }],
    }
    const analysis = analyzeFlow(graph)
    expect(analysis).toMatchObject({ simple: false, reason: 'It has blocks that no line reaches.' })
  })

  it('a flow with nothing in it is a simple one', () => {
    expect(analyzeFlow(base)).toMatchObject({ simple: true, filters: [], messages: [] })
  })

  it('lists every trigger once in the picker groups', () => {
    const keys = TRIGGER_GROUPS.flatMap((group) => group.keys)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toHaveLength(29)
  })

  describe('recipes', () => {
    it.each(FLOW_RECIPES.map((recipe) => [recipe.key, recipe] as const))(
      '%s builds a flow the simple view can show and the server will accept',
      (_key, recipe) => {
        const draft = recipe.build([{ id: 4, name: 'Lex', phone: '60123456789' }])
        expect(draft).not.toBeNull()
        if (!draft) {
          return
        }
        expect(draft.enabled).toBe(false)
        expect(draft.id).toBeNull()
        expect(analyzeFlow(draft.graph).simple).toBe(true)
        // The source recipe is only finished once a source is ticked.
        if (recipe.key === 'lead_from_source' || recipe.key === 'lead_from_keyword') {
          expect(validateDraft(draft)).toMatch(/ticked/)
        } else if (recipe.key === 'keyword_to_lead' || recipe.key === 'source_keyword') {
          // ... and this one once its keywords, tag and source are filled in.
          expect(validateDraft(draft)).toMatch(/keyword/)
        } else {
          expect(validateDraft(draft)).toBeNull()
        }
      },
    )

    it('cannot tell the team until there is a contact', () => {
      const recipe = FLOW_RECIPES.find((entry) => entry.toTeam === true)
      expect(recipe?.build([])).toBeNull()
    })
  })
})
