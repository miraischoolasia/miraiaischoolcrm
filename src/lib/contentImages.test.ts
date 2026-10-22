import { describe, expect, it, vi } from 'vitest'
import { aspectRatioOf, buildDrawPrompt, imageKeyFrom, imagePath, noPictureReason, pictureOf, wordsForPage, type DrawContext, type DrawItem } from '../../supabase/functions/content-images/logic'
import { currentImage, downloadName, drawingProgress, failedImage, pendingImage, versionsOf, type ContentImage } from './contentImages'

vi.mock('./supabase', () => ({ supabase: null }))

const carousel: DrawItem = {
  kind: 'carousel',
  pages: 3,
  size: '4:5',
  headline: '假期别让孩子闲在家',
  subheadline: '玩中学',
  posterText: '第1页：孩子假期在做什么？\n第2页：Coding 做小游戏\n第3页：RM380，WhatsApp 报名',
  visual: '孩子做机器人',
}
const single: DrawItem = { ...carousel, kind: 'single', pages: 1, size: '9:16', posterText: 'RM380\n7–12岁' }
const context: DrawContext = {
  schoolName: 'Mirai AI School',
  brandColour: '#fc0c97',
  styleName: '清新卡通',
  styleDescription: '粉色',
  hasParent: false,
  hasFirstPage: false,
  sampleCount: 2,
  hasLogo: true,
}

describe('drawing prompts', () => {
  it('puts each carousel page’s own words on it', () => {
    expect(wordsForPage(carousel, 2)).toBe('Coding 做小游戏')
    expect(wordsForPage(carousel, 3)).toBe('RM380，WhatsApp 报名')
    expect(wordsForPage({ ...carousel, posterText: 'a\nb\nc' }, 2)).toBe('b')
    expect(wordsForPage(single, 1)).toBe('RM380\n7–12岁')
  })

  it('asks for a poster with the exact Chinese words, the style, the colour and the attachments', () => {
    const prompt = buildDrawPrompt(single, { page: 1, quality: 'draft', instruction: '', parentId: null }, context)
    expect(prompt).toContain('Aspect ratio 9:16')
    expect(prompt).toContain('Big title: "假期别让孩子闲在家"')
    expect(prompt).toContain('RM380\n7–12岁')
    expect(prompt).toContain('Style: 清新卡通 - 粉色')
    expect(prompt).toContain('#fc0c97')
    expect(prompt).toContain('2 sample pictures of the style; the school logo')
    expect(prompt).toContain('Simplified Chinese')
  })

  it('keeps later carousel pages in the look of page 1', () => {
    const prompt = buildDrawPrompt(carousel, { page: 2, quality: 'draft', instruction: '', parentId: null }, { ...context, hasFirstPage: true, sampleCount: 0, hasLogo: false })
    expect(prompt).toContain('carousel page 2 of 3')
    expect(prompt).toContain('Main text: "Coding 做小游戏"')
    expect(prompt).not.toContain('Big title')
    expect(prompt).toContain('same look')
  })

  it('changes only what was asked, and redraws in high quality', () => {
    const edit = buildDrawPrompt(single, { page: 1, quality: 'draft', instruction: '标题大一点', parentId: 5 }, { ...context, hasParent: true })
    expect(edit).toContain('Change only this: 标题大一点')
    expect(edit).toContain('every word exactly')
    const hd = buildDrawPrompt(single, { page: 1, quality: 'hd', instruction: '', parentId: 5 }, { ...context, hasParent: true })
    expect(hd).toContain('high quality')
  })

  it('reads the picture out of the answer, or says why there is none', () => {
    expect(pictureOf({ candidates: [{ content: { parts: [{ text: 'hi' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }] })).toEqual({ mime: 'image/png', base64: 'AAAA' })
    expect(pictureOf({ candidates: [{ content: { parts: [{ inline_data: { mime_type: 'image/jpeg', data: 'BB' } }] } }] })).toEqual({ mime: 'image/jpeg', base64: 'BB' })
    expect(pictureOf({ candidates: [] })).toBeNull()
    expect(noPictureReason({ promptFeedback: { blockReason: 'SAFETY' } })).toContain('SAFETY')
    expect(noPictureReason({ candidates: [{ content: { parts: [{ text: 'I cannot' }] } }] })).toContain('I cannot')
  })

  it('draws with the picture key when it is set, else the shared key', () => {
    const env = (values: Record<string, string>) => (name: string) => values[name]
    expect(imageKeyFrom(env({ CONTENT_IMAGE_API_KEY: 'paid', GEMINI_API_KEY: 'free' }))).toBe('paid')
    expect(imageKeyFrom(env({ CONTENT_IMAGE_API_KEY: '  ', GEMINI_API_KEY: 'free' }))).toBe('free')
    expect(imageKeyFrom(env({ GEMINI_API_KEY: 'free' }))).toBe('free')
    expect(imageKeyFrom(env({}))).toBeNull()
  })

  it('names files and sizes the way the database accepts them', () => {
    expect(imagePath(12, 34, 'image/jpeg')).toBe('images/12/34.jpg')
    expect(imagePath(12, 34, 'image/gif')).toBe('images/12/34.png')
    expect(aspectRatioOf('3:4')).toBe('3:4')
    expect(aspectRatioOf('2:1')).toBe('1:1')
  })
})

const image = (change: Partial<ContentImage>): ContentImage => ({
  id: 1,
  itemId: 10,
  page: 1,
  quality: 'draft',
  status: 'done',
  instruction: '',
  parentId: null,
  path: 'images/10/1.png',
  error: null,
  chosen: false,
  liked: false,
  createdAt: '2026-10-22T00:00:00Z',
  ...change,
})

describe('pictures on the page', () => {
  const rows = [
    image({ id: 1 }),
    image({ id: 2, chosen: true }),
    image({ id: 3 }),
    image({ id: 4, page: 2, status: 'working', path: null }),
    image({ id: 5, page: 3, status: 'failed', path: null, error: 'Gemini 429' }),
  ]

  it('shows the chosen picture, else the newest', () => {
    expect(currentImage(rows, 10, 1)?.id).toBe(2)
    expect(currentImage(rows.filter((row) => !row.chosen), 10, 1)?.id).toBe(3)
    expect(currentImage(rows, 10, 2)).toBeNull()
    expect(versionsOf(rows, 10, 1).map((row) => row.id)).toEqual([3, 2, 1])
  })

  it('knows what is being drawn and what failed', () => {
    expect(pendingImage(rows, 10, 2)?.id).toBe(4)
    expect(failedImage(rows, 10, 3)?.error).toBe('Gemini 429')
    expect(failedImage([...rows, image({ id: 6, page: 3 })], 10, 3)).toBeNull()
    expect(drawingProgress(rows)).toEqual({ waiting: 1, done: 1, failed: 1 })
  })

  it('names downloads after the post', () => {
    expect(downloadName('假期/营', 2, 5, 'images/1/9.png')).toBe('假期 营-p2.png')
    expect(downloadName('Camp', 1, 1, 'images/1/9.jpg')).toBe('Camp.jpg')
  })
})
