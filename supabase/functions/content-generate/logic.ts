// The parts of Content Studio's AI that do not need Deno or the network: which post gets which style,
// angle and size, how the question to the AI is built, how its answer is read, and the checks on banned
// words and must-have lines. Kept in their own file so the CRM and the tests can use them too.

export const CONTENT_SIZES = ['1:1', '4:5', '9:16', '3:4'] as const
export type ContentSize = (typeof CONTENT_SIZES)[number]

export const CONTENT_KINDS = ['single', 'carousel', 'caption'] as const
export type ContentKind = (typeof CONTENT_KINDS)[number]

export type ContentStyle = { id: number; name: string; description: string }
export type ContentAngle = { id: number; name: string; description: string; examples: string[] }

export type ContentSettings = {
  voice: string
  bannedWords: string[]
  mustInclude: string[]
}

export type ContentBrief = {
  title: string
  topic: string
  keyPoints: string
  audience: string
  callToAction: string
  pdfText: string
  sizes: ContentSize[]
  kind: ContentKind
  carouselPages: number
}

// One post the AI is asked to fill in.
export type PlanSlot = {
  slot: number
  style: ContentStyle | null
  angle: ContentAngle | null
  size: ContentSize
}

export type PlanRow = {
  styleId: number | null
  angleId: number | null
  size: ContentSize
  headline: string
  subheadline: string
  posterText: string
  caption: string
  visual: string
}

export const MAX_ROWS_PER_CALL = 12
export const MAX_PDF_BYTES = 15 * 1024 * 1024

export type ContentRequest =
  | { mode: 'plan'; briefId: number }
  | { mode: 'more'; briefId: number; count: number }
  | { mode: 'read_pdf'; briefId: number; path: string }

export function validateRequest(body: unknown): { ok: true; value: ContentRequest } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request.' }
  }
  const raw = body as { mode?: unknown; briefId?: unknown; count?: unknown; path?: unknown }
  const briefId = typeof raw.briefId === 'number' && Number.isInteger(raw.briefId) && raw.briefId > 0 ? raw.briefId : null
  if (briefId === null) {
    return { ok: false, error: 'Which brief is missing.' }
  }
  if (raw.mode === 'plan') {
    return { ok: true, value: { mode: 'plan', briefId } }
  }
  if (raw.mode === 'more') {
    const count = typeof raw.count === 'number' && Number.isInteger(raw.count) ? raw.count : 3
    return { ok: true, value: { mode: 'more', briefId, count: Math.min(Math.max(count, 1), MAX_ROWS_PER_CALL) } }
  }
  if (raw.mode === 'read_pdf') {
    const path = typeof raw.path === 'string' ? raw.path : ''
    // Only the brief's own uploads (briefs/<brief id>/...), never another folder.
    if (!new RegExp(`^briefs/${briefId}/[A-Za-z0-9._-]+\\.pdf$`).test(path)) {
      return { ok: false, error: 'That file cannot be read.' }
    }
    return { ok: true, value: { mode: 'read_pdf', briefId, path } }
  }
  return { ok: false, error: 'Invalid request.' }
}

// Every style is paired with every angle before any pair is used twice, and the pairs move along both
// lists at once, so six posts from two styles and three angles are six different pairs. Sizes take turns.
// `start` continues from posts already planned ("a few more").
export function buildSlots(
  styles: ContentStyle[],
  angles: ContentAngle[],
  sizes: ContentSize[],
  count: number,
  start = 0,
): PlanSlot[] {
  const styleList: (ContentStyle | null)[] = styles.length > 0 ? styles : [null]
  const angleList: (ContentAngle | null)[] = angles.length > 0 ? angles : [null]
  const sizeList: ContentSize[] = sizes.length > 0 ? sizes : ['1:1']
  const pairs: [ContentStyle | null, ContentAngle | null][] = []
  for (let turn = 0; turn < angleList.length; turn += 1) {
    for (let s = 0; s < styleList.length; s += 1) {
      pairs.push([styleList[s], angleList[(s + turn) % angleList.length]])
    }
  }
  const slots: PlanSlot[] = []
  for (let n = 0; n < count; n += 1) {
    const k = start + n
    const [style, angle] = pairs[k % pairs.length]
    slots.push({ slot: n + 1, style, angle, size: sizeList[k % sizeList.length] })
  }
  return slots
}

