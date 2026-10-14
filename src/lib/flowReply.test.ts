import { describe, expect, it } from 'vitest'
import {
  TRIGGER_ID,
  describeNode,
  messageAnchors,
  parseGraph,
  simulateFlow,
  validateDraft,
  type FlowGraph,
  type MessageNode,
} from './automationFlows'
import {
  addBranchMessage,
  addReplyRule,
  addReplyStep,
  analyzeFlow,
  buildGraph,
  removeBranchMessage,
  removeReplyRule,
  removeReplyStep,
  reorderMessages,
} from './flowSteps'

const msg = (id: string, mins: number, text = `text ${id}`, extra: Partial<MessageNode> = {}): MessageNode => ({
  id,
  type: 'message',
  x: 0,
  y: 0,
  mins,
  text,
  after: true,
  ...extra,
})

const base: FlowGraph = { trigger: { x: 24, y: 140 }, nodes: [], edges: [] }

// "Ask the age, wait a day, then answer by what they said".
function askAndAnswer(): FlowGraph {
  return buildGraph(base, {
    filters: [],
    messages: [msg('m1', 3, 'How old is your child?', { imageUrl: 'https://x.test/poster.png' })],
    reply: {
      wait: { id: 'w1', type: 'condition', kind: 'wait', x: 0, y: 0, mins: 1440 },
      rules: [
        { cond: { id: 'r1', type: 'condition', kind: 'reply', x: 0, y: 0, words: ['7', 'seven'] }, messages: [msg('m2', 3)] },
        { cond: { id: 'r2', type: 'condition', kind: 'reply', x: 0, y: 0, words: ['Form 1'] }, messages: [msg('m3', 3)] },
      ],
      any: [],
      none: [msg('m5', 60)],
    },
  })
}

describe('a flow that waits for a reply', () => {
  it('is drawn as the wait after the last message, word checks side by side under Yes, and a No branch', () => {
    const graph = askAndAnswer()
    expect(graph.edges).toContainEqual({ from: TRIGGER_ID, port: 'out', to: 'm1' })
    expect(graph.edges).toContainEqual({ from: 'm1', port: 'out', to: 'w1' })
    expect(graph.edges).toContainEqual({ from: 'w1', port: 'yes', to: 'r1' })
    expect(graph.edges).toContainEqual({ from: 'w1', port: 'yes', to: 'r2' })
    expect(graph.edges).toContainEqual({ from: 'r1', port: 'yes', to: 'm2' })
    expect(graph.edges).toContainEqual({ from: 'r2', port: 'yes', to: 'm3' })
    expect(graph.edges).toContainEqual({ from: 'w1', port: 'no', to: 'm5' })
    // A word check that does not match has nothing after it.
    expect(graph.edges.some((edge) => edge.from === 'r1' && edge.port === 'no')).toBe(false)
  })

  it('is read back as the same plan', () => {
    const analysis = analyzeFlow(askAndAnswer())
    expect(analysis.simple).toBe(true)
    if (!analysis.simple || !analysis.reply) {
      throw new Error('expected a simple flow with a reply step')
    }
    expect(analysis.messages.map((message) => message.id)).toEqual(['m1'])
    expect(analysis.reply.wait.mins).toBe(1440)
    expect(analysis.reply.rules.map((rule) => [rule.cond.id, rule.cond.words, rule.messages.map((m) => m.id)])).toEqual([
      ['r1', ['7', 'seven'], ['m2']],
      ['r2', ['Form 1'], ['m3']],
    ])
    expect(analysis.reply.any).toEqual([])
    expect(analysis.reply.none.map((message) => message.id)).toEqual(['m5'])
  })

  it('can answer any reply whatever it says', () => {
    const graph = buildGraph(base, {
      filters: [],
      messages: [msg('m1', 3)],
      reply: {
        wait: { id: 'w1', type: 'condition', kind: 'wait', x: 0, y: 0, mins: 60 },
        rules: [],
        any: [msg('m2', 3)],
        none: [],
      },
    })
    expect(graph.edges).toContainEqual({ from: 'w1', port: 'yes', to: 'm2' })
    const analysis = analyzeFlow(graph)
    expect(analysis.simple && analysis.reply?.any.map((message) => message.id)).toEqual(['m2'])
  })

  it('keeps a flow with a question in a branch for the advanced editor', () => {
    const graph = askAndAnswer()
    graph.nodes.push({ id: 'c9', type: 'condition', kind: 'age', x: 0, y: 0, min: 5, max: 9 })
    graph.edges = graph.edges.filter((edge) => !(edge.from === 'w1' && edge.port === 'no'))
    graph.edges.push({ from: 'w1', port: 'no', to: 'c9' })
    expect(analyzeFlow(graph).simple).toBe(false)
  })

  it('keeps a word check with something on its No side for the advanced editor', () => {
    const graph = askAndAnswer()
    graph.edges.push({ from: 'r1', port: 'no', to: 'm3' })
    expect(analyzeFlow(graph).simple).toBe(false)
  })

  it('can add and remove the reply step, the word checks and the messages in a branch', () => {
    const start = buildGraph(base, { filters: [], messages: [msg('m1', 3)] })
    const added = addReplyStep(start)
    const withRule = addReplyRule(added.graph)
    const withMessage = addBranchMessage(withRule.graph, { kind: 'rule', condId: withRule.id })
    const analysis = analyzeFlow(withMessage.graph)
    expect(analysis.simple).toBe(true)
    if (!analysis.simple || !analysis.reply) {
      throw new Error('expected a reply step')
    }
    // The new step starts with one word check (to fill in) and a message for silence.
    expect(analysis.reply.rules).toHaveLength(2)
    expect(analysis.reply.rules[1].messages).toHaveLength(2)
    expect(analysis.reply.any).toHaveLength(0)
    expect(analysis.reply.none).toHaveLength(1)

    const withoutMessage = removeBranchMessage(withMessage.graph, withMessage.id)
    const afterRemove = analyzeFlow(withoutMessage)
    expect(afterRemove.simple && afterRemove.reply?.rules[1].messages).toHaveLength(1)

    const withoutRule = removeReplyRule(withoutMessage, withRule.id)
    const oneRule = analyzeFlow(withoutRule)
    expect(oneRule.simple && oneRule.reply?.rules).toHaveLength(1)

    const withoutReply = analyzeFlow(removeReplyStep(withoutRule))
    expect(withoutReply.simple && withoutReply.reply).toBeFalsy()
    expect(withoutReply.simple && withoutReply.messages.map((message) => message.id)).toEqual(['m1'])
  })

  it('puts the messages of every branch in time order again', () => {
    const graph = buildGraph(base, {
      filters: [],
      messages: [msg('m1', 3)],
      reply: {
        wait: { id: 'w1', type: 'condition', kind: 'wait', x: 0, y: 0, mins: 60 },
        rules: [],
        any: [msg('m2', 600), msg('m3', 10)],
        none: [],
      },
    })
    const analysis = analyzeFlow(reorderMessages(graph))
    expect(analysis.simple && analysis.reply?.any.map((message) => message.id)).toEqual(['m3', 'm2'])
  })
})

