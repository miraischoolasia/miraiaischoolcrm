import { describe, expect, it } from 'vitest'
import type { FlowGraph } from './automationFlows'
import { describeRun, filterFlows, summarizeFlow } from './startFlow'

function graph(nodes: FlowGraph['nodes'], autoSend = false): FlowGraph {
  return {
    trigger: { x: 0, y: 0 },
    nodes,
    edges: nodes.length > 0 ? [{ from: 'trigger', port: 'out', to: nodes[0].id }] : [],
    settings: { autoSend },
  }
}

describe('summarizeFlow', () => {
  it('says what the flow does first and whether it sends by itself', () => {
    const flow = summarizeFlow({
      id: 1,
      name: 'Welcome',
      trigger: 'lead_created',
      graph: graph([{ id: 'm1', type: 'message', x: 0, y: 0, mins: 5, after: true, text: 'Hi {parent}, welcome!' }], true),
    })
    expect(flow).toMatchObject({ startable: true, why: null, sendsItself: true })
    expect(flow.firstStep).toBe('Message 5 minutes after the start: “Hi {parent}, welcome!”')
  })

  it('greys out a flow whose steps are timed before a class', () => {
    const flow = summarizeFlow({
      id: 2,
      name: 'Class reminder',
      trigger: 'class_start',
      graph: graph([{ id: 'm1', type: 'message', x: 0, y: 0, mins: 60, after: false, text: 'Class soon' }]),
    })
    expect(flow.startable).toBe(false)
    expect(flow.why).toContain('timed before a class')
  })

  it('greys out a source keyword flow (it needs the first message)', () => {
    const flow = summarizeFlow({
      id: 3,
      name: 'FB ad keyword',
      trigger: 'first_message_keyword',
      graph: graph([{ id: 'a1', type: 'action', x: 0, y: 0, mins: 0, after: true, action: 'make_lead', value: '' }]),
    })
    expect(flow.startable).toBe(false)
    expect(flow.why).toContain('Add as lead')
  })

  it('greys out a class quality flow (it is about a lesson, not a chat)', () => {
    const flow = summarizeFlow({
      id: 5,
      name: 'Class alerts → managers',
      trigger: 'class_alert',
      graph: graph([{ id: 'a1', type: 'action', x: 0, y: 0, mins: 0, after: true, action: 'notify_staff', value: '{"to":"managers"}' }]),
    })
    expect(flow.startable).toBe(false)
    expect(flow.why).toContain('not a chat')
  })

  it('names a step that is not a message', () => {
    const flow = summarizeFlow({
      id: 4,
      name: 'Tag them',
      trigger: 'lead_created',
      graph: graph([{ id: 'a1', type: 'action', x: 0, y: 0, mins: 0, after: true, action: 'make_lead', value: '' }]),
    })
    expect(flow.firstStep).toBe('Make them a lead')
  })
})

describe('filterFlows', () => {
  it('finds flows by a part of their name, any case', () => {
    const flows = [
      { id: 1, name: 'Trial follow-up', startable: true, why: null, firstStep: '', sendsItself: false },
      { id: 2, name: 'Welcome', startable: true, why: null, firstStep: '', sendsItself: false },
    ]
    expect(filterFlows(flows, ' TRIAL ').map((flow) => flow.id)).toEqual([1])
    expect(filterFlows(flows, '')).toHaveLength(2)
  })
})

describe('describeRun', () => {
  const now = new Date(2026, 9, 23, 16, 0)
  it('says since when and who started it', () => {
    expect(describeRun({ running: true, since: new Date(2026, 9, 23, 15, 5).toISOString(), startedBy: 'Mei', runs: 1 }, now)).toBe(
      'since 3:05 pm, started by Mei',
    )
  })
  it('says when it started by itself', () => {
    expect(describeRun({ running: true, since: new Date(2026, 9, 20, 9, 0).toISOString(), startedBy: null, runs: 1 }, now)).toBe(
      'since 20 Oct, 9:00 am, started by itself',
    )
  })
})
