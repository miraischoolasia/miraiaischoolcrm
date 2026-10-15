// The parts of the AI reply draft that do not need Deno or the network: what is asked, how the
// question is built and how the answer is read. Kept in their own file so they can be tested.

// replyTo is the message this one quotes in WhatsApp (a "Yes" answers the question it quotes).
export type DraftMessage = { from: 'parent' | 'team'; text: string; replyTo?: string }

export type DraftInput = {
  chatId: number
  lastMessageId: number
  messages: DraftMessage[]
  // Every child of the family the team has written down (first names and ages), up to MAX_CHILDREN.
  children: { name: string | null; age: number | null }[]
  teamName: string | null
  // The HOA classes on the CRM calendar that still have room, soonest first, one line each
  // ("Sat 18 Oct, 2pm to 4pm, HOA 9-11 Years Old"). The only class times the AI may offer.
  // null: the browser did not send the calendar (an older page), so no list is given.
  openClasses: string[] | null
  // Ask again even when this chat already has a draft for its last message.
  regenerate: boolean
}

// What kind of question the parent asked. The CRM shows, per kind, how often the team used the draft
// as written, which is what decides where a draft may one day be sent without a person.
export const DRAFT_CATEGORIES = [
  'info',
  'schedule',
  'price',
  'enrol',
  'followup',
  'complaint',
  'refund',
  'health',
  'other',
] as const
export type DraftCategory = (typeof DRAFT_CATEGORIES)[number]

export type DraftResult = {
  reply: string
  skip: boolean
  staffNote: string
  // The fact the parent needed that the school knowledge does not have (a short label), or ''.
  missing: string
  category: DraftCategory
}

export function normalizeCategory(value: unknown): DraftCategory {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return (DRAFT_CATEGORIES as readonly string[]).includes(text) ? (text as DraftCategory) : 'other'
}

// The parent's last message when it is the last one of the chat (what the draft answers), else null.
export function lastParentText(messages: DraftMessage[]): string | null {
  const last = messages[messages.length - 1]
  return last && last.from === 'parent' ? last.text : null
}

export const MAX_MESSAGES = 30
export const MAX_TEXT = 1500
export const MAX_CHILDREN = 5
export const MAX_OPEN_CLASSES = 15

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
    const replyTo = typeof item.replyTo === 'string' ? scrub(item.replyTo.trim()).slice(0, 300) : ''
    if (text !== '' && (item.from === 'parent' || item.from === 'team')) {
      messages.push(replyTo === '' ? { from: item.from, text } : { from: item.from, text, replyTo })
    }
  }
  if (messages.length === 0) {
    return { ok: false, error: 'There are no messages to answer.' }
  }
  // `children` is the list; an older browser sends the first child alone as `child`.
  const rawChildren: unknown[] = Array.isArray(source.children) ? source.children : source.child ? [source.child] : []
  const children: DraftInput['children'] = []
  for (const entry of rawChildren.slice(0, MAX_CHILDREN)) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const raw = entry as Record<string, unknown>
    const name = typeof raw.name === 'string' && raw.name.trim() ? scrub(raw.name.trim()).slice(0, 60) : null
    const age = typeof raw.age === 'number' && Number.isFinite(raw.age) && raw.age > 0 && raw.age < 40 ? raw.age : null
    if (name || age !== null) {
      children.push({ name, age })
    }
  }
  const teamName =
    typeof source.teamName === 'string' && source.teamName.trim() ? source.teamName.trim().slice(0, 60) : null
  const openClasses = Array.isArray(source.openClasses)
    ? source.openClasses
        .filter((line): line is string => typeof line === 'string' && line.trim() !== '')
        .slice(0, MAX_OPEN_CLASSES)
        .map((line) => line.trim().slice(0, 120))
    : null
  return {
    ok: true,
    value: {
      chatId,
      lastMessageId,
      messages,
      children,
      teamName,
      openClasses,
      regenerate: source.regenerate === true,
    },
  }
}

// The school notes an admin keeps in the CRM (ai_knowledge_notes), as the one text the AI reads.
export type KnowledgeNote = { title: string; body: string }

// Most characters of knowledge sent to the AI in one question; the notes are read in order, so what
// does not fit is the end of the last notes.
export const MAX_KNOWLEDGE_CHARS = 60000

export function composeKnowledge(notes: KnowledgeNote[]): string {
  const parts: string[] = []
  for (const note of notes) {
    const title = note.title.trim()
    const body = note.body.trim()
    if (title !== '' && body !== '') {
      parts.push(`## ${title}\n${body}`)
    }
  }
  return parts.join('\n\n').slice(0, MAX_KNOWLEDGE_CHARS)
}

export const EMPTY_KNOWLEDGE =
  '（知识库现在是空的，没有任何资料可以用。所有细节都不要写，在 staff_note 告诉同事要自己补。）'

export const DEFAULT_SCHOOL_NAME = 'Mirai AI School'