describe('what the blocks say about themselves', () => {
  it('reads like a question', () => {
    expect(describeNode({ id: 'w1', type: 'condition', kind: 'wait', x: 0, y: 0, mins: 1440 })).toBe('Reply within 1 day?')
    expect(
      describeNode({ id: 'r1', type: 'condition', kind: 'reply', x: 0, y: 0, words: ['7', 'seven'] }),
    ).toBe('Reply has “7” or “seven”?')
  })

  it('tells where a message time is counted from', () => {
    const anchors = messageAnchors(askAndAnswer())
    expect(anchors.get('m1')).toBeNull()
    expect(anchors.get('m2')).toBe('reply')
    expect(anchors.get('m3')).toBe('reply')
    expect(anchors.get('m5')).toBe('timeout')
  })
})

describe('trying a flow with a pretend parent', () => {
  const graph = askAndAnswer()
  const child = { age: null, classroomId: null }

  it('stops at the wait when nothing was said about the reply', () => {
    const result = simulateFlow(graph, child)
    expect(result.messages.map((message) => message.id)).toEqual(['m1'])
  })

  it('follows a word check when the pretend reply has the word', () => {
    const result = simulateFlow(graph, { ...child, reply: 'replied', replyText: 'He is SEVEN years old' })
    expect(result.messages.map((message) => message.id)).toEqual(['m1', 'm2'])
  })

  it('sends nothing more when the reply has none of the words', () => {
    const result = simulateFlow(graph, { ...child, reply: 'replied', replyText: 'ok thanks' })
    expect(result.messages.map((message) => message.id)).toEqual(['m1'])
  })

  it('follows both word checks when a reply has both words', () => {
    const result = simulateFlow(graph, { ...child, reply: 'replied', replyText: 'Form 1 and he is 7' })
    expect(result.messages.map((message) => message.id).sort()).toEqual(['m1', 'm2', 'm3'])
  })

  it('follows the No side when the parent stays quiet', () => {
    const result = simulateFlow(graph, { ...child, reply: 'silent' })
    expect(result.messages.map((message) => message.id)).toEqual(['m1', 'm5'])
  })
})

describe('saving and reading', () => {
  const draft = (graph: FlowGraph) => ({ id: null, name: 'Ask the age', trigger: 'lead_created' as const, enabled: false, graph })

  it('accepts a good flow and keeps the picture', () => {
    const graph = askAndAnswer()
    expect(validateDraft(draft(graph))).toBeNull()
    const read = parseGraph(JSON.parse(JSON.stringify(graph)))
    const first = read.nodes.find((node) => node.id === 'm1') as MessageNode
    expect(first.imageUrl).toBe('https://x.test/poster.png')
    expect(read.nodes.some((node) => node.type === 'condition' && node.kind === 'wait')).toBe(true)
    expect(read.nodes.some((node) => node.type === 'condition' && node.kind === 'reply')).toBe(true)
  })

  it('refuses a reply block with no word, a wait that is too long and a picture that is not https', () => {
    const noWord = askAndAnswer()
    noWord.nodes = noWord.nodes.map((node) =>
      node.id === 'r1' && node.type === 'condition' && node.kind === 'reply' ? { ...node, words: [] } : node,
    )
    expect(validateDraft(draft(noWord))).toMatch(/at least one word/)

    const tooLong = askAndAnswer()
    tooLong.nodes = tooLong.nodes.map((node) =>
      node.id === 'w1' && node.type === 'condition' && node.kind === 'wait' ? { ...node, mins: 20161 } : node,
    )
    expect(validateDraft(draft(tooLong))).toMatch(/1 minute to 14 days/)

    const badPicture = askAndAnswer()
    badPicture.nodes = badPicture.nodes.map((node) =>
      node.id === 'm1' && node.type === 'message' ? { ...node, imageUrl: 'http://x.test/a.png' } : node,
    )
    expect(validateDraft(draft(badPicture))).toMatch(/https/)
  })
})
