import { describe, expect, it } from 'vitest'
import {
  parseGraph,
  updateSettings,
  validateDraft,
  type FlowDraft,
  type FlowGraph,
  type MessageNode,
} from './automationFlows'
import { canSend, queueWhere, queueWho, type QueueItem } from './automationQueue'

const WORKFLOW = '61d29b39-d768-4416-9165-4f93c5a12fa3'

const message = (change: Partial<MessageNode> = {}): MessageNode => ({
  id: 'm1',
  type: 'message',
  x: 0,
  y: 0,
  mins: 3,
  after: true,
  text: 'Buttons: A / B',
  ...change,
})

const graphOf = (node: MessageNode, settings?: FlowGraph['settings']): FlowGraph => ({
  trigger: { x: 24, y: 140 },
  nodes: [node],
  edges: [{ from: 'trigger', port: 'out', to: node.id }],
  ...(settings ? { settings } : {}),
})

const draftOf = (graph: FlowGraph): FlowDraft => ({ id: null, name: 'Buttons', trigger: 'lead_created', enabled: false, graph })

describe('where a flow sends', () => {
  it('writes nothing for WhatsApp alone, which is what a flow without the setting does', () => {
    const base = graphOf(message())
    expect(updateSettings(base, { channels: ['whatsapp'] }).settings).toBeUndefined()
    expect(updateSettings(base, { channels: [] }).settings).toBeUndefined()
  })

  it('keeps the ticked channels in a fixed order', () => {
    const next = updateSettings(graphOf(message()), { channels: ['instagram', 'whatsapp', 'messenger'] })
    expect(next.settings?.channels).toEqual(['whatsapp', 'messenger', 'instagram'])
  })

  it('is read back from what was saved, and unknown channels are dropped', () => {
    const saved = { trigger: { x: 1, y: 1 }, nodes: [], edges: [], settings: { channels: ['messenger', 'sms'], autoSend: true } }
    expect(parseGraph(saved).settings).toEqual({ autoSend: true, channels: ['messenger'] })
    expect(parseGraph({ ...saved, settings: { channels: ['whatsapp'] } }).settings).toBeUndefined()
  })
})

describe('a button message', () => {
  it('keeps its workflow id when saved and read back', () => {
    const graph = graphOf(message({ ghlWorkflowId: WORKFLOW }), { autoSend: true, channels: ['messenger'] })
    const back = parseGraph(JSON.parse(JSON.stringify(graph)))
    expect(back.nodes[0]).toMatchObject({ type: 'message', ghlWorkflowId: WORKFLOW })
  })

  it('needs a real workflow id', () => {
    const graph = graphOf(message({ ghlWorkflowId: 'nope' }), { autoSend: true, channels: ['messenger'] })
    expect(validateDraft(draftOf(graph))).toMatch(/workflow id/)
  })

  it('needs the flow to send by itself on Messenger or Instagram', () => {
    const node = message({ ghlWorkflowId: WORKFLOW })
    expect(validateDraft(draftOf(graphOf(node)))).toMatch(/send by itself on Messenger or Instagram/)
    expect(validateDraft(draftOf(graphOf(node, { autoSend: true })))).toMatch(/Messenger or Instagram/)
    expect(validateDraft(draftOf(graphOf(node, { channels: ['messenger'] })))).toMatch(/send by itself/)
    expect(validateDraft(draftOf(graphOf(node, { autoSend: true, channels: ['instagram'] })))).toBeNull()
    expect(validateDraft(draftOf(graphOf(node, { autoSend: true, channels: ['messenger'] })))).toBeNull()
  })

  it('is not asked of an ordinary message', () => {
    expect(validateDraft(draftOf(graphOf(message())))).toBeNull()
  })
})

const item = (change: Partial<QueueItem>): QueueItem => ({
  id: 1,
  ruleKey: 'flow_1',
  ruleName: 'Buttons',
  phone: null,
  conversationId: 55,
  channel: 'messenger',
  kind: 'message',
  parentName: null,
  childName: null,
  leadId: 3,
  studentId: null,
  message: 'Hi',
  status: 'pending',
  dueAt: '2026-10-14T09:00:00+08:00',
  expiresAt: null,
  decidedAt: null,
  sentAt: null,
  error: null,
  createdAt: '2026-10-13T09:00:00+08:00',
  autoBlocked: null,
  mediaUrl: null,
  ...change,
})

const NOW = Date.parse('2026-10-14T10:00:00+08:00')

describe('a queued message for a chat with no number', () => {
  it('is named by its channel, not a number', () => {
    expect(queueWho(item({}))).toBe('Messenger chat')
    expect(queueWhere(item({ channel: 'instagram' }))).toBe('Instagram')
    expect(queueWho(item({ parentName: 'Mrs Lim' }))).toBe('Mrs Lim')
    expect(queueWhere(item({ phone: '60123456789', conversationId: null, channel: 'whatsapp' }))).toBe('+60123456789')
  })

  it('can be sent from the window, but a button message cannot (only the sender program starts it)', () => {
    expect(canSend(item({}), NOW)).toBe(true)
    expect(canSend(item({ kind: 'ghl_workflow' }), NOW)).toBe(false)
  })
})