export function buildSystemPrompt(knowledge: string, schoolName: string = DEFAULT_SCHOOL_NAME): string {
  return `你是 ${schoolName.trim() || DEFAULT_SCHOOL_NAME} 的客服同事，帮同事写「要发给家长的 WhatsApp 回复草稿」。草稿会放在同事的输入框里，同事看过、修改后才会自己发出去。

规则：
1. 只写同事「下一条」要发的消息（可以分成几行短句）。一次只往流程前进一步：看聊天记录判断现在在哪一步。
   - 家长已经回答过的问题，不能再问一次，也不能换个说法再问。家长答「有」「Yes」「没有」「还好」「not well」，就算已经回答，直接进入流程的下一步，不要追问细节。
   - 家长有两个或以上孩子时，称呼和说明都要照顾到每个孩子（例如「两个孩子」），时间和人数按每个孩子的年龄组来讲，不要只当成第一个孩子。
   - 家长的消息带「引用回复」时，那条回答是针对被引用的那个问题。家长一次回答了几个问题，就按引用或顺序对应，全部算已回答。
2. 只能使用下面【知识库】里的资料。资料里没有的（例如付款方式、报名表格、退款、投诉、calendar 里没有的时间），不要编、不要承诺；草稿里避开这些，并在 missing 写下缺的资料（见第 8 点）。
   - 上课时间只用聊天最后附上的【Calendar 现在有位的 HOA 班】。知识库里写的星期几和钟点只是旧例子，可能已经不对，不要照抄。列表里的班按孩子的年龄组选；提议时给 2 个时间让家长选，用列表上的日期和钟点，不要自己换算或改时间。
   - 没有【Calendar 现在有位的 HOA 班】这一段，或者里面是空的：不要报任何具体的上课时间，missing 写「课程时间（calendar）」。
3. 语言：跟家长最后一条消息的语言走（中文、英文或马来文）。写中文时用知识库「说话方式」里的马来西亚华人 WhatsApp 口语。
4. 家长只是说谢谢、OK、👍 之类、不需要回复时，skip 设为 true，reply 留空。
5. 聊天里最后一条是同事发的、家长还没回复时，skip 设为 true，reply 留空。
6. 不要写「体验课」。不要编截止日期或「只剩几个位置」。价钱按知识库的流程，家长没问就不主动讲。
7. category 是家长最后一条消息的类型，只能是下面其中一个：
   - info：问学校、课程内容、怎么上课
   - schedule：问或讨论上课时间、哪一天
   - price：问价钱、费用、优惠
   - enrol：要报名、付款、表格、收据
   - followup：寒暄、回答同事的问题（年龄、有没有用过电脑）、其他流程中的一般回复
   - complaint：不满、投诉、抱怨
   - refund：退款、取消、换课
   - health：孩子的健康、特殊需要、安全
   - other：不属于以上任何一种
8. missing：只有当家长需要的某个事实「知识库里没有」，所以草稿没法写出来时才填，写一个 20 字以内的短标签（不是句子）。
   - 能用标准标签就用：付款方式、报名表格、退款政策、投诉处理、课程时间（calendar）、上课地址、证书、老师资料。
   - 都不是就自己写一个短标签；资料够用就留空字符串。
   - 不要把普通提醒写在 missing（例如「家长是学生本人」「进入第 2 步」）。
9. staff_note：给同事的一句普通提醒（可以留空）。缺资料写在 missing，不要写在这里。
10. 只输出一个 JSON 对象，格式：{"reply": "草稿文字", "skip": false, "category": "info", "missing": "", "staff_note": ""}。不要输出其他东西。

【知识库】
${knowledge.trim() === '' ? EMPTY_KNOWLEDGE : knowledge}`
}

export function buildUserPrompt(input: DraftInput): string {
  const lines: string[] = []
  lines.push(`同事名字：${input.teamName ?? '（不知道）'}`)
  const describeChild = (child: DraftInput['children'][number]) =>
    [child.name ?? '（名字不知道）', child.age !== null ? `${child.age} 岁` : ''].filter(Boolean).join('，')
  if (input.children.length === 0) {
    lines.push('孩子：（还没有资料）')
  } else if (input.children.length === 1) {
    lines.push(`孩子：${describeChild(input.children[0])}`)
  } else {
    lines.push(`孩子（一共 ${input.children.length} 个）：`)
    for (const child of input.children) {
      lines.push(`- ${describeChild(child)}`)
    }
  }
  lines.push('', '聊天记录（旧 → 新）：')
  for (const message of input.messages) {
    const who = message.from === 'parent' ? '家长' : '我们'
    const quote = message.replyTo ? `（引用回复「${message.replyTo}」）` : ''
    lines.push(`${who}${quote}：${message.text}`)
  }
  if (input.openClasses !== null) {
    lines.push('', '【Calendar 现在有位的 HOA 班】（只有这些时间可以提议）：')
    if (input.openClasses.length === 0) {
      lines.push('（现在没有开放的班）')
    }
    for (const line of input.openClasses) {
      lines.push(`- ${line}`)
    }
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
        const missing = typeof parsed.missing === 'string' ? parsed.missing.trim() : ''
        return {
          reply: skip ? '' : reply.slice(0, 4000),
          skip,
          staffNote: note.slice(0, 300),
          missing: missing.slice(0, 120),
          category: normalizeCategory(parsed.category),
        }
      }
    } catch {
      // Try the next reading.
    }
  }
  return null
}
