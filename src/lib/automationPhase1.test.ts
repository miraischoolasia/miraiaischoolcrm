import { describe, expect, it } from 'vitest'
import {
  TRIGGER_ID,
  addNode,
  describeAction,
  parseGraph,
  parseStaffStep,
  simulateFlow,
  staffStepValue,
  triggerInfo,
  validateDraft,
  type ActionNode,
  type ConditionNode,
  type FlowDraft,
  type FlowGraph,
} from './automationFlows'
import { validateAutoSend, DEFAULT_AUTO_SEND } from './autoSend'
import { pickGroupsFor } from '../components/automations/pickGroups'

const base: FlowGraph = { trigger: { x: 0, y: 0 }, nodes: [], edges: [] }

// trigger -> condition -(yes)-> message
function gate(condition: ConditionNode): FlowGraph {
  return {
    trigger: { x: 0, y: 0 },
    nodes: [condition, { id: 'm1', type: 'message', x: 0, y: 0, mins: 0, after: true, text: 'Hi {parent}' }],
    edges: [
      { from: TRIGGER_ID, port: 'out', to: condition.id },
      { from: condition.id, port: 'yes', to: 'm1' },
    ],
  }
}

const sent = (graph: FlowGraph, child: Parameters<typeof simulateFlow>[1]) => simulateFlow(graph, child).messages.length === 1

function draftOf(graph: FlowGraph, trigger: FlowDraft['trigger'] = 'class_absent'): FlowDraft {
  return { id: null, name: 'Test', trigger, enabled: false, graph }
}

describe('the new triggers', () => {
  it('only the birthday can have a message before it', () => {
    expect(triggerInfo('birthday').afterOnly).toBeFalsy()
    for (const trigger of ['class_absent', 'lessons_left', 'student_created', 'app_account', 'lead_stage', 'lead_tag'] as const) {
      expect(triggerInfo(trigger).afterOnly).toBe(true)
    }
  })
})

describe('team steps', () => {
  it('keep who, what and when through saving', () => {
    const value = staffStepValue('create_task', { to: '12', text: '', title: 'Call {parent}', days: 2 })
    expect(parseStaffStep(value)).toMatchObject({ to: '12', title: 'Call {parent}', days: 2 })
    const note = staffStepValue('notify_staff', { to: 'teachers', text: 'Please check {child}', title: '', days: 1 })
    expect(parseStaffStep(note)).toMatchObject({ to: 'teachers', text: 'Please check {child}' })
  })

  it('read a broken value as "the PIC" with nothing filled in', () => {
    expect(parseStaffStep('not json')).toEqual({ to: 'pic', text: '', title: '', days: 1 })
    expect(parseStaffStep('{"to":"drop table","days":99}')).toMatchObject({ to: 'pic', days: 60 })
  })

  it('start with a note for the PIC and can be described', () => {
    const added = addNode(base, 'notify_staff')
    const node = added.graph.nodes.find((entry) => entry.id === added.id) as ActionNode
    expect(parseStaffStep(node.value).to).toBe('pic')
    expect(describeAction(node)).toMatch(/PIC/)
  })

  it('need text before saving', () => {
    const step: ActionNode = {
      id: 'a1',
      type: 'action',
      x: 0,
      y: 0,
      action: 'notify_staff',
      value: staffStepValue('notify_staff', { to: 'pic', text: '  ', title: '', days: 1 }),
      mins: 0,
      after: true,
    }
    const graph: FlowGraph = { ...base, nodes: [step], edges: [{ from: TRIGGER_ID, port: 'out', to: 'a1' }] }
    expect(validateDraft(draftOf(graph))).toMatch(/note to staff/i)
  })

  it('survive reading the flow back from the database', () => {
    const graph = parseGraph({
      trigger: { x: 0, y: 0 },
      nodes: [
        { id: 'a1', type: 'action', action: 'remove_tag', value: '4', mins: 0, after: true, x: 0, y: 0 },
        { id: 'a2', type: 'action', action: 'create_task', value: '{"to":"pic","title":"x","days":1}', mins: 0, after: true, x: 0, y: 0 },
      ],
      edges: [],
    })
    expect(graph.nodes.map((node) => (node.type === 'action' ? node.action : node.type))).toEqual(['remove_tag', 'create_task'])
  })
})

