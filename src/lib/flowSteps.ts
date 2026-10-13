import {
  TRIGGER_ID,
  addNode,
  isMessage,
  nextNodeId,
  triggerInfo,
  type ConditionNode,
  type FlowDraft,
  type FlowEdge,
  type FlowGraph,
  type FlowNode,
  type FlowTrigger,
  type MessageNode,
  type NewBlockKind,
} from './automationFlows'
import type { AutomationContact } from './automationContacts'

// The simple builder shows a flow as a list: "Only for" filters, then the messages in time order.
// That is a plain way of reading the same graph the canvas draws, as long as the flow has this shape:
//
//   trigger -> filter -> filter -> ... -> message, message, ...
//
// (filters are conditions whose "No" goes nowhere, so a lead that does not match simply gets nothing).
// A flow with Yes/No branches, or with blocks that no line reaches, is not this shape and is opened in
// the advanced editor instead.

export type FlowParts = {
  filters: ConditionNode[]
  messages: MessageNode[]
}

export type FlowAnalysis = ({ simple: true } & FlowParts) | { simple: false; reason: string }

export function analyzeFlow(graph: FlowGraph): FlowAnalysis {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const outs = (id: string, port: FlowEdge['port']) =>
    graph.edges.filter((edge) => edge.from === id && edge.port === port).map((edge) => edge.to)

  const seen = new Set<string>([TRIGGER_ID])
  const filters: ConditionNode[] = []
  let from = TRIGGER_ID
  let port: FlowEdge['port'] = 'out'
  let targets = outs(from, port)

  // Leading conditions with nothing on their "No" side are filters.
  while (targets.length === 1) {
    const node = byId.get(targets[0])
    if (!node || isMessage(node)) {
      break
    }
    if (outs(node.id, 'no').length > 0) {
      return { simple: false, reason: 'It has a Yes and a No branch.' }
    }
    if (seen.has(node.id)) {
      return { simple: false, reason: 'It loops back on itself.' }
    }
    seen.add(node.id)
    filters.push(node)
    from = node.id
    port = 'yes'
    targets = outs(from, port)
  }

  const messages: MessageNode[] = []
  const stack = [...targets]
  while (stack.length > 0) {
    const id = stack.pop() as string
    const node = byId.get(id)
    if (!node) {
      continue
    }
    if (seen.has(id)) {
      return { simple: false, reason: 'Two lines lead to the same block.' }
    }
    seen.add(id)
    if (!isMessage(node)) {
      return { simple: false, reason: 'It asks a question after a message.' }
    }
    messages.push(node)
    stack.push(...outs(id, 'out'))
  }

  if (seen.size - 1 !== graph.nodes.length) {
    return { simple: false, reason: 'It has blocks that no line reaches.' }
  }
  return { simple: true, filters, messages: orderMessages(messages) }
}

// Time order: the ones before the event, furthest first, then the ones after it, soonest first.
export function orderMessages(messages: MessageNode[]): MessageNode[] {
  const key = (node: MessageNode) => (node.after === true ? node.mins : -node.mins)
  return [...messages].sort((a, b) => key(a) - key(b))
}

// The graph for a list of filters and messages, laid out left to right. The settings of the flow and the
// place of the trigger are kept.
export function buildGraph(base: FlowGraph, parts: FlowParts): FlowGraph {
  const edges: FlowEdge[] = []
  const nodes: FlowNode[] = []
  let from = TRIGGER_ID
  let port: FlowEdge['port'] = 'out'
  const startX = base.trigger.x + 276
  const y = base.trigger.y

  parts.filters.forEach((filter, index) => {
    nodes.push({ ...filter, x: startX + index * 260, y })
    edges.push({ from, port, to: filter.id })
    from = filter.id
    port = 'yes'
  })
  const messageX = startX + parts.filters.length * 260
  parts.messages.forEach((message, index) => {
    nodes.push({ ...message, x: messageX, y: y + index * 130 - ((parts.messages.length - 1) * 130) / 2 })
    edges.push({ from, port, to: message.id })
  })

  const next: FlowGraph = { trigger: base.trigger, nodes, edges }
  if (base.settings) {
    next.settings = base.settings
  }
  return next
}

// Applies a change to the parts of a simple flow, and returns the new graph (or the same graph when the
// flow is not a simple one).
export function changeParts(graph: FlowGraph, change: (parts: FlowParts) => FlowParts): FlowGraph {
  const analysis = analyzeFlow(graph)
  if (!analysis.simple) {
    return graph
  }
  return buildGraph(graph, change({ filters: analysis.filters, messages: analysis.messages }))
}

export function addFilter(graph: FlowGraph, kind: Exclude<NewBlockKind, 'message'>): FlowGraph {
  return changeParts(graph, (parts) => {
    const added = addNode({ trigger: graph.trigger, nodes: [...parts.filters, ...parts.messages], edges: [] }, kind)
    const node = added.graph.nodes.find((entry) => entry.id === added.id) as ConditionNode
    return { ...parts, filters: [...parts.filters, node] }
  })
}

export function removeFilter(graph: FlowGraph, id: string): FlowGraph {
  return changeParts(graph, (parts) => ({ ...parts, filters: parts.filters.filter((filter) => filter.id !== id) }))
}

