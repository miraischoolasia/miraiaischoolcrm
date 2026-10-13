import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LONG_KNOWLEDGE_CHARS,
  MAX_BODY,
  aiKnowledgeErrorMessage,
  knowledgeText,
  saveNote,
  summarizeKnowledge,
  validateNote,
  type KnowledgeNote,
} from './aiKnowledge'
import {
  EMPTY_KNOWLEDGE,
  MAX_KNOWLEDGE_CHARS,
  buildSystemPrompt,
  composeKnowledge,
} from '../../supabase/functions/ai-draft/logic'

const client = vi.hoisted(() => ({ result: { data: [] as unknown[], error: null as unknown } }))
vi.mock('./supabase', () => {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  for (const name of ['from', 'select', 'update', 'insert', 'delete', 'eq', 'order', 'limit', 'single']) {
    chain[name] = vi.fn(self)
  }
  chain.then = (resolve: (value: unknown) => unknown) => resolve(client.result)
  return { supabase: chain }
})

const note = (change: Partial<KnowledgeNote> = {}): KnowledgeNote => ({
  id: 1,
  title: 'HOA',
  body: 'RM38',
  enabled: true,
  updatedAt: '2026-10-13T01:00:00Z',
  ...change,
})

beforeEach(() => {
  client.result = { data: [], error: null }
})

describe('what the AI reads', () => {
  it('joins the notes that are on, in order, each under its title', () => {
    const text = knowledgeText([
      note({ id: 1, title: '学校', body: '7 年经验' }),
      note({ id: 2, title: '价钱', body: 'RM38', enabled: false }),
      note({ id: 3, title: 'HOA', body: '120 分钟' }),
    ])
    expect(text).toBe('## 学校\n7 年经验\n\n## HOA\n120 分钟')
  })

  it('skips a note with no text, and cuts what is too long', () => {
    expect(composeKnowledge([{ title: 'Empty', body: '  ' }])).toBe('')
    const long = composeKnowledge([{ title: 'Long', body: 'x'.repeat(MAX_KNOWLEDGE_CHARS + 500) }])
    expect(long).toHaveLength(MAX_KNOWLEDGE_CHARS)
  })

  it('tells the AI plainly when there is nothing to know', () => {
    expect(buildSystemPrompt('')).toContain(EMPTY_KNOWLEDGE)
    expect(buildSystemPrompt('   ')).toContain(EMPTY_KNOWLEDGE)
    expect(buildSystemPrompt('## HOA\nRM38')).not.toContain(EMPTY_KNOWLEDGE)
  })
})

describe('the summary line', () => {
  it('counts the notes that are on and the characters sent', () => {
    const summary = summarizeKnowledge([
      note({ id: 1, title: 'ab', body: 'cdef' }),
      note({ id: 2, enabled: false, body: 'x'.repeat(500) }),
    ])
    expect(summary).toMatchObject({ total: 2, on: 1, tooLong: false, cutOff: false })
    expect(summary.characters).toBeLessThan(50)
  })

  it('warns when the notes get long and when they are cut off', () => {
    expect(summarizeKnowledge([note({ body: 'x'.repeat(LONG_KNOWLEDGE_CHARS + 10) })])).toMatchObject({
      tooLong: true,
      cutOff: false,
    })
    expect(summarizeKnowledge([note({ body: 'x'.repeat(MAX_KNOWLEDGE_CHARS + 10) })])).toMatchObject({
      tooLong: true,
      cutOff: true,
    })
  })
})

describe('saving a note', () => {
  it('needs a title and a text that is not too long', () => {
    expect(validateNote({ title: '   ', body: 'x' })).toBe('Give the note a title.')
    expect(validateNote({ title: 'x'.repeat(81), body: '' })).toMatch(/up to 80/)
    expect(validateNote({ title: 'HOA', body: 'x'.repeat(MAX_BODY + 1) })).toMatch(/up to 20,000/)
    expect(validateNote({ title: 'HOA', body: '' })).toBeNull()
  })

  it('says so when the database changed nothing (not an admin)', async () => {
    client.result = { data: [], error: null }
    await expect(saveNote(1, { title: 'HOA', body: 'x', enabled: true })).rejects.toThrow(/Only an admin/)
  })

  it('returns the saved note', async () => {
    client.result = {
      data: [{ id: 1, title: 'HOA', body: 'x', enabled: true, updated_at: '2026-10-13T02:00:00Z' }],
      error: null,
    }
    await expect(saveNote(1, { title: ' HOA ', body: 'x', enabled: true })).resolves.toMatchObject({
      id: 1,
      title: 'HOA',
      updatedAt: '2026-10-13T02:00:00Z',
    })
  })
})

describe('error sentences', () => {
  it('explains a missing table, a refused change and a rule of the database', () => {
    expect(
      aiKnowledgeErrorMessage({ message: 'relation "public.ai_knowledge_notes" does not exist' }, 'fallback'),
    ).toMatch(/not set up/)
    expect(aiKnowledgeErrorMessage({ message: 'new row violates row-level security policy' }, 'fallback')).toMatch(
      /Only an admin/,
    )
    expect(aiKnowledgeErrorMessage({ code: 'P0001', message: 'There can be up to 30 notes.' }, 'fallback')).toBe(
      'There can be up to 30 notes.',
    )
    expect(aiKnowledgeErrorMessage(new Error('boom'), 'fallback')).toBe('fallback')
  })
})