describe('the new conditions in the tester', () => {
  it('lessons left is exactly', () => {
    const graph = gate({ id: 'c1', type: 'condition', kind: 'hours_is', x: 0, y: 0, value: 3 })
    expect(sent(graph, { age: null, classroomId: null, hours: 3 })).toBe(true)
    expect(sent(graph, { age: null, classroomId: null, hours: 2 })).toBe(false)
  })

  it('absent in a row', () => {
    const graph = gate({ id: 'c1', type: 'condition', kind: 'absent_streak', x: 0, y: 0, min: 2 })
    expect(sent(graph, { age: null, classroomId: null, absentStreak: 2 })).toBe(true)
    expect(sent(graph, { age: null, classroomId: null, absentStreak: 1 })).toBe(false)
  })

  it('does not have a tag', () => {
    const graph = gate({ id: 'c1', type: 'condition', kind: 'tag_not', x: 0, y: 0, ids: ['5'] })
    expect(sent(graph, { age: null, classroomId: null, tagId: null })).toBe(true)
    expect(sent(graph, { age: null, classroomId: null, tagId: 5 })).toBe(false)
  })

  it('lead or student', () => {
    const graph = gate({ id: 'c1', type: 'condition', kind: 'subject', x: 0, y: 0, is: 'lead' })
    expect(sent(graph, { age: null, classroomId: null, isStudent: false })).toBe(true)
    expect(sent(graph, { age: null, classroomId: null, isStudent: true })).toBe(false)
  })

  it('day and time: the end hour is not included', () => {
    const graph = gate({ id: 'c1', type: 'condition', kind: 'weekday', x: 0, y: 0, days: [1, 2, 3, 4, 5], from: 9, to: 21 })
    expect(sent(graph, { age: null, classroomId: null, weekday: 2, hour: 9 })).toBe(true)
    expect(sent(graph, { age: null, classroomId: null, weekday: 2, hour: 21 })).toBe(false)
    expect(sent(graph, { age: null, classroomId: null, weekday: 0, hour: 10 })).toBe(false)
  })

  it('the tag added and the absence kind', () => {
    const tag = gate({ id: 'c1', type: 'condition', kind: 'tag_added', x: 0, y: 0, ids: ['7'] })
    expect(sent(tag, { age: null, classroomId: null, addedTagId: '7' })).toBe(true)
    const kind = gate({ id: 'c1', type: 'condition', kind: 'att_status', x: 0, y: 0, ids: ['sick'] })
    expect(sent(kind, { age: null, classroomId: null, attStatus: 'absent' })).toBe(false)
  })

  it('a day and time block with no day, or the hours the wrong way round, cannot be saved', () => {
    const noDay = gate({ id: 'c1', type: 'condition', kind: 'weekday', x: 0, y: 0, days: [], from: 9, to: 21 })
    expect(validateDraft(draftOf(noDay))).toMatch(/day/)
    const backwards = gate({ id: 'c1', type: 'condition', kind: 'weekday', x: 0, y: 0, days: [1], from: 20, to: 9 })
    expect(validateDraft(draftOf(backwards))).toMatch(/before/)
  })
})

describe('the "+" menu', () => {
  const kinds = (trigger: Parameters<typeof pickGroupsFor>[0]) =>
    pickGroupsFor(trigger).flatMap((group) => group.picks.map((pick) => pick.kind))

  it('offers the absence checks only for an absence flow', () => {
    expect(kinds('class_absent')).toEqual(expect.arrayContaining(['absent_streak', 'att_status', 'notify_staff', 'create_task']))
    expect(kinds('lead_created')).not.toContain('absent_streak')
    expect(kinds('lead_created')).not.toContain('tag_added')
    expect(kinds('lead_tag')).toContain('tag_added')
  })
})

describe('the weekly limit per family', () => {
  it('is 0 to 50', () => {
    expect(validateAutoSend({ ...DEFAULT_AUTO_SEND, familyWeeklyCap: 5 })).toBeNull()
    expect(validateAutoSend({ ...DEFAULT_AUTO_SEND, familyWeeklyCap: 0 })).toBeNull()
    expect(validateAutoSend({ ...DEFAULT_AUTO_SEND, familyWeeklyCap: 51 })).toMatch(/0 to 50/)
  })
})
