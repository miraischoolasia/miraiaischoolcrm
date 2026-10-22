import { describe, expect, it, vi } from 'vitest'
import {
  addMustInclude,
  buildSlots,
  buildSystemPrompt,
  buildUserPrompt,
  buildAnalyzePrompt,
  findBannedWords,
  kindsFor,
  parseAnalysis,
  malaysiaDayStart,
  parsePdfText,
  parsePlan,
  validateRequest,
  type ContentAngle,
  type ContentBrief,
  type ContentStyle,
} from '../../supabase/functions/content-generate/logic'
import {
  bannedIn,
  claimLabel,
  contentErrorMessage,
  contentFilePath,
  filterLibrary,
  isFullyClaimed,
  splitLines,
  EMPTY_FILTER,
  type LibraryItem,
} from './contentStudio'
import { hasPermission, parseAccountPermissions } from './permissions'

vi.mock('./supabase', () => ({ supabase: null }))

const styleA: ContentStyle = { id: 1, name: '清新卡通', description: '粉色' }
const styleB: ContentStyle = { id: 2, name: '真实照片', description: '' }
const angle = (id: number): ContentAngle => ({ id, name: `角度${id}`, description: '', examples: [] })

const brief: ContentBrief = {
  title: '12月假期营',
  topic: '假期营',
  keyPoints: 'RM380，12月8日开始',
  audience: '7-12岁孩子的家长',
  callToAction: 'WhatsApp 报名',
  pdfText: '',
  sizes: ['1:1', '9:16'],
  carouselPages: 5,
}

const singles = (n: number) => kindsFor({ single: n, carousel: 0, caption: 0 })

describe('buildSlots', () => {
  it('uses every style and angle pair before repeating one, and takes turns with sizes', () => {
    const slots = buildSlots([styleA, styleB], [angle(1), angle(2), angle(3)], ['1:1', '9:16'], singles(6))
    const pairs = slots.map((slot) => `${slot.style?.id}-${slot.angle?.id}`)
    expect(new Set(pairs).size).toBe(6)
    expect(slots.map((slot) => slot.size)).toEqual(['1:1', '9:16', '1:1', '9:16', '1:1', '9:16'])
    expect(slots.map((slot) => slot.slot)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('carries on after the rows already planned', () => {
    const all = buildSlots([styleA, styleB], [angle(1), angle(2)], ['1:1'], singles(4))
    const more = buildSlots([styleA, styleB], [angle(1), angle(2)], ['1:1'], singles(2), 2)
    expect(more.map((slot) => [slot.style?.id, slot.angle?.id])).toEqual(all.slice(2).map((slot) => [slot.style?.id, slot.angle?.id]))
  })

  it('gives each post its own type, in the numbers asked for', () => {
    expect(kindsFor({ single: 2, carousel: 1, caption: 2 })).toEqual(['single', 'single', 'carousel', 'caption', 'caption'])
    expect(kindsFor({ single: 99, carousel: -1, caption: 0 })).toHaveLength(30)
    const slots = buildSlots([styleA], [angle(1)], ['1:1'], kindsFor({ single: 1, carousel: 1, caption: 1 }))
    expect(slots.map((slot) => slot.kind)).toEqual(['single', 'carousel', 'caption'])
  })

  it('works with no angle picked', () => {
    const slots = buildSlots([styleA], [], [], singles(3))
    expect(slots.every((slot) => slot.angle === null && slot.style?.id === 1 && slot.size === '1:1')).toBe(true)
  })
})

describe('prompts', () => {
  it('asks for Malaysian Chinese and passes the school rules', () => {
    const system = buildSystemPrompt({ voice: '亲切', bannedWords: ['保证'], mustInclude: ['WhatsApp: 012-3456789'] }, 'Mirai AI School')
    expect(system).toContain('马来西亚')
    expect(system).toContain('Mirai AI School')
    expect(system).toContain('保证')
    expect(system).toContain('WhatsApp: 012-3456789')
    expect(system).toContain('亲切')
  })

  it('lists each row with its style, angle and size, and the headlines to avoid', () => {
    const slots = buildSlots([styleA], [{ ...angle(1), examples: ['孩子跟不上？'] }], ['3:4'], singles(1))
    const user = buildUserPrompt(brief, slots, ['旧标题'])
    expect(user).toContain('12月假期营')
    expect(user).toContain('RM380')
    expect(user).toContain('风格「清新卡通」：粉色')
    expect(user).toContain('孩子跟不上？')
    expect(user).toContain('小红书')
    expect(user).toContain('旧标题')
    expect(user).toContain('单张海报')
  })

  it('says the type of each row, with the pages of a carousel and no size for a caption', () => {
    const slots = buildSlots([styleA], [], ['1:1'], kindsFor({ single: 0, carousel: 1, caption: 1 }))
    const user = buildUserPrompt(brief, slots)
    expect(user).toContain('第 1 行：Carousel 5 页')
    expect(user).toMatch(/第 2 行：只要文案[^\n]*$/m)
    expect(user.split('\n').find((line) => line.includes('第 2 行'))).not.toContain('尺寸')
  })
})

describe('parsePlan', () => {
  const slots = buildSlots([styleA, styleB], [angle(1)], ['1:1', '4:5'], singles(2))

  it('matches rows to slots by number', () => {
    const answer = JSON.stringify({
      items: [
        { slot: 2, headline: '二', subheadline: 's', poster_text: 'p', caption: 'c2', visual: 'v' },
        { slot: 1, headline: '一', caption: 'c1' },
      ],
    })
    const rows = parsePlan(answer, slots)!
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.headline === '二')).toMatchObject({ styleId: 2, size: '4:5', posterText: 'p', visual: 'v' })
    expect(rows.find((row) => row.headline === '一')).toMatchObject({ styleId: 1, size: '1:1' })
  })

  it('reads a fenced answer, drops rows without a caption, and empties poster words for caption-only', () => {
    const answer = '```json\n[{"headline":"一","caption":"c","poster_text":"x","visual":"y"},{"headline":"二"}]\n```'
    const captionSlots = buildSlots([styleA], [angle(1)], ['1:1'], kindsFor({ single: 0, carousel: 0, caption: 2 }))
    const rows = parsePlan(answer, captionSlots)!
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ headline: '一', posterText: '', visual: '', kind: 'caption' })
  })

  it('gives null for an answer that is not usable', () => {
    expect(parsePlan('not json', slots)).toBeNull()
    expect(parsePlan('{"items":[]}', slots)).toBeNull()
  })
})

