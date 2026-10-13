import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatwootMessage } from './whatsappInbox'
import {
  buildDraftBody,
  markAiDraftAccepted,
  messageNeedingReply,
  recordAiDraftSent,
  requestAiDraft,
  scrubText,
} from './aiDraft'
import {
  buildSystemPrompt,
  buildUserPrompt,
  lastParentText,
  parseModelReply,
  scrub,
  validateInput,
} from '../../supabase/functions/ai-draft/logic'

const client = vi.hoisted(() => ({
  invoke: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('./supabase', () => ({
  supabase: { functions: { invoke: client.invoke }, rpc: client.rpc },
}))

let nextId = 1
const message = (change: Partial<ChatwootMessage> = {}): ChatwootMessage => ({
  id: nextId++,
  content: 'Hi',
  message_type: 0,
  created_at: 1,
  private: false,
  status: 'sent',
  ...change,
})

beforeEach(() => {
  nextId = 1
  client.invoke.mockReset()
  client.rpc.mockReset()
})

describe('what is kept on this computer', () => {
  it('hides phone numbers and email addresses', () => {
    expect(scrubText('call me 012-345 6789 or mei@example.com')).toBe('call me [number] or [email]')
    expect(scrubText('Class on 14 Oct at 8.30pm, age 9')).toBe('Class on 14 Oct at 8.30pm, age 9')
    expect(scrub('+60 12 345 6789')).toBe('[number]')
  })
})

describe('which message the AI answers', () => {
  it('is the parent last written message when the team has not answered', () => {
    const list = [
      message({ content: 'Hello' }),
      message({ message_type: 1, content: 'Hi mummy' }),
      message({ content: 'How much?' }),
    ]
    expect(messageNeedingReply(list)?.content).toBe('How much?')
  })

  it('is nothing when the team spoke last, even with a private note or an activity after it', () => {
    const list = [
      message({ content: 'Hello' }),
      message({ message_type: 1, content: 'Hi mummy' }),
      message({ private: true, content: 'note' }),
      message({ message_type: 2, content: 'Assigned' }),
    ]
    expect(messageNeedingReply(list)).toBeNull()
  })

  it('is nothing when the parent only sent a photo or a voice message', () => {
    const list = [message({ content: null, attachments: [{ id: 1, file_type: 'image' } as never] })]
    expect(messageNeedingReply(list)).toBeNull()
  })

  it('ignores a deleted message', () => {
    const list = [message({ content: 'Hello' }), message({ content: '', content_attributes: { deleted: true } })]
    expect(messageNeedingReply(list)?.content).toBe('Hello')
  })
})

describe('what is asked', () => {
  it('sends the latest messages in order, without notes, and hides numbers', () => {
    const list = [
      message({ content: 'Hello, my number is 012-345 6789' }),
      message({ message_type: 1, content: 'Hi!' }),
      message({ private: true, content: 'private note' }),
      message({ content: 'How much is HOA?' }),
    ]
    const body = buildDraftBody(55, list, { children: [{ name: 'Ethan', age: 9 }], teamName: 'Lex' }, false)
    expect(body).toMatchObject({
      chatId: 55,
      lastMessageId: list[3].id,
      child: { name: 'Ethan', age: 9 },
      children: [{ name: 'Ethan', age: 9 }],
      teamName: 'Lex',
      regenerate: false,
    })
    expect(body?.messages).toEqual([
      { from: 'parent', text: 'Hello, my number is [number]' },
      { from: 'team', text: 'Hi!' },
      { from: 'parent', text: 'How much is HOA?' },
    ])
  })

  it('sends which question a quoted reply answers', () => {
    const question = message({ message_type: 1, content: '孩子有玩过电脑游戏吗？', source_id: 'WAID:ABC' })
    const second = message({ message_type: 1, content: '有用 ChatGPT 吗？', source_id: 'WAID:DEF' })
    const list = [
      question,
      second,
      message({ content: 'Yes', content_attributes: { in_reply_to: question.id } }),
      message({ content: 'Yes not well', content_attributes: { in_reply_to_external_id: 'DEF' } }),
    ]
    const body = buildDraftBody(7, list, { children: [], teamName: null }, false)
    expect(body?.messages).toEqual([
      { from: 'team', text: '孩子有玩过电脑游戏吗？' },
      { from: 'team', text: '有用 ChatGPT 吗？' },
      { from: 'parent', text: 'Yes', replyTo: '孩子有玩过电脑游戏吗？' },
      { from: 'parent', text: 'Yes not well', replyTo: '有用 ChatGPT 吗？' },
    ])
  })

  it('sends every child of the lead, and the first one alone for an older function', () => {
    const list = [message({ content: 'How much?' })]
    const body = buildDraftBody(
      3,
      list,
      {
        children: [
          { name: 'Mia', age: 5 },
          { name: null, age: 12 },
          { name: null, age: null },
        ],
        teamName: null,
      },
      false,
    )
    expect(body?.children).toEqual([
      { name: 'Mia', age: 5 },
      { name: null, age: 12 },
    ])
    expect(body?.child).toEqual({ name: 'Mia', age: 5 })
  })

  it('lists several children in the question', () => {
    const checked = validateInput({
      chatId: 1,
      lastMessageId: 2,
      messages: [{ from: 'parent', text: 'hi' }],
      children: [
        { name: 'Mia', age: 5 },
        { name: null, age: 12 },
      ],
    })
    if (!checked.ok) {
      throw new Error('should be valid')
    }
    expect(checked.value.children).toHaveLength(2)
    const prompt = buildUserPrompt(checked.value)
    expect(prompt).toContain('孩子（一共 2 个）：')
    expect(prompt).toContain('- Mia，5 岁')
    expect(prompt).toContain('- （名字不知道），12 岁')
  })

  it('keeps the last 20 messages and has no child when nothing is known', () => {
    const list = Array.from({ length: 30 }, (_, i) => message({ content: `m${i}` }))
    const body = buildDraftBody(1, list, { children: [], teamName: null }, true)
    expect(body?.messages).toHaveLength(20)
    expect(body?.messages[19].text).toBe('m29')
    expect(body?.child).toBeNull()
    expect(body?.regenerate).toBe(true)
  })

  it('asks for nothing when there is nothing to answer', () => {
    expect(buildDraftBody(1, [message({ message_type: 1 })], { children: [], teamName: null }, false)).toBeNull()
  })
})

describe('what comes back', () => {
  const body = {
    chatId: 1,
    lastMessageId: 2,
    messages: [{ from: 'parent' as const, text: 'hi' }],
    child: null,
    children: [],
    teamName: null,
    regenerate: false,
  }

  it('turns a draft into a suggestion', async () => {
    client.invoke.mockResolvedValue({
      data: { ok: true, id: 7, reply: ' Hi 妈咪 ', skip: false, staffNote: '付款方式没有资料' },
      error: null,
    })
    expect(await requestAiDraft(body)).toEqual({
      kind: 'draft',
      suggestion: { id: 7, text: 'Hi 妈咪', note: '付款方式没有资料' },
    })
    expect(client.invoke).toHaveBeenCalledWith('ai-draft', { body })
  })

  it('says nothing is needed when the AI skips', async () => {
    client.invoke.mockResolvedValue({ data: { ok: true, id: 8, reply: '', skip: true, staffNote: '' }, error: null })
    expect(await requestAiDraft(body)).toEqual({ kind: 'skip' })
  })

  it('shows the sentence the function gave when it refuses', async () => {
    client.invoke.mockResolvedValue({
      data: { ok: false, error: 'The AI draft limit for today has been reached.' },
      error: null,
    })
    expect(await requestAiDraft(body)).toEqual({
      kind: 'error',
      message: 'The AI draft limit for today has been reached.',
    })
  })

  it('reads the sentence out of a failed response', async () => {
    const response = new Response(JSON.stringify({ ok: false, error: 'The AI key has not been set up yet.' }), {
      status: 503,
    })
    client.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: response },
    })
    expect(await requestAiDraft(body)).toEqual({ kind: 'error', message: 'The AI key has not been set up yet.' })
  })

  it('does not break writing when the function cannot be reached', async () => {
    client.invoke.mockRejectedValue(new Error('network'))
    expect(await requestAiDraft(body)).toMatchObject({ kind: 'error' })
  })

  it('records that a suggestion was used, and never throws', async () => {
    client.rpc.mockRejectedValue(new Error('offline'))
    await expect(markAiDraftAccepted(7)).resolves.toBeUndefined()
    expect(client.rpc).toHaveBeenCalledWith('mark_ai_draft_accepted', { p_id: 7 })
  })

  it('records what the team sent against the draft, without numbers, and never throws', async () => {
    client.rpc.mockReset()
    client.rpc.mockResolvedValue({ error: null })
    await recordAiDraftSent(7, '  妈咪，我的号码是 012-345 6789，email a@b.com  ')
    expect(client.rpc).toHaveBeenCalledWith('record_ai_draft_sent', {
      p_id: 7,
      p_text: '妈咪，我的号码是 [number]，email [email]',
    })
    client.rpc.mockClear()
    await recordAiDraftSent(7, '   ')
    expect(client.rpc).not.toHaveBeenCalled()
    client.rpc.mockRejectedValue(new Error('offline'))
    await expect(recordAiDraftSent(7, 'Hi')).resolves.toBeUndefined()
  })
})

