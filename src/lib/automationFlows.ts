import { supabase } from './supabase'

// Automation flows: the drag-and-drop canvas on the Automations page. A flow is one trigger and a
// small graph of conditions and messages. The database runs every enabled flow every 15 minutes and
// adds the messages it makes to the approval queue; nothing is sent until a person approves it.

export type FlowTrigger = 'class_start' | 'replacement_start' | 'trial_start' | 'zoom_start'

export type TriggerInfo = {
  key: FlowTrigger
  // How it reads in the "When" box.
  label: string
  // How it reads inside a sentence ("a regular class starts").
  phrase: string
  // The kind of classroom a class condition can pick from; null when the event has no class.
  classroomCategory: 'regular' | 'trial' | null
}

export const TRIGGERS: TriggerInfo[] = [
  {
    key: 'class_start',
    label: 'A regular class starts',
    phrase: 'a regular class starts',
    classroomCategory: 'regular',
  },
  {
    key: 'replacement_start',
    label: 'A replacement class starts',
    phrase: 'a replacement class starts',
    classroomCategory: 'regular',
  },
  { key: 'trial_start', label: 'A trial class starts', phrase: 'a trial class starts', classroomCategory: 'trial' },
  { key: 'zoom_start', label: 'A Zoom meeting starts', phrase: 'a Zoom meeting starts', classroomCategory: null },
]

export function triggerInfo(key: FlowTrigger): TriggerInfo {
  return TRIGGERS.find((entry) => entry.key === key) ?? TRIGGERS[0]
}

type Placed = { id: string; x: number; y: number }

export type MessageNode = Placed & { type: 'message'; mins: number; text: string }
export type AgeCondition = Placed & { type: 'condition'; kind: 'age'; min: number | null; max: number | null }
export type ClassroomCondition = Placed & { type: 'condition'; kind: 'classroom'; ids: number[] }
export type ConditionNode = AgeCondition | ClassroomCondition
export type FlowNode = MessageNode | ConditionNode

export type FlowPort = 'out' | 'yes' | 'no'
export type FlowEdge = { from: string; port: FlowPort; to: string }

