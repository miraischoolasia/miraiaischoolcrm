import { brand } from './brand'
import {
  TRIGGER_ID,
  addNode,
  isAction,
  isCondition,
  isMessage,
  nextNodeId,
  triggerInfo,
  type ActionNode,
  type ConditionNode,
  type FlowDraft,
  type FlowEdge,
  type FlowGraph,
  type FlowNode,
  type FlowTrigger,
  type MessageNode,
  type NewBlockKind,
  type ReplyCondition,
  type WaitCondition,
} from './automationFlows'
import type { AutomationContact } from './automationContacts'

// The simple builder shows a flow as a list: "Only for" filters, then the messages in time order, then
// (optionally) one "wait for a reply" step with what happens next. That is a plain way of reading the
// same graph the canvas draws, as long as the flow has this shape:
//
//   trigger -> filter -> ... -> message, message, ... -> wait
//                                                        |- replied -> [a reply has words -> messages]...
//                                                        |             (each word check on its own)
//                                                        '- no reply -> messages
//
// (filters are conditions whose "No" goes nowhere, so a lead that does not match simply gets nothing).
// A flow with other Yes/No branches, or with blocks that no line reaches, is not this shape and is opened in
// the advanced editor instead.

// One "if the reply has these words" check and what is sent when it does.
export type ReplyRule = { cond: ReplyCondition; messages: MessageNode[] }

// What happens after the parent has been asked something.
//   rules   word checks, each on its own: when ANY message the parent writes while we wait has one of
//           its words, its messages are sent (a parent who writes two or three messages is read as a whole)
//   any     sent as soon as the parent writes anything at all (usually left empty)
//   none    sent when the parent stayed quiet until the waiting ran out
// A parent who replies without any of the words gets nothing from the rules.
export type ReplyPlan = {
  wait: WaitCondition
  rules: ReplyRule[]
  any: MessageNode[]
  none: MessageNode[]
}

export type FlowParts = {
  filters: ConditionNode[]
  messages: MessageNode[]
  // Waiting for a reply and what follows it; left out when the flow does not wait.
  reply?: ReplyPlan | null
}

export type FlowAnalysis = ({ simple: true } & FlowParts) | { simple: false; reason: string }