describe('the function side', () => {
  it('checks the request and hides numbers again', () => {
    expect(validateInput(null)).toMatchObject({ ok: false })
    expect(validateInput({ chatId: 0, lastMessageId: 1, messages: [] })).toMatchObject({ ok: false })
    expect(validateInput({ chatId: 1, lastMessageId: 2, messages: [{ from: 'parent', text: '   ' }] })).toMatchObject({
      ok: false,
    })
    const checked = validateInput({
      chatId: 1,
      lastMessageId: 2,
      messages: [
        { from: 'parent', text: 'my number 0123456789' },
        { from: 'robot', text: 'ignored' },
      ],
      child: { name: 'Ethan', age: 9 },
      teamName: 'Lex',
    })
    expect(checked).toMatchObject({
      ok: true,
      value: {
        messages: [{ from: 'parent', text: 'my number [number]' }],
        children: [{ name: 'Ethan', age: 9 }],
        regenerate: false,
      },
    })
  })

  it('puts the school facts and the rules in the system prompt, and the chat in the question', () => {
    expect(buildSystemPrompt('FACTS HERE')).toContain('FACTS HERE')
    expect(buildSystemPrompt('x')).toContain('体验课')
    const checked = validateInput({
      chatId: 1,
      lastMessageId: 2,
      messages: [
        { from: 'parent', text: 'HOA 多少钱？' },
        { from: 'team', text: '妈咪 RM38 哦' },
      ],
      child: { name: 'Ethan', age: 9 },
      teamName: 'Lex',
    })
    if (!checked.ok) {
      throw new Error('should be valid')
    }
    const prompt = buildUserPrompt(checked.value)
    expect(prompt).toContain('同事名字：Lex')
    expect(prompt).toContain('孩子：Ethan，9 岁')
    expect(prompt).toContain('家长：HOA 多少钱？')
    expect(prompt).toContain('我们：妈咪 RM38 哦')
  })

  it('puts the quoted question next to the answer, and does not let the AI ask again', () => {
    const checked = validateInput({
      chatId: 1,
      lastMessageId: 2,
      messages: [
        { from: 'team', text: '孩子有玩过电脑游戏吗？' },
        { from: 'parent', text: 'Yes', replyTo: '孩子有玩过电脑游戏吗？ 0123456789' },
      ],
    })
    if (!checked.ok) {
      throw new Error('should be valid')
    }
    expect(checked.value.messages[1].replyTo).toBe('孩子有玩过电脑游戏吗？ [number]')
    expect(buildUserPrompt(checked.value)).toContain('家长（引用回复「孩子有玩过电脑游戏吗？ [number]」）：Yes')
    expect(buildSystemPrompt('x')).toContain('不能再问一次')
  })

  it('reads the answer, also inside a code fence, and refuses nonsense', () => {
    expect(
      parseModelReply('{"reply":"Hi 妈咪😊","skip":false,"category":"enrol","staff_note":"需确认付款方式"}'),
    ).toEqual({
      reply: 'Hi 妈咪😊',
      skip: false,
      staffNote: '需确认付款方式',
      missing: '',
      category: 'enrol',
    })
    expect(parseModelReply('```json\n{"reply":"OK","skip":false}\n```')).toMatchObject({ reply: 'OK', skip: false })
    expect(parseModelReply('{"reply":"","skip":true}')).toEqual({
      reply: '',
      skip: true,
      staffNote: '',
      missing: '',
      category: 'other',
    })
    expect(parseModelReply('{"reply":"   ","skip":false}')).toMatchObject({ skip: true })
    expect(parseModelReply('')).toBeNull()
    expect(parseModelReply('Sorry, I cannot')).toBeNull()
  })

  it('reads the kind of question, and treats an unknown kind as other', () => {
    expect(parseModelReply('{"reply":"RM38 哦","skip":false,"category":"PRICE"}')).toMatchObject({ category: 'price' })
    expect(parseModelReply('{"reply":"Hi","skip":false,"category":"weather"}')).toMatchObject({ category: 'other' })
    expect(parseModelReply('{"reply":"Hi","skip":false}')).toMatchObject({ category: 'other' })
  })

  it('finds the parent message a draft answers only when it is the last one', () => {
    expect(
      lastParentText([
        { from: 'team', text: 'Hi' },
        { from: 'parent', text: '多少钱？' },
      ]),
    ).toBe('多少钱？')
    expect(
      lastParentText([
        { from: 'parent', text: '多少钱？' },
        { from: 'team', text: 'RM38' },
      ]),
    ).toBeNull()
    expect(lastParentText([])).toBeNull()
  })

  it('reads which fact the knowledge lacked, apart from the reminder to the team', () => {
    expect(
      parseModelReply('{"reply":"妈咪～","skip":false,"missing":" 付款方式 ","staff_note":"家长是学生本人"}'),
    ).toMatchObject({ missing: '付款方式', staffNote: '家长是学生本人' })
    expect(parseModelReply('{"reply":"Hi","skip":false}')).toMatchObject({ missing: '' })
  })

  it('asks the model for the kind of question', () => {
    expect(buildSystemPrompt('')).toContain('"category"')
  })
})