describe('reading uploaded material', () => {
  it('reads the details the AI found', () => {
    const answer = JSON.stringify({ title: '假期营', topic: '12月假期营', key_points: 'RM380\n7–12岁', audience: '家长', call_to_action: 'WhatsApp', all_text: '全部字' })
    expect(parseAnalysis(answer)).toEqual({ title: '假期营', topic: '12月假期营', keyPoints: 'RM380\n7–12岁', audience: '家长', callToAction: 'WhatsApp', allText: '全部字' })
    expect(parseAnalysis('{"title":"x"}')).toBeNull()
    expect(parseAnalysis('not json')).toBeNull()
  })

  it('passes the file names and the pasted text', () => {
    const prompt = buildAnalyzePrompt('早鸟 RM350', ['flyer.pdf', 'poster.jpg'])
    expect(prompt).toContain('flyer.pdf、poster.jpg')
    expect(prompt).toContain('早鸟 RM350')
  })
})

describe('must-have lines and banned words', () => {
  it('adds only the missing lines, ignoring spaces and dashes', () => {
    const caption = '快来报名！\nwhatsapp 0123456789'
    expect(addMustInclude(caption, ['WhatsApp: 012-345 6789', 'mirai.my'])).toBe(`${caption}\n\nmirai.my`)
    expect(addMustInclude('hi', [])).toBe('hi')
  })

  it('finds banned words in any field, ignoring case', () => {
    expect(findBannedWords('100% Guarantee 保证进步', ['guarantee', '保证', '最好'])).toEqual(['guarantee', '保证'])
    expect(bannedIn({ headline: 'A', subheadline: '', posterText: '最好', caption: '' }, ['最好'])).toEqual(['最好'])
  })
})

describe('validateRequest', () => {
  it('accepts the three modes and clamps the count', () => {
    expect(validateRequest({ mode: 'plan', briefId: 3 })).toEqual({ ok: true, value: { mode: 'plan', briefId: 3 } })
    expect(validateRequest({ mode: 'more', briefId: 3, count: 99, kind: 'carousel' })).toEqual({ ok: true, value: { mode: 'more', briefId: 3, count: 12, kind: 'carousel' } })
    expect(validateRequest({ mode: 'more', briefId: 3, kind: 'poster' })).toMatchObject({ value: { kind: 'single', count: 3 } })
    expect(validateRequest({ mode: 'analyze', briefId: 3 })).toEqual({ ok: true, value: { mode: 'analyze', briefId: 3 } })
    expect(validateRequest({ mode: 'read_pdf', briefId: 3, path: 'briefs/3/abc.pdf' }).ok).toBe(true)
  })

  it('refuses another brief’s file or folder', () => {
    expect(validateRequest({ mode: 'read_pdf', briefId: 3, path: 'briefs/4/abc.pdf' }).ok).toBe(false)
    expect(validateRequest({ mode: 'read_pdf', briefId: 3, path: 'briefs/3/../x.pdf' }).ok).toBe(false)
    expect(validateRequest({ mode: 'plan' }).ok).toBe(false)
    expect(validateRequest({ mode: 'other', briefId: 1 }).ok).toBe(false)
  })
})