export type FlowGraph = {
  trigger: { x: number; y: number }
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export type AutomationFlow = {
  id: number
  name: string
  trigger: FlowTrigger
  enabled: boolean
  graph: FlowGraph
  lastRunAt: string | null
  lastError: string | null
}

// What the editor holds while a flow is being written; id is null for one not saved yet.
export type FlowDraft = {
  id: number | null
  name: string
  trigger: FlowTrigger
  enabled: boolean
  graph: FlowGraph
}

export const TRIGGER_ID = 'trigger'
export const MIN_OFFSET_MINUTES = 3
export const MAX_OFFSET_MINUTES = 7 * 24 * 60
export const MAX_NODES = 40

export const PLACEHOLDERS = [
  { token: '{child}', hint: "The child's name" },
  { token: '{parent}', hint: "The parent's name" },
  { token: '{time}', hint: 'The start time, like 8:30 pm' },
  { token: '{date}', hint: 'The day, like Tue 14 Oct' },
  { token: '{class}', hint: 'The class name' },
] as const

const SAMPLE_VALUES: Record<string, string> = {
  '{child}': 'Ethan',
  '{parent}': 'Mrs Lim',
  '{time}': '8:30 pm',
  '{date}': 'Tue 14 Oct',
  '{class}': 'Coder A',
}

// The text with the placeholders replaced by an example child, so the writer sees what a parent
// will read.
export function previewMessage(template: string) {
  return Object.entries(SAMPLE_VALUES).reduce((text, [token, value]) => text.split(token).join(value), template)
}

// Words in {braces} the database would leave as they are.
export function unknownPlaceholders(message: string) {
  const known = new Set<string>(PLACEHOLDERS.map((entry) => entry.token))
  const found = message.match(/\{[^{}\s]{1,30}\}/g) ?? []
  return [...new Set(found.filter((token) => !known.has(token)))]
}

export type OffsetUnit = 'minutes' | 'hours' | 'days'

const UNIT_MINUTES: Record<OffsetUnit, number> = { minutes: 1, hours: 60, days: 1440 }

export function splitOffset(totalMinutes: number): { value: number; unit: OffsetUnit } {
  if (totalMinutes > 0 && totalMinutes % UNIT_MINUTES.days === 0) {
    return { value: totalMinutes / UNIT_MINUTES.days, unit: 'days' }
  }
  if (totalMinutes > 0 && totalMinutes % UNIT_MINUTES.hours === 0) {
    return { value: totalMinutes / UNIT_MINUTES.hours, unit: 'hours' }
  }
  return { value: totalMinutes, unit: 'minutes' }
}

export function toOffsetMinutes(value: number, unit: OffsetUnit) {
  return Math.round(value * UNIT_MINUTES[unit])
}

export function describeOffset(totalMinutes: number) {
  const { value, unit } = splitOffset(totalMinutes)
  const word = value === 1 ? unit.slice(0, -1) : unit
  return `${value} ${word}`
}

export function isMessage(node: FlowNode): node is MessageNode {
  return node.type === 'message'
}

// A one-line reading of a block, for the canvas and the list.
export function describeNode(node: FlowNode, classroomName: (id: number) => string = (id) => `Class ${id}`) {
  if (isMessage(node)) {
    return `${describeOffset(node.mins)} before`
  }
  if (node.kind === 'age') {
    if (node.min !== null && node.max !== null) {
      return node.min === node.max ? `Age ${node.min}?` : `Age ${node.min} to ${node.max}?`
    }
    if (node.min !== null) {
      return `Age ${node.min} or older?`
    }
    return `Age ${node.max} or younger?`
  }
  const names = node.ids.map(classroomName)
  return names.length <= 2 ? `In ${names.join(' or ')}?` : `In ${names.length} classes?`
}

export function edgeKey(edge: FlowEdge) {
  return `${edge.from}:${edge.port}:${edge.to}`
}

export function describeFlow(flow: Pick<AutomationFlow, 'trigger' | 'graph'>) {
  const messages = flow.graph.nodes.filter(isMessage).length
  const text = messages === 1 ? '1 message' : `${messages} messages`
  return `${triggerInfo(flow.trigger).label} · ${text}`
}

export function emptyGraph(): FlowGraph {
  return { trigger: { x: 24, y: 140 }, nodes: [], edges: [] }
}

export function newFlowDraft(): FlowDraft {
  const message: MessageNode = {
    id: 'm1',
    type: 'message',
    x: 300,
    y: 140,
    mins: 60,
    text: 'Hi {child}, a reminder that you have class today at {time}. Please be on time.',
  }
  return {
    id: null,
    name: '',
    trigger: 'class_start',
    enabled: false,
    graph: { trigger: { x: 24, y: 140 }, nodes: [message], edges: [{ from: TRIGGER_ID, port: 'out', to: 'm1' }] },
  }
}

export function draftOf(flow: AutomationFlow): FlowDraft {
  return {
    id: flow.id,
    name: flow.name,
    trigger: flow.trigger,
    enabled: flow.enabled,
    graph: JSON.parse(JSON.stringify(flow.graph)) as FlowGraph,
  }
}

// The next free block id such as m3 or c2.
export function nextNodeId(graph: FlowGraph, prefix: 'm' | 'c') {
  const used = new Set(graph.nodes.map((node) => node.id))
  let n = 1
  while (used.has(`${prefix}${n}`)) {
    n += 1
  }
  return `${prefix}${n}`
}

export type NewBlockKind = 'message' | 'age' | 'classroom'

export function addNode(
  graph: FlowGraph,
  kind: NewBlockKind,
  at?: { x: number; y: number },
): { graph: FlowGraph; id: string } {
  const offset = graph.nodes.length % 6
  const x = at?.x ?? 300 + offset * 24
  const y = at?.y ?? 40 + offset * 56
  if (kind === 'message') {
    const id = nextNodeId(graph, 'm')
    const node: MessageNode = {
      id,
      type: 'message',
      x,
      y,
      mins: 60,
      text: 'Hi {child}, a reminder about class at {time}.',
    }
    return { graph: { ...graph, nodes: [...graph.nodes, node] }, id }
  }
  const id = nextNodeId(graph, 'c')
  const node: ConditionNode =
    kind === 'age'
      ? { id, type: 'condition', kind: 'age', x, y, min: 10, max: null }
      : { id, type: 'condition', kind: 'classroom', x, y, ids: [] }
  return { graph: { ...graph, nodes: [...graph.nodes, node] }, id }
}

const STEP_X = 300
const STEP_Y = 130

// The "+" after a card: a new block to the right of it, joined to the given exit of that card. A
// second block from the same exit is placed below the first so the two do not sit on top of each other.
export function addNodeAfter(
  graph: FlowGraph,
  from: string,
  port: FlowPort,
  kind: NewBlockKind,
): { graph: FlowGraph; id: string | null } {
  const origin = from === TRIGGER_ID ? graph.trigger : graph.nodes.find((node) => node.id === from)
  if (!origin) {
    return { graph, id: null }
  }
  const x = origin.x + STEP_X
  let y = origin.y + (port === 'yes' ? -50 : port === 'no' ? 90 : 0)
  for (
    let tries = 0;
    tries < 30 && graph.nodes.some((n) => Math.abs(n.x - x) < 240 && Math.abs(n.y - y) < 120);
    tries++
  ) {
    y += STEP_Y
  }
  const added = addNode(graph, kind, { x, y })
  return { graph: connect(added.graph, { from, port, to: added.id }), id: added.id }
}

export function removeNode(graph: FlowGraph, id: string): FlowGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => node.id !== id),
    edges: graph.edges.filter((edge) => edge.from !== id && edge.to !== id),
  }
}