export function analyzeFlow(graph: FlowGraph): FlowAnalysis {
  // A step that changes the lead (a tag, a PIC, a stage) sits anywhere in the graph; the list has no place
  // for it, so such a flow is read in the advanced editor.
  if (graph.nodes.some(isAction)) {
    return { simple: false, reason: 'It has a step that changes the lead (a tag, a source, a PIC or a stage, or making the lead).' }
  }
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
    if (!node || !isCondition(node) || node.kind === 'wait') {
      break
    }
    if (node.kind === 'reply') {
      return { simple: false, reason: 'It checks a reply before anything was asked.' }
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
  let wait: WaitCondition | null = null
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
      if (isCondition(node) && node.kind === 'wait' && wait === null) {
        wait = node
        continue
      }
      return { simple: false, reason: 'It asks a question after a message.' }
    }
    messages.push(node)
    stack.push(...outs(id, 'out'))
  }

  // Messages (and the messages that follow them) of one branch; null when the branch asks something else.
  const collect = (starts: string[]): MessageNode[] | null => {
    const list: MessageNode[] = []
    const pending = [...starts]
    while (pending.length > 0) {
      const id = pending.pop() as string
      const node = byId.get(id)
      if (!node || seen.has(id) || !isMessage(node)) {
        return null
      }
      seen.add(id)
      list.push(node)
      pending.push(...outs(id, 'out'))
    }
    return list
  }

  let reply: ReplyPlan | null = null
  if (wait !== null) {
    const rules: ReplyRule[] = []
    const anyStarts: string[] = []
    for (const target of outs(wait.id, 'yes')) {
      const node = byId.get(target)
      if (node && isCondition(node) && node.kind === 'reply') {
        if (seen.has(node.id)) {
          return { simple: false, reason: 'Two lines lead to the same block.' }
        }
        seen.add(node.id)
        if (outs(node.id, 'no').length > 0) {
          return { simple: false, reason: 'A word check has something on its No side.' }
        }
        const matched = collect(outs(node.id, 'yes'))
        if (matched === null) {
          return { simple: false, reason: 'It asks another question after a reply.' }
        }
        rules.push({ cond: node, messages: orderMessages(matched) })
      } else {
        anyStarts.push(target)
      }
    }
    const any = collect(anyStarts)
    const none = collect(outs(wait.id, 'no'))
    if (any === null || none === null) {
      return { simple: false, reason: 'It asks another question after a reply.' }
    }
    reply = { wait, rules, any: orderMessages(any), none: orderMessages(none) }
  }

  if (seen.size - 1 !== graph.nodes.length) {
    return { simple: false, reason: 'It has blocks that no line reaches.' }
  }
  return { simple: true, filters, messages: orderMessages(messages), ...(reply ? { reply } : {}) }
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

  const reply = parts.reply
  if (reply) {
    // The wait hangs off the last message (it starts when that one is sent), or off the filters.
    const last = parts.messages[parts.messages.length - 1]
    const waitX = messageX + 300
    nodes.push({ ...reply.wait, x: waitX, y })
    edges.push(last ? { from: last.id, port: 'out', to: reply.wait.id } : { from, port, to: reply.wait.id })

    // Messages in a reply branch are counted from the reply (or the end of the waiting), so they all go "after".
    const branch = (list: MessageNode[], x: number, top: number) =>
      list.map((message, index) => ({ ...message, after: true, x, y: top + index * 130 }) as MessageNode)

    let cursorY = y - 150
    const afterRules = waitX + 300
    reply.rules.forEach((rule) => {
      nodes.push({ ...rule.cond, x: afterRules, y: cursorY })
      edges.push({ from: reply.wait.id, port: 'yes', to: rule.cond.id })
      const placed = branch(rule.messages, afterRules + 300, cursorY)
      placed.forEach((message) => {
        nodes.push(message)
        edges.push({ from: rule.cond.id, port: 'yes', to: message.id })
      })
      cursorY += Math.max(1, placed.length) * 130
    })
    const anyReply = branch(reply.any, afterRules, cursorY)
    anyReply.forEach((message) => {
      nodes.push(message)
      edges.push({ from: reply.wait.id, port: 'yes', to: message.id })
    })
    cursorY += Math.max(1, anyReply.length) * 130
    const none = branch(reply.none, afterRules, cursorY + 40)
    none.forEach((message) => {
      nodes.push(message)
      edges.push({ from: reply.wait.id, port: 'no', to: message.id })
    })
  }

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
  return buildGraph(
    graph,
    change({ filters: analysis.filters, messages: analysis.messages, reply: analysis.reply ?? null }),
  )
}

// Every block of the parts, so a new block gets an id nobody uses.
function allBlocks(parts: FlowParts): FlowNode[] {
  const reply = parts.reply
  return [
    ...parts.filters,
    ...parts.messages,
    ...(reply
      ? [
          reply.wait,
          ...reply.rules.flatMap((rule) => [rule.cond, ...rule.messages]),
          ...reply.any,
          ...reply.none,
        ]
      : []),
  ]
}

