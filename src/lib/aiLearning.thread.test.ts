import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatwootMessage } from './whatsappInbox'
import { THREAD_LENGTH, fetchThread, requestLesson } from './aiLearning'

const client = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: client.invoke } } }))

const message = (id: number, change: Partial<ChatwootMessage> = {}): ChatwootMessage => ({
  id,
  content: `message ${id}`,
  message_type: id % 2 === 0 ? 1 : 0,
  created_at: id,
  private: false,
  status: 'sent',
  ...change,
})

beforeEach(() => {
  client.invoke.mockReset()
})

describe('the chat around an example', () => {
  it('reads the messages up to the parent one, oldest first, without notes or empty messages', async () => {
    const listMessages = vi.fn().mockResolvedValue([
      message(9),
      message(7, { content: 'OK 012-345 6789' }),
      message(6, { private: true, content: 'a private note' }),
      message(5, { content: '  ' }),
      message(4),
      // After the parent message: not part of what the reply answered.
      message(8),
    ])
    const thread = await fetchThread({ listMessages }, 3, 7)
    expect(listMessages).toHaveBeenCalledWith(3, 8)
    expect(thread).toEqual([
      { from: 'team', text: 'message 4' },
      { from: 'parent', text: 'OK [number]' },
    ])
  })

  it('keeps only the last few messages', async () => {
    const many = Array.from({ length: 20 }, (_, index) => message(index + 1))
    const thread = await fetchThread({ listMessages: vi.fn().mockResolvedValue(many) }, 3, 20)
    expect(thread).toHaveLength(THREAD_LENGTH)
    expect(thread.at(-1)?.text).toBe('message 20')
  })
})

describe('asking the AI why the team replied this way', () => {
  const request = { thread: [{ from: 'parent' as const, text: 'OK' }], draft: '草稿', sent: '发出的' }

  it('sends the chat, the draft and the reply, and returns the explanation', async () => {
    client.invoke.mockResolvedValue({ data: { ok: true, lesson: ' 家长同意价钱后，直接给时间。 ' }, error: null })
    expect(await requestLesson(request)).toEqual({ lesson: '家长同意价钱后，直接给时间。', error: null })
    expect(client.invoke).toHaveBeenCalledWith('ai-draft', { body: { mode: 'lesson', ...request } })
  })

  it('says why it did not work', async () => {
    client.invoke.mockResolvedValue({
      data: { ok: false, error: 'Only an admin can ask for an explanation.' },
      error: null,
    })
    expect(await requestLesson(request)).toEqual({ lesson: null, error: 'Only an admin can ask for an explanation.' })
    client.invoke.mockImplementation(() => Promise.reject(new Error('offline')))
    expect(await requestLesson(request)).toMatchObject({ lesson: null })
  })
})