export function updateNode(
  graph: FlowGraph,
  id: string,
  change: Partial<MessageNode> | Partial<AgeCondition> | Partial<ClassroomCondition>,
): FlowGraph {
  return { ...graph, nodes: graph.nodes.map((node) => (node.id === id ? ({ ...node, ...change } as FlowNode) : node)) }
}

export function moveNode(graph: FlowGraph, id: string, x: number, y: number): FlowGraph {
  if (id === TRIGGER_ID) {
    return { ...graph, trigger: { x, y } }
  }
  return { ...graph, nodes: graph.nodes.map((node) => (node.id === id ? { ...node, x, y } : node)) }
}

// Draws a line, unless it would be meaningless: into the trigger, onto itself, from an exit the
// block does not have (the trigger and a message have "out", a condition has "yes" and "no"), or
// the same line twice.
export function connect(graph: FlowGraph, edge: FlowEdge): FlowGraph {
  if (edge.to === TRIGGER_ID || edge.from === edge.to) {
    return graph
  }
  const from = graph.nodes.find((node) => node.id === edge.from)
  if (edge.from !== TRIGGER_ID && !from) {
    return graph
  }
  const isBranch = from !== undefined && !isMessage(from)
  if (isBranch ? edge.port === 'out' : edge.port !== 'out') {
    return graph
  }
  if (!graph.nodes.some((node) => node.id === edge.to)) {
    return graph
  }
  if (graph.edges.some((existing) => edgeKey(existing) === edgeKey(edge))) {
    return graph
  }
  return { ...graph, edges: [...graph.edges, edge] }
}

export function disconnect(graph: FlowGraph, key: string): FlowGraph {
  return { ...graph, edges: graph.edges.filter((edge) => edgeKey(edge) !== key) }
}

export type FlowTestChild = { age: number | null; classroomId: number | null }

export type FlowTestResult = {
  nodes: Set<string>
  edges: Set<string>
  messages: MessageNode[]
}

// What the database would do for one child: walk from the trigger, answering each condition. The
// same rules as automation.flow_messages(): an unknown age or class goes down No.
export function simulateFlow(graph: FlowGraph, child: FlowTestChild): FlowTestResult {
  const nodes = new Set<string>()
  const edges = new Set<string>()
  const messages: MessageNode[] = []
  const stack: string[] = [TRIGGER_ID]

  while (stack.length > 0) {
    const id = stack.shift() as string
    if (nodes.has(id)) {
      continue
    }
    nodes.add(id)
    let port: FlowPort = 'out'
    if (id !== TRIGGER_ID) {
      const node = graph.nodes.find((entry) => entry.id === id)
      if (!node) {
        continue
      }
      if (isMessage(node)) {
        // The message is queued; whatever follows it is walked too.
        messages.push(node)
      } else if (node.kind === 'age') {
        const { age } = child
        const matches = age !== null && (node.min === null || age >= node.min) && (node.max === null || age <= node.max)
        port = matches ? 'yes' : 'no'
      } else {
        port = child.classroomId !== null && node.ids.includes(child.classroomId) ? 'yes' : 'no'
      }
    }
    for (const edge of graph.edges) {
      if (edge.from === id && edge.port === port) {
        edges.add(edgeKey(edge))
        stack.push(edge.to)
      }
    }
  }
  return { nodes, edges, messages }
}