export function addFilter(graph: FlowGraph, kind: Exclude<NewBlockKind, 'message'>): FlowGraph {
  return changeParts(graph, (parts) => {
    const added = addNode({ trigger: graph.trigger, nodes: allBlocks(parts), edges: [] }, kind)
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
    id = nextNodeId({ trigger: graph.trigger, nodes: allBlocks(parts), edges: [] }, 'm')
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

// Puts the messages back in time order after a time was changed (the branches of a reply too).
export function reorderMessages(graph: FlowGraph): FlowGraph {
  return changeParts(graph, (parts) => ({
    ...parts,
    messages: orderMessages(parts.messages),
    reply: parts.reply && {
      ...parts.reply,
      rules: parts.reply.rules.map((rule) => ({ ...rule, messages: orderMessages(rule.messages) })),
      any: orderMessages(parts.reply.any),
      none: orderMessages(parts.reply.none),
    },
  }))
}

// ---- waiting for a reply

// Where a message of a reply branch goes: under one word check, "any other reply", or "no reply".
export type BranchTarget = { kind: 'rule'; condId: string } | { kind: 'any' } | { kind: 'none' }

function newReplyMessage(id: string, mins: number, text: string): MessageNode {
  return { id, type: 'message', x: 0, y: 0, mins, text, after: true }
}

// Adds "wait for a reply" after the messages: one word check to fill in, and a message for when the parent
// says nothing at all.
export function addReplyStep(graph: FlowGraph): { graph: FlowGraph; id: string } {
  let id = ''
  const next = changeParts(graph, (parts) => {
    if (parts.reply) {
      return parts
    }
    const pool: FlowGraph = { trigger: graph.trigger, nodes: allBlocks(parts), edges: [] }
    const waitId = nextNodeId(pool, 'c')
    pool.nodes.push({ id: waitId, type: 'condition', kind: 'wait', x: 0, y: 0, mins: 1440 })
    const ruleId = nextNodeId(pool, 'c')
    pool.nodes.push({ id: ruleId, type: 'condition', kind: 'reply', x: 0, y: 0, words: [] })
    const ruleMessageId = nextNodeId(pool, 'm')
    pool.nodes.push(newReplyMessage(ruleMessageId, 3, 'Hi {parent}, '))
    const noneId = nextNodeId(pool, 'm')
    id = waitId
    return {
      ...parts,
      reply: {
        wait: { id: waitId, type: 'condition', kind: 'wait', x: 0, y: 0, mins: 1440 },
        rules: [
          {
            cond: { id: ruleId, type: 'condition', kind: 'reply', x: 0, y: 0, words: [] },
            messages: [newReplyMessage(ruleMessageId, 3, 'Hi {parent}, ')],
          },
        ],
        any: [],
        none: [newReplyMessage(noneId, 60, 'Hi {parent}, just checking in. Do you have any questions?')],
      },
    }
  })
  return { graph: next, id }
}

export function removeReplyStep(graph: FlowGraph): FlowGraph {
  return changeParts(graph, (parts) => ({ ...parts, reply: null }))
}

// A new "if the reply has these words" check.
export function addReplyRule(graph: FlowGraph): { graph: FlowGraph; id: string } {
  let id = ''
  const next = changeParts(graph, (parts) => {
    if (!parts.reply) {
      return parts
    }
    const pool: FlowGraph = { trigger: graph.trigger, nodes: allBlocks(parts), edges: [] }
    const condId = nextNodeId(pool, 'c')
    pool.nodes.push({ id: condId, type: 'condition', kind: 'reply', x: 0, y: 0, words: [] })
    const messageId = nextNodeId(pool, 'm')
    id = condId
    const rule: ReplyRule = {
      cond: { id: condId, type: 'condition', kind: 'reply', x: 0, y: 0, words: [] },
      messages: [newReplyMessage(messageId, 3, 'Hi {parent}, ')],
    }
    return { ...parts, reply: { ...parts.reply, rules: [...parts.reply.rules, rule] } }
  })
  return { graph: next, id }
}

export function removeReplyRule(graph: FlowGraph, condId: string): FlowGraph {
  return changeParts(graph, (parts) =>
    parts.reply
      ? { ...parts, reply: { ...parts.reply, rules: parts.reply.rules.filter((rule) => rule.cond.id !== condId) } }
      : parts,
  )
}

export function addBranchMessage(graph: FlowGraph, target: BranchTarget): { graph: FlowGraph; id: string } {
  let id = ''
  const next = changeParts(graph, (parts) => {
    const reply = parts.reply
    if (!reply) {
      return parts
    }
    id = nextNodeId({ trigger: graph.trigger, nodes: allBlocks(parts), edges: [] }, 'm')
    const added = newReplyMessage(id, 60, 'Hi {parent}, ')
    if (target.kind === 'any') {
      return { ...parts, reply: { ...reply, any: [...reply.any, added] } }
    }
    if (target.kind === 'none') {
      return { ...parts, reply: { ...reply, none: [...reply.none, added] } }
    }
    return {
      ...parts,
      reply: {
        ...reply,
        rules: reply.rules.map((rule) =>
          rule.cond.id === target.condId ? { ...rule, messages: [...rule.messages, added] } : rule,
        ),
      },
    }
  })
  return { graph: next, id }
}

export function removeBranchMessage(graph: FlowGraph, id: string): FlowGraph {
  return changeParts(graph, (parts) => {
    const reply = parts.reply
    if (!reply) {
      return parts
    }
    const keep = (list: MessageNode[]) => list.filter((message) => message.id !== id)
    return {
      ...parts,
      reply: {
        ...reply,
        rules: reply.rules.map((rule) => ({ ...rule, messages: keep(rule.messages) })),
        any: keep(reply.any),
        none: keep(reply.none),
      },
    }
  })
}


// ---- how the triggers are grouped in the picker

export const TRIGGER_GROUPS: { label: string; keys: FlowTrigger[] }[] = [
  { label: 'Leads and forms', keys: ['lead_created', 'form_submitted', 'lead_idle', 'task_due'] },
  { label: 'Chats', keys: ['message_keyword', 'parent_no_reply', 'parent_waiting'] },
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

// A flow that starts from a message with a keyword: make the lead, tag it, set its source, then say hello. The
// steps that change the lead are drawn on the canvas, so it opens in the Advanced view. The tag, the source and
// the keywords are for the person to fill in.
function keywordLeadDraft(): FlowDraft {
  const step = (id: string, action: ActionNode['action'], x: number): ActionNode => ({
    id,
    type: 'action',
    x,
    y: 140,
    action,
    value: '',
    mins: 0,
    after: true,
  })
  const hello = message('m1', 5, `Hi {parent}, thank you for writing to ${brand.name}! How can we help you today?`, {
    after: true,
  })
  return {
    id: null,
    name: 'Keyword message to lead',
    trigger: 'message_keyword',
    enabled: false,
    graph: {
      trigger: { x: 24, y: 140 },
      nodes: [step('a1', 'make_lead', 300), step('a2', 'add_tag', 580), step('a3', 'set_source', 860), { ...hello, x: 1140, y: 140 }],
      edges: [
        { from: TRIGGER_ID, port: 'out', to: 'a1' },
        { from: 'a1', port: 'out', to: 'a2' },
        { from: 'a2', port: 'out', to: 'a3' },
        { from: 'a3', port: 'out', to: 'm1' },
      ],
      settings: { channels: ['whatsapp', 'messenger', 'instagram'], stopStages: ['converted', 'lost'] },
    },
  }
}

export const FLOW_RECIPES: FlowRecipe[] = [
  {
    key: 'keyword_to_lead',
    title: 'Turn a message with a keyword into a lead',
    summary:
      'Someone writes one of your words on WhatsApp, Messenger or Instagram: they become a lead with the tag and the source you pick, then you say hello. Add more steps after it.',
    build: () => keywordLeadDraft(),
  },
  {
    key: 'lead_from_keyword',
    title: 'Message leads who came in with a source keyword',
    summary: 'A lead is made from a WhatsApp first message with the keyword you pick: say hello five minutes later.',
    build: () =>
      recipeDraft(
        'Welcome leads from a source keyword',
        'lead_created',
        [{ id: 'c1', type: 'condition', kind: 'keyword', x: 0, y: 0, ids: [] }],
        [message('m1', 5, `Hi {parent}, thank you for your interest in ${brand.name}! How can we help you today?`, { after: true })],
        { stopStages: ['converted', 'lost'] },
      ),
  },
  {
    key: 'lead_from_source',
    title: 'Message leads from one source',
    summary: 'A lead comes in from the source you pick (for example Facebook Ads): say hello five minutes later.',
    build: () =>
      recipeDraft(
        'Welcome leads from a source',
        'lead_created',
        [{ id: 'c1', type: 'condition', kind: 'source', x: 0, y: 0, ids: [] }],
        [message('m1', 5, `Hi {parent}, thank you for your interest in ${brand.name}! How can we help you today?`, { after: true })],
        { stopStages: ['converted', 'lost'] },
      ),
  },
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
        [message('m1', 5, `Hi {parent}, thank you for your interest in ${brand.name}! How can we help you today?`, { after: true })],
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