// A new message after the last one: a day later, or an hour before for events that can be told early.
export function addMessageStep(graph: FlowGraph, trigger: FlowTrigger): { graph: FlowGraph; id: string } {
  const afterOnly = triggerInfo(trigger).afterOnly === true
  let id = ''
  const next = changeParts(graph, (parts) => {
    const all: FlowNode[] = [...parts.filters, ...parts.messages]
    id = nextNodeId({ trigger: graph.trigger, nodes: all, edges: [] }, 'm')
    const last = parts.messages[parts.messages.length - 1]
    const message: MessageNode = {
      id,
      type: 'message',
      x: 0,
      y: 0,
      mins: afterOnly ? (last && last.after === true ? last.mins + 1440 : 1440) : 60,
      text: 'Hi {parent}, ',
      ...(afterOnly ? { after: true } : {}),
    }
    return { ...parts, messages: orderMessages([...parts.messages, message]) }
  })
  return { graph: next, id }
}

export function removeMessageStep(graph: FlowGraph, id: string): FlowGraph {
  return changeParts(graph, (parts) => ({ ...parts, messages: parts.messages.filter((message) => message.id !== id) }))
}

// Puts the messages back in time order after a time was changed.
export function reorderMessages(graph: FlowGraph): FlowGraph {
  return changeParts(graph, (parts) => ({ ...parts, messages: orderMessages(parts.messages) }))
}

// ---- how the triggers are grouped in the picker

export const TRIGGER_GROUPS: { label: string; keys: FlowTrigger[] }[] = [
  { label: 'Leads and forms', keys: ['lead_created', 'form_submitted', 'lead_idle', 'task_due'] },
  { label: 'WhatsApp chats', keys: ['parent_no_reply', 'parent_waiting'] },
  { label: 'Classes', keys: ['class_start', 'replacement_start', 'trial_booked', 'trial_start', 'zoom_start'] },
  { label: 'Students and fees', keys: ['lesson_expiry', 'account_fee_expiry', 'club_fee_expiry', 'package_start'] },
]

// ---- recipes: a flow that is already written, to start from

export type FlowRecipe = {
  key: string
  title: string
  summary: string
  // The messages go to the team, so a contact (for example yourself) must exist.
  toTeam?: boolean
  // Builds the draft; null when it cannot be built yet (no contact for a flow that tells the team).
  build: (contacts: AutomationContact[]) => FlowDraft | null
}

function recipeDraft(
  name: string,
  trigger: FlowTrigger,
  filters: ConditionNode[],
  messages: MessageNode[],
  settings?: FlowGraph['settings'],
): FlowDraft {
  const graph = buildGraph(
    { trigger: { x: 24, y: 140 }, nodes: [], edges: [], ...(settings ? { settings } : {}) },
    { filters, messages: orderMessages(messages) },
  )
  return { id: null, name, trigger, enabled: false, graph }
}

const message = (id: string, mins: number, text: string, extra: Partial<MessageNode> = {}): MessageNode => ({
  id,
  type: 'message',
  x: 0,
  y: 0,
  mins,
  text,
  ...extra,
})

export const FLOW_RECIPES: FlowRecipe[] = [
  {
    key: 'follow_up_quiet',
    title: 'Follow up a parent who went quiet',
    summary: 'We wrote and they did not reply: nudge after 4 hours, 1 day and 3 days. Stops when they reply.',
    build: () =>
      recipeDraft(
        'Follow up quiet parents',
        'parent_no_reply',
        [{ id: 'c1', type: 'condition', kind: 'stage', x: 0, y: 0, stages: ['new', 'contacted', 'trial_scheduled', 'trial_completed'] }],
        [
          message('m1', 240, 'Hi {parent}, just checking in. Do you have any questions about the class for {child}?', { after: true }),
          message('m2', 1440, 'Hi {parent}, we would love to have {child} join us. Shall I help you with the next step?', {
            after: true,
          }),
          message('m3', 4320, 'Hi {parent}, a last note from us: the next class has a few seats left. Let me know if you would like one.', {
            after: true,
          }),
        ],
        { stopStages: ['converted', 'lost'], cooldownDays: 14 },
      ),
  },
  {
    key: 'welcome_lead',
    title: 'Welcome a new lead',
    summary: 'Five minutes after a lead is added, say hello.',
    build: () =>
      recipeDraft(
        'Welcome new leads',
        'lead_created',
        [],
        [message('m1', 5, 'Hi {parent}, thank you for your interest in Mirai AI School! How can we help you today?', { after: true })],
        { stopStages: ['converted', 'lost'] },
      ),
  },
  {
    key: 'class_reminder',
    title: 'Remind parents before a class',
    summary: 'One hour before a regular class starts.',
    build: () =>
      recipeDraft('Class reminder', 'class_start', [], [
        message('m1', 60, 'Hi {child}, a reminder that you have class today at {time}. Please be on time.'),
      ]),
  },
  {
    key: 'lessons_low',
    title: 'Tell me when lessons run low',
    summary: 'When a class starts and a child has 2 lesson hours or fewer left, message you.',
    toTeam: true,
    build: (contacts) => {
      const to = contacts[0]
      if (!to) {
        return null
      }
      return recipeDraft(
        'Lessons running low',
        'class_start',
        [{ id: 'c1', type: 'condition', kind: 'hours', x: 0, y: 0, max: 2 }],
        [
          message('m1', 120, '{child} has {hours_left} lesson hours left ({class}, {time}). Time to talk about renewing.', {
            contactId: to.id,
          }),
        ],
      )
    },
  },
  {
    key: 'fee_ending',
    title: 'Remind parents the account fee is ending',
    summary: 'Two weeks before a child’s account fee ends.',
    build: () =>
      recipeDraft('Account fee reminder', 'account_fee_expiry', [], [
        message('m1', 14 * 1440, 'Hi {parent}, a reminder that {child}’s account fee ends on {date}. Please let us know if you would like to renew.'),
      ]),
  },
]