const SIZE_NOTE: Record<ContentSize, string> = {
  '1:1': '1:1 正方形（Facebook / Instagram 贴文）',
  '4:5': '4:5 直式（Instagram 贴文）',
  '9:16': '9:16 全屏直式（Story / Reels 封面 / WhatsApp 状态）',
  '3:4': '3:4 直式（小红书）',
}

export function buildSystemPrompt(settings: ContentSettings, schoolName: string): string {
  const lines = [
    `你是「${schoolName}」的行销文案和海报企划。你为学校的社交媒体贴文写「计划表」：每一行是一张海报（或一组 Carousel）加一段贴文文案。`,
    '',
    '语言规矩（非常重要）：',
    '- 用马来西亚华人日常讲的华文，简体字。口语、亲切、自然，像学校老师在家长 WhatsApp 群里讲话。',
    '- 可以自然夹一点大马常用的英文词，例如 class、trial class、online、slot、register、PT3/SPM/UASA。',
    '- 不要大陆网络腔（例如「宝妈」「家人们」「冲鸭」「绝绝子」「小伙伴们」「亲」），也不要台湾腔（例如「超棒der」「唷」「呢～」）。',
    '- 钱用 RM，例如 RM180；日期写「10月25日（六）」这样；时间写「早上10点」「晚上8点半」。',
    '- 文案开头一两句就要抓住家长；段落短，一段一两句；可以用少量 emoji（每段最多一个）；最后放行动呼吁。',
    '- 文案最后可以放 2–4 个 hashtag。',
    '- 不夸大、不保证成绩、不吓家长、不说别的补习中心坏话；没有给你的事实（价钱、日期、成绩、名额）绝对不要自己编。',
  ]
  if (settings.voice.trim()) {
    lines.push('', '学校自己定的说话语气：', settings.voice.trim())
  }
  if (settings.bannedWords.length > 0) {
    lines.push('', `绝对不可以出现这些字眼：${settings.bannedWords.join('、')}`)
  }
  if (settings.mustInclude.length > 0) {
    lines.push('', '每段文案的最后都要原样放上这些资料（一行一个）：', ...settings.mustInclude.map((line) => `- ${line}`))
  }
  lines.push(
    '',
    '每一行要写：',
    '- headline：海报大标题，最多 14 个字，一眼看懂。',
    '- subheadline：副标题，最多 24 个字。',
    '- poster_text：海报上其他要放的字（重点、价钱、日期、行动呼吁），用换行分开，越少越好。Carousel 就写每一页的字，一页一行，以「第1页：」「第2页：」开头。只要文案的，留空。',
    '- caption：贴文文案（上面的语言规矩）。',
    '- visual：给画图 AI 的画面描述（华文），写画面里有什么、构图、颜色、气氛，照这一行的风格；不要描述字。只要文案的，留空。',
    '',
    '每一行都要照它被指定的「风格」和「角度」写，彼此不要重复同一个标题或同一个开头。',
    '只回答 JSON，格式：{"items":[{"slot":1,"headline":"","subheadline":"","poster_text":"","caption":"","visual":""}]}',
  )
  return lines.join('\n')
}

function section(label: string, text: string): string[] {
  const value = text.trim()
  return value ? [`【${label}】`, value, ''] : []
}