// An error to show before saving, or null when the flow is fine. Mirrors the checks in the database.
export function validateDraft(draft: FlowDraft): string | null {
  if (draft.name.trim() === '') {
    return 'Give the flow a name.'
  }
  if (draft.name.trim().length > 80) {
    return 'The name can be up to 80 characters.'
  }
  if (draft.graph.nodes.length > MAX_NODES) {
    return `A flow can have up to ${MAX_NODES} blocks.`
  }
  if (!draft.graph.nodes.some(isMessage)) {
    return 'Add at least one message block.'
  }
  for (const node of draft.graph.nodes) {
    if (isMessage(node)) {
      if (!Number.isInteger(node.mins) || node.mins < MIN_OFFSET_MINUTES) {
        return `A message must be set at least ${MIN_OFFSET_MINUTES} minutes before.`
      }
      if (node.mins > MAX_OFFSET_MINUTES) {
        return 'A message can be set up to 7 days before.'
      }
      if (node.text.trim() === '') {
        return 'Every message needs text.'
      }
      if (node.text.length > 3000) {
        return 'A message can be up to 3000 characters.'
      }
    } else if (node.kind === 'age') {
      if (node.min === null && node.max === null) {
        return 'An age block needs a lowest or a highest age.'
      }
      for (const age of [node.min, node.max]) {
        if (age !== null && (!Number.isInteger(age) || age < 0 || age > 30)) {
          return 'Ages must be whole numbers from 0 to 30.'
        }
      }
      if (node.min !== null && node.max !== null && node.min > node.max) {
        return 'The lowest age is higher than the highest age.'
      }
    } else if (node.ids.length === 0) {
      return 'A class block needs at least one class ticked.'
    }
  }
  return null
}

// The blocks in the order a person reads them: from the trigger along the lines (Yes before No),
// then any block no line reaches, so nothing is hidden from the list.
export function orderedBlocks(graph: FlowGraph): { node: FlowNode; connected: boolean }[] {
  const order: string[] = []
  const seen = new Set<string>([TRIGGER_ID])
  const queue: string[] = [TRIGGER_ID]
  const rank: Record<FlowPort, number> = { out: 0, yes: 1, no: 2 }
  while (queue.length > 0) {
    const id = queue.shift() as string
    const next = graph.edges.filter((edge) => edge.from === id).sort((a, b) => rank[a.port] - rank[b.port])
    for (const edge of next) {
      if (!seen.has(edge.to)) {
        seen.add(edge.to)
        order.push(edge.to)
        queue.push(edge.to)
      }
    }
  }
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const connected = order.flatMap((id) => {
    const node = byId.get(id)
    return node ? [{ node, connected: true }] : []
  })
  const loose = graph.nodes.filter((node) => !seen.has(node.id)).map((node) => ({ node, connected: false }))
  return [...connected, ...loose]
}

// Blocks no line reaches from the trigger: they would never send anything.
export function unreachableMessages(graph: FlowGraph): MessageNode[] {
  const seen = new Set<string>([TRIGGER_ID])
  const stack = [TRIGGER_ID]
  while (stack.length > 0) {
    const id = stack.pop() as string
    for (const edge of graph.edges) {
      if (edge.from === id && !seen.has(edge.to)) {
        seen.add(edge.to)
        stack.push(edge.to)
      }
    }
  }
  return graph.nodes.filter(isMessage).filter((node) => !seen.has(node.id))
}

function numberOr(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function ageOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

// Reads the graph column defensively: anything unexpected is dropped instead of breaking the page.
export function parseGraph(raw: unknown): FlowGraph {
  if (!raw || typeof raw !== 'object') {
    return emptyGraph()
  }
  const source = raw as Record<string, unknown>
  const trigger = (source.trigger ?? {}) as Record<string, unknown>
  const nodes: FlowNode[] = []
  for (const item of Array.isArray(source.nodes) ? source.nodes : []) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const node = item as Record<string, unknown>
    if (typeof node.id !== 'string') {
      continue
    }
    const base = { id: node.id, x: numberOr(node.x, 300), y: numberOr(node.y, 140) }
    if (node.type === 'message') {
      nodes.push({
        ...base,
        type: 'message',
        mins: numberOr(node.mins, 60),
        text: typeof node.text === 'string' ? node.text : '',
      })
    } else if (node.type === 'condition' && node.kind === 'age') {
      nodes.push({ ...base, type: 'condition', kind: 'age', min: ageOrNull(node.min), max: ageOrNull(node.max) })
    } else if (node.type === 'condition' && node.kind === 'classroom') {
      const ids = Array.isArray(node.ids) ? node.ids.filter((id): id is number => typeof id === 'number') : []
      nodes.push({ ...base, type: 'condition', kind: 'classroom', ids })
    }
  }
  const known = new Set<string>([TRIGGER_ID, ...nodes.map((node) => node.id)])
  const edges: FlowEdge[] = []
  for (const item of Array.isArray(source.edges) ? source.edges : []) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const edge = item as Record<string, unknown>
    if (
      typeof edge.from === 'string' &&
      typeof edge.to === 'string' &&
      (edge.port === 'out' || edge.port === 'yes' || edge.port === 'no') &&
      known.has(edge.from) &&
      known.has(edge.to)
    ) {
      edges.push({ from: edge.from, port: edge.port, to: edge.to })
    }
  }
  return { trigger: { x: numberOr(trigger.x, 24), y: numberOr(trigger.y, 140) }, nodes, edges }
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  return supabase
}

