// The parts of the AI reply draft that do not need Deno or the network: what is asked, how the
// question is built and how the answer is read. Kept in their own file so they can be tested.

export type DraftMessage = { from: 'parent' | 'team'; text: string }

export type DraftInput = {
  chatId: number
  lastMessageId: number
  messages: DraftMessage[]
  child: { name: string | null; age: number | null } | null
  teamName: string | null
  // Ask again even when this chat already has a draft for its last message.
  regenerate: boolean
}

export type DraftResult = { reply: string; skip: boolean; staffNote: string }

export const MAX_MESSAGES = 30
export const MAX_TEXT = 1500

// A phone number or an email address someone typed in the chat never goes to the AI.
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\+?\d[\d\s-]{6,}\d/g, (match) => (match.replace(/\D/g, '').length >= 8 ? '[number]' : match))
}

export function validateInput(body: unknown): { ok: true; value: DraftInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body.' }
  }
  const source = body as Record<string, unknown>
  const chatId = Number(source.chatId)
  const lastMessageId = Number(source.lastMessageId)
  if (!Number.isInteger(chatId) || chatId <= 0 || !Number.isInteger(lastMessageId) || lastMessageId <= 0) {
    return { ok: false, error: 'chatId and lastMessageId are required.' }
  }
  if (!Array.isArray(source.messages) || source.messages.length === 0) {
    return { ok: false, error: 'There are no messages to answer.' }
  }
  const messages: DraftMessage[] = []
  for (const entry of source.messages.slice(-MAX_MESSAGES)) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const item = entry as Record<string, unknown>
    const text = typeof item.text === 'string' ? scrub(item.text.trim()).slice(0, MAX_TEXT) : ''
    if (text !== '' && (item.from === 'parent' || item.from === 'team')) {
      messages.push({ from: item.from, text })
    }
  }
  if (messages.length === 0) {
    return { ok: false, error: 'There are no messages to answer.' }
  }
  let child: DraftInput['child'] = null
  if (source.child && typeof source.child === 'object') {
    const raw = source.child as Record<string, unknown>
    const name = typeof raw.name === 'string' && raw.name.trim() ? scrub(raw.name.trim()).slice(0, 60) : null
    const age = typeof raw.age === 'number' && Number.isFinite(raw.age) && raw.age > 0 && raw.age < 40 ? raw.age : null
    if (name || age !== null) {
      child = { name, age }
    }
  }
  const teamName =
    typeof source.teamName === 'string' && source.teamName.trim() ? source.teamName.trim().slice(0, 60) : null
  return {
    ok: true,
    value: { chatId, lastMessageId, messages, child, teamName, regenerate: source.regenerate === true },
  }
}

export function buildSystemPrompt(knowledge: string): string {
  return `你是 Mirai AI School 的客服同事，帮同事写「要发给家长的 WhatsApp 回复草稿」。草稿会放在同事的输入框里，同事看过、修改后才会自己发出去。

规则：
1. 只写同事「下一条」要发的消息（可以分成几行短句）。一次只往流程前进一步：看聊天记录判断现在在哪一步，不重复问家长已经回答过的问题。
2. 只能使用下面【知识库】里的资料。资料里没有的（例如付款方式、报名表格、退款、投诉、calendar 里没有的时间），不要编、不要承诺；草稿里避开这些，并在 staff_note 用一句话告诉同事缺什么、要自己补。
3. 语言：跟家长最后一条消息的语言走（中文、英文或马来文）。写中文时用知识库「说话方式」里的马来西亚华人 WhatsApp 口语。
4. 家长只是说谢谢、OK、👍 之类、不需要回复时，skip 设为 true，reply 留空。
5. 聊天里最后一条是同事发的、家长还没回复时，skip 设为 true，reply 留空。
6. 不要写「体验课」。不要编截止日期或「只剩几个位置」。价钱按知识库的流程，家长没问就不主动讲。
7. 只输出一个 JSON 对象，格式：{"reply": "草稿文字", "skip": false, "staff_note": "给同事的一句提醒，没有就留空"}。不要输出其他东西。

【知识库】
${knowledge}`
}

export function buildUserPrompt(input: DraftInput): string {
  const lines: string[] = []
  lines.push(`同事名字：${input.teamName ?? '（不知道）'}`)
  if (input.child) {
    const parts = [input.child.name ?? '（名字不知道）', input.child.age !== null ? `${input.child.age} 岁` : '']
    lines.push(`孩子：${parts.filter(Boolean).join('，')}`)
  } else {
    lines.push('孩子：（还没有资料）')
  }
  lines.push('', '聊天记录（旧 → 新）：')
  for (const message of input.messages) {
    lines.push(`${message.from === 'parent' ? '家长' : '我们'}：${message.text}`)
  }
  lines.push('', '请写同事下一条要发给家长的回复。')
  return lines.join('\n')
}

// Reads what the model answered. It should be one JSON object; a code fence around it or plain text
// instead of JSON is tolerated, and nothing unusable is passed on as a draft.
export function parseModelReply(raw: string): DraftResult | null {
  const text = raw.trim()
  if (text === '') {
    return null
  }
  const fenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const candidates = [fenced]
  const start = fenced.indexOf('{')
  const end = fenced.lastIndexOf('}')
  if (start >= 0 && end > start) {
    candidates.push(fenced.slice(start, end + 1))
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>
      if (parsed && typeof parsed === 'object') {
        const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : ''
        const skip = parsed.skip === true || reply === ''
        const note = typeof parsed.staff_note === 'string' ? parsed.staff_note.trim() : ''
        return { reply: skip ? '' : reply.slice(0, 4000), skip, staffNote: note.slice(0, 300) }
      }
    } catch {
      // Try the next reading.
    }
  }
  return null
}