describe('small helpers', () => {
  it('reads PDF words from JSON or plain text', () => {
    expect(parsePdfText('{"text":"RM380"}')).toBe('RM380')
    expect(parsePdfText('RM380 only')).toBe('RM380 only')
    expect(parsePdfText('{"text":""}')).toBeNull()
  })

  it('counts the day from Malaysia midnight', () => {
    expect(malaysiaDayStart(new Date('2026-10-21T17:00:00Z'))).toBe('2026-10-21T16:00:00.000Z')
    expect(malaysiaDayStart(new Date('2026-10-21T15:59:00Z'))).toBe('2026-10-20T16:00:00.000Z')
  })

  it('splits typed lists', () => {
    expect(splitLines('保证, 最好\n最好，第一', true)).toEqual(['保证', '最好', '第一'])
    expect(splitLines('WhatsApp: 012, 345\n\n')).toEqual(['WhatsApp: 012, 345'])
  })

  it('names upload paths by folder and type only', () => {
    expect(contentFilePath('styles', 'image/png', 'ab-cd')).toBe('styles/abcd.png')
    expect(contentFilePath({ briefId: 7 }, 'application/pdf', 'x1')).toBe('briefs/7/x1.pdf')
    expect(contentFilePath('styles', 'image/svg+xml', 'x')).toBeNull()
  })

  it('turns database refusals into sentences', () => {
    expect(contentErrorMessage({ code: 'P0001', message: 'All places for this post have been claimed.' }, 'x')).toBe(
      'All places for this post have been claimed.',
    )
    expect(contentErrorMessage({ message: 'relation "public.content_briefs" does not exist' }, 'x')).toBe(
      'Content Studio is not set up in the database yet.',
    )
    expect(contentErrorMessage(new Error('boom'), 'fallback')).toBe('fallback')
  })
})

describe('library', () => {
  const item = (change: Partial<LibraryItem>): LibraryItem => ({
    id: 1,
    briefId: 1,
    briefTitle: 'Camp',
    styleId: 1,
    styleName: 'A',
    angleId: 1,
    angleName: 'B',
    headline: 'H',
    subheadline: '',
    posterText: '',
    caption: 'C',
    size: '1:1',
    kind: 'single',
    pages: 1,
    approvedAt: null,
    claimedCount: 0,
    claimLimit: 3,
    myClaimedAt: null,
    ...change,
  })

  it('shows x/y claimed and fully claimed only for people who do not have it', () => {
    expect(claimLabel(item({ claimedCount: 2 }))).toBe('2/3 taken')
    expect(isFullyClaimed(item({ claimedCount: 3 }))).toBe(true)
    expect(isFullyClaimed(item({ claimedCount: 3, myClaimedAt: '2026-10-21T00:00:00Z' }))).toBe(false)
    // The limit was lowered after people claimed: never more than y.
    expect(claimLabel(item({ claimedCount: 5 }))).toBe('3/3 taken')
  })

  it('filters by campaign, size and what is still open or mine', () => {
    const items = [
      item({ id: 1 }),
      item({ id: 2, briefId: 2, size: '9:16' }),
      item({ id: 3, claimedCount: 3 }),
      item({ id: 4, myClaimedAt: '2026-10-21T00:00:00Z', claimedCount: 1 }),
    ]
    expect(filterLibrary(items, { ...EMPTY_FILTER, briefId: 2 }).map((entry) => entry.id)).toEqual([2])
    expect(filterLibrary(items, { ...EMPTY_FILTER, size: '9:16' }).map((entry) => entry.id)).toEqual([2])
    expect(filterLibrary(items, { ...EMPTY_FILTER, show: 'open' }).map((entry) => entry.id)).toEqual([1, 2])
    expect(filterLibrary(items, { ...EMPTY_FILTER, show: 'mine' }).map((entry) => entry.id)).toEqual([4])
  })
})

describe('permissions', () => {
  it('has the two new ticks; Content Library is view only', () => {
    const ticks = parseAccountPermissions({ content_studio: { level: 'edit' }, content_library: { level: 'edit', delete: true } })
    expect(ticks).toEqual({ content_studio: { level: 'edit', delete: false }, content_library: { level: 'view' } })
    const staff = { role: 'staff' as const, permissions: { content_library: { level: 'view' as const } } }
    expect(hasPermission(staff, 'content_library')).toBe(true)
    expect(hasPermission(staff, 'content_studio')).toBe(false)
  })
})