export function buildUserPrompt(brief: ContentBrief, slots: PlanSlot[], avoidHeadlines: string[] = []): string {
  const kindLine =
    brief.kind === 'carousel'
      ? `类型：Carousel，每组 ${brief.carouselPages} 页（poster_text 写每一页的字）。`
      : brief.kind === 'caption'
        ? '类型：只要文案（poster_text 和 visual 留空）。'
        : '类型：单张海报。'
  const lines = [
    `【活动名称】`,
    brief.title.trim(),
    '',
    ...section('推什么', brief.topic),
    ...section('重点（价钱、日期、年龄等，只能用这里给的事实）', brief.keyPoints),
    ...section('对象', brief.audience),
    ...section('行动呼吁', brief.callToAction),
    ...section('资料（从上传的 PDF 读出来的字）', brief.pdfText.slice(0, 12000)),
    kindLine,
    '',
    `请写 ${slots.length} 行：`,
  ]
  for (const slot of slots) {
    const parts = [`第 ${slot.slot} 行：尺寸 ${SIZE_NOTE[slot.size]}`]
    if (slot.style) {
      parts.push(`风格「${slot.style.name}」${slot.style.description.trim() ? `：${slot.style.description.trim()}` : ''}`)
    }
    if (slot.angle) {
      const examples = slot.angle.examples.filter((example) => example.trim())
      parts.push(
        `角度「${slot.angle.name}」${slot.angle.description.trim() ? `：${slot.angle.description.trim()}` : ''}` +
          (examples.length > 0 ? `（标题例子：${examples.join(' / ')}）` : ''),
      )
    }
    lines.push(`- ${parts.join('；')}`)
  }
  if (avoidHeadlines.length > 0) {
    lines.push('', '这些标题已经用过了，不要再写一样或很像的：', ...avoidHeadlines.slice(0, 40).map((headline) => `- ${headline}`))
  }
  return lines.join('\n')
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim().slice(0, max) : ''
}

function stripFence(answer: string): string {
  const trimmed = answer.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1] : trimmed
}

// The AI's rows, matched to the slots by their number (else in order). Rows without a headline or caption
// are dropped; null when nothing usable came back.
export function parsePlan(answer: string, slots: PlanSlot[], kind: ContentKind): PlanRow[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripFence(answer))
  } catch {
    return null
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items)
      ? (parsed as { items: unknown[] }).items
      : null
  if (!list) {
    return null
  }
  const used = new Set<number>()
  const rows: PlanRow[] = []
  list.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return
    const raw = entry as Record<string, unknown>
    const wanted = typeof raw.slot === 'number' ? slots.find((slot) => slot.slot === raw.slot && !used.has(slot.slot)) : undefined
    const slot = wanted ?? slots.find((candidate, at) => at >= index && !used.has(candidate.slot)) ?? slots.find((candidate) => !used.has(candidate.slot))
    if (!slot) return
    const headline = text(raw.headline, 200)
    const caption = text(raw.caption, 4000)
    if (!headline || !caption) return
    used.add(slot.slot)
    rows.push({
      styleId: slot.style?.id ?? null,
      angleId: slot.angle?.id ?? null,
      size: slot.size,
      headline,
      subheadline: text(raw.subheadline, 300),
      posterText: kind === 'caption' ? '' : text(raw.poster_text, 3000),
      caption,
      visual: kind === 'caption' ? '' : text(raw.visual, 2000),
    })
  })
  return rows.length > 0 ? rows : null
}

// Letters and digits only, lower case: "WhatsApp: 012-345 6789" and "whatsapp 0123456789" are the same line.
function squash(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

// Adds every must-have line the caption does not already carry, at the end, in the school's order.
export function addMustInclude(caption: string, lines: string[]): string {
  const have = squash(caption)
  const missing = lines.map((line) => line.trim()).filter((line) => line && !have.includes(squash(line)))
  if (missing.length === 0) {
    return caption
  }
  return `${caption.trimEnd()}\n\n${missing.join('\n')}`
}

// The banned words a text still has (case does not matter).
export function findBannedWords(value: string, banned: string[]): string[] {
  const lower = value.toLowerCase()
  return banned.filter((word) => word.trim() && lower.includes(word.trim().toLowerCase()))
}

export const PDF_SYSTEM_PROMPT =
  '把这份 PDF 里所有的字原样抄出来（包括表格里的价钱、日期、时间），用纯文字，表格每一行写成一行。不要加解释、不要总结、不要翻译。' +
  '只回答 JSON：{"text":""}'

export function parsePdfText(answer: string): string | null {
  try {
    const parsed = JSON.parse(stripFence(answer)) as { text?: unknown }
    const value = text(parsed?.text, 30000)
    return value || null
  } catch {
    const value = answer.trim()
    return value && !value.startsWith('{') ? value.slice(0, 30000) : null
  }
}

// Malaysia's midnight today, as the instant the daily limit counts from.
export function malaysiaDayStart(now: Date): string {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - 8 * 60 * 60 * 1000).toISOString()
}