export function automationFlowsErrorMessage(problem: unknown, fallback: string) {
  const text =
    problem instanceof Error
      ? problem.message
      : typeof problem === 'object' && problem && 'message' in problem
        ? String((problem as { message: unknown }).message)
        : ''
  const code =
    typeof problem === 'object' && problem && 'code' in problem ? String((problem as { code: unknown }).code) : ''
  if (/automation_flows|run_automation_rules/.test(text) && /(does not exist|schema cache|Could not find)/.test(text)) {
    return 'Automations are not set up in the database yet.'
  }
  if (/row-level security|permission denied|Only an admin/i.test(text)) {
    return 'Only an admin can change the automations.'
  }
  // The database refuses a bad flow with a sentence written for people.
  if (code === 'P0001' && text) {
    return text
  }
  return fallback
}

const COLUMNS = 'id, name, trigger_type, enabled, graph, last_run_at, last_error'

type FlowRow = {
  id: number
  name: string
  trigger_type: FlowTrigger
  enabled: boolean
  graph: unknown
  last_run_at: string | null
  last_error: string | null
}

function flowOf(row: FlowRow): AutomationFlow {
  return {
    id: row.id,
    name: row.name,
    trigger: row.trigger_type,
    enabled: row.enabled,
    graph: parseGraph(row.graph),
    lastRunAt: row.last_run_at,
    lastError: row.last_error,
  }
}

export async function fetchFlows(): Promise<AutomationFlow[]> {
  const { data, error } = await requireSupabase()
    .from('automation_flows')
    .select(COLUMNS)
    .order('id', { ascending: true })
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => flowOf(row as FlowRow))
}

// Adds a flow, or changes it when the draft has an id. Resolves to the saved flow.
export async function saveFlow(draft: FlowDraft): Promise<AutomationFlow> {
  const client = requireSupabase()
  const columns = {
    name: draft.name.trim(),
    trigger_type: draft.trigger,
    enabled: draft.enabled,
    graph: draft.graph,
  }
  if (draft.id === null) {
    const { data, error } = await client.from('automation_flows').insert(columns).select(COLUMNS).single()
    if (error) {
      throw error
    }
    return flowOf(data as FlowRow)
  }
  const { data, error } = await client.from('automation_flows').update(columns).eq('id', draft.id).select(COLUMNS)
  if (error) {
    throw error
  }
  const row = (data ?? [])[0]
  if (!row) {
    throw new Error('Only an admin can change the automations.')
  }
  return flowOf(row as FlowRow)
}

export async function setFlowEnabled(id: number, enabled: boolean) {
  const { data, error } = await requireSupabase().from('automation_flows').update({ enabled }).eq('id', id).select('id')
  if (error) {
    throw error
  }
  if ((data ?? []).length === 0) {
    throw new Error('Only an admin can change the automations.')
  }
}

export async function deleteFlow(id: number) {
  const { data, error } = await requireSupabase().from('automation_flows').delete().eq('id', id).select('id')
  if (error) {
    throw error
  }
  if ((data ?? []).length === 0) {
    throw new Error('Only an admin can change the automations.')
  }
}

// Runs the flows right now instead of waiting for the next 15 minutes. Resolves to how many
// messages were added to the approval queue.
export async function runFlowsNow(): Promise<number> {
  const { data, error } = await requireSupabase().rpc('run_automation_rules')
  if (error) {
    throw error
  }
  return typeof data === 'number' ? data : 0
}
