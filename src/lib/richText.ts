// A small, safe subset of formatting for the "Text / details" field, so the
// admin can write bold words, bullet lists and links without knowing any code:
//
//   **bold**            bold words
//   [label](https://x)  a link (web addresses only)
//   - item              a bullet list (one item per line)
//   blank line          a new paragraph
//
// The text is turned into plain data here and drawn by React, so nothing the
// admin types is ever inserted into the page as HTML.

export type RichInline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'break' }

export type RichBlock =
  | { kind: 'paragraph'; inlines: RichInline[] }
  | { kind: 'list'; items: RichInline[][] }

const INLINE_PATTERN = /\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g
const LIST_LINE = /^\s*[-*]\s+(.*)$/

function isWebAddress(value: string) {
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

export function parseRichInline(line: string): RichInline[] {
  const inlines: RichInline[] = []
  let last = 0

  // Plain words that end up side by side are one piece of text.
  const pushText = (text: string) => {
    const previous = inlines.at(-1)
    if (previous?.kind === 'text') {
      previous.text += text
    } else {
      inlines.push({ kind: 'text', text })
    }
  }

  for (const match of line.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0
    if (index > last) {
      pushText(line.slice(last, index))
    }
    if (match[1] !== undefined) {
      inlines.push({ kind: 'bold', text: match[1] })
    } else if (isWebAddress(match[3])) {
      inlines.push({ kind: 'link', text: match[2], href: match[3] })
    } else {
      // Not a web address (for example javascript:): keep it as plain words.
      pushText(match[0])
    }
    last = index + match[0].length
  }

  if (last < line.length) {
    pushText(line.slice(last))
  }
  return inlines
}

// Lines in one paragraph keep their line breaks, so an address or a short
// schedule can be written one line per row.
function paragraphInlines(lines: string[]): RichInline[] {
  return lines.flatMap((line, index) => [
    ...(index > 0 ? [{ kind: 'break' } as const] : []),
    ...parseRichInline(line),
  ])
}

export function parseRichText(content: string): RichBlock[] {
  const blocks: RichBlock[] = []
  let paragraph: string[] = []
  let list: RichInline[][] = []

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', inlines: paragraphInlines(paragraph) })
      paragraph = []
    }
  }
  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ kind: 'list', items: list })
      list = []
    }
  }

  for (const line of content.replace(/\r\n/g, '\n').split('\n')) {
    const item = LIST_LINE.exec(line)
    if (item) {
      flushParagraph()
      list.push(parseRichInline(item[1]))
    } else if (line.trim() === '') {
      flushParagraph()
      flushList()
    } else {
      flushList()
      paragraph.push(line)
    }
  }
  flushParagraph()
  flushList()
  return blocks
}

// A heading is just its words: every line stays on its own row, and bold or
// links still work, but "- " does not turn into a list.
export function parseHeadingInlines(content: string): RichInline[] {
  const lines = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return paragraphInlines(lines)
}
