// The parts of Content Studio's picture drawing that do not need Deno or the network: which words go on
// which page, what the picture AI is asked, and how its answer is read. Kept apart so they can be tested.

export type ImageQuality = 'draft' | 'hd'

export type DrawJob = {
  id: number
  itemId: number
  page: number
  quality: ImageQuality
  instruction: string
  parentId: number | null
  attempts: number
}

export type DrawItem = {
  kind: 'single' | 'carousel' | 'caption'
  pages: number
  size: string
  headline: string
  subheadline: string
  posterText: string
  visual: string
}

export type DrawContext = {
  schoolName: string
  brandColour: string
  styleName: string
  styleDescription: string
  // What images are attached, in this order: the picture being changed, the carousel's first page, the
  // style's sample pictures, the school's logo.
  hasParent: boolean
  hasFirstPage: boolean
  sampleCount: number
  hasLogo: boolean
}

// Every size Content Studio offers is one Gemini can draw as it is.
export const ASPECT_RATIOS: Record<string, string> = { '1:1': '1:1', '4:5': '4:5', '9:16': '9:16', '3:4': '3:4' }

export function aspectRatioOf(size: string): string {
  return ASPECT_RATIOS[size] ?? '1:1'
}

// The words of one page. A carousel's poster text has a line per page ("第2页：…"); a page without its own
// line gets the next unused line in order. A single poster has all its words on its one page.
export function wordsForPage(item: DrawItem, page: number): string {
  if (item.kind !== 'carousel') return item.posterText.trim()
  const lines = item.posterText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const labelled = lines.find((line) => new RegExp(`^(第\\s*${page}\\s*页|Page\\s*${page}\\b|P${page}\\b)`, 'i').test(line))
  const line = labelled ?? lines[page - 1] ?? ''
  return line.replace(/^(第\s*\d+\s*页|Page\s*\d+|P\d+)\s*[:：.、-]?\s*/i, '').trim()
}

export function buildDrawPrompt(item: DrawItem, job: Pick<DrawJob, 'page' | 'quality' | 'instruction' | 'parentId'>, context: DrawContext): string {
  const ratio = aspectRatioOf(item.size)
  const attachments: string[] = []
  if (context.hasParent) attachments.push('the poster to work on')
  if (context.hasFirstPage) attachments.push('page 1 of the same carousel')
  if (context.sampleCount > 0) attachments.push(`${context.sampleCount} sample picture${context.sampleCount === 1 ? '' : 's'} of the style`)
  if (context.hasLogo) attachments.push('the school logo')
  const attached = attachments.length > 0 ? `Attached, in this order: ${attachments.join('; ')}.` : ''

  // "Change it": the same poster with the team's change.
  if (context.hasParent && job.instruction.trim()) {
    return [
      `Edit the attached poster. Change only this: ${job.instruction.trim()}`,
      'Keep everything else as it is: layout, colours, people, and every word exactly as written (Simplified Chinese).',
      `Aspect ratio ${ratio}.`,
      attached,
    ]
      .filter(Boolean)
      .join('\n')
  }
  // High quality: the same poster, redrawn sharply.
  if (context.hasParent && job.quality === 'hd') {
    return [
      'Redraw the attached poster in high quality with sharp, clean detail.',
      'Keep the same layout, colours, people and every word exactly as written (Simplified Chinese); fix any blurry or broken letters.',
      `Aspect ratio ${ratio}.`,
      attached,
    ]
      .filter(Boolean)
      .join('\n')
  }

  const words = wordsForPage(item, job.page)
  const textLines =
    item.kind === 'carousel' && job.page > 1
      ? [words && `Main text: "${words}"`]
      : [`Big title: "${item.headline}"`, item.subheadline && `Small title: "${item.subheadline}"`, words && `Other text:\n${words}`]
  return [
    `Design a social media ${item.kind === 'carousel' ? `carousel page ${job.page} of ${item.pages}` : 'poster'} for ${context.schoolName}, a children's education centre in Malaysia. Aspect ratio ${ratio}.`,
    `Style: ${context.styleName}${context.styleDescription ? ` - ${context.styleDescription}` : ''}`,
    item.visual && `Picture: ${item.visual}`,
    'Write this text on the poster exactly as given, in Simplified Chinese, large and easy to read, spelled correctly, and no other words:',
    ...textLines.filter(Boolean),
    context.brandColour && `Use the school colour ${context.brandColour} as the main accent.`,
    context.hasFirstPage && 'Keep exactly the same look, colours, fonts and layout style as the attached first page.',
    context.sampleCount > 0 && 'Follow the look of the attached sample pictures, but do not copy their words.',
    context.hasLogo && 'Place the attached school logo small in a corner, unchanged.',
    'No watermarks, no frames around the picture, no made-up phone numbers or prices.',
    attached,
  ]
    .filter(Boolean)
    .join('\n')
}

// The picture in Gemini's answer (camelCase or snake_case), or null.
export function pictureOf(data: unknown): { mime: string; base64: string } | null {
  const parts = (data as { candidates?: { content?: { parts?: unknown[] } }[] })?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return null
  for (const part of parts) {
    const inline = (part as { inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } })
    const camel = inline.inlineData
    const snake = inline.inline_data
    const base64 = camel?.data ?? snake?.data
    const mime = camel?.mimeType ?? snake?.mime_type ?? 'image/png'
    if (typeof base64 === 'string' && base64.length > 0 && mime.startsWith('image/')) {
      return { mime, base64 }
    }
  }
  return null
}

// Why Gemini gave no picture (its words, a safety block), for the team.
export function noPictureReason(data: unknown): string {
  const candidate = (data as { candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[]; promptFeedback?: { blockReason?: string } })
  const blocked = candidate?.promptFeedback?.blockReason
  if (blocked) return `The AI refused to draw this (${blocked}). Change the words or the picture description.`
  const reason = candidate?.candidates?.[0]?.finishReason
  const said = candidate?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join(' ').trim()
  if (said) return `The AI did not draw a picture: ${said.slice(0, 160)}`
  return `The AI did not draw a picture${reason ? ` (${reason})` : ''}. Try again.`
}

export const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export function imagePath(itemId: number, jobId: number, mime: string): string {
  return `images/${itemId}/${jobId}.${EXTENSIONS[mime] ?? 'png'}`
}

// The key pictures are drawn with: CONTENT_IMAGE_API_KEY (a paid key) when it is set, else the school's
// shared GEMINI_API_KEY. Blank values count as not set.
export function imageKeyFrom(read: (name: string) => string | undefined): string | null {
  return read('CONTENT_IMAGE_API_KEY')?.trim() || read('GEMINI_API_KEY')?.trim() || null
}
