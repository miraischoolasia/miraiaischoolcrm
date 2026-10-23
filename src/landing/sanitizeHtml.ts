// The rich text of a Text block, made safe to put on a public page: only plain formatting tags are kept, links
// only to web, e-mail and phone addresses, and every other tag (script, iframe, style ...) or attribute is dropped.

const KEEP = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'A', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'HR', 'SPAN',
])
// Removed together with everything inside them.
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH', 'TITLE', 'HEAD'])
const SAFE_LINK = /^(https?:|mailto:|tel:|#)/i
const ALIGN = /^text-align:\s*(left|right|center|justify);?$/i

function clean(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(node.textContent ?? '')
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null
  }
  const element = node as Element
  const tag = element.tagName.toUpperCase()
  if (DROP.has(tag)) {
    return null
  }
  const children = Array.from(element.childNodes)
    .map((child) => clean(child, doc))
    .filter((child): child is Node => child !== null)
  if (!KEEP.has(tag)) {
    // An unknown wrapper (div, font ...): keep what is inside it.
    const fragment = doc.createDocumentFragment()
    children.forEach((child) => fragment.appendChild(child))
    return fragment
  }
  const out = doc.createElement(tag.toLowerCase())
  if (tag === 'A') {
    const href = (element.getAttribute('href') ?? '').trim()
    if (SAFE_LINK.test(href)) {
      out.setAttribute('href', href)
      if (/^https?:/i.test(href)) {
        out.setAttribute('target', '_blank')
        out.setAttribute('rel', 'noopener noreferrer')
      }
    }
  }
  // Text alignment from the editor's align buttons.
  const style = (element.getAttribute('style') ?? '').trim()
  if (ALIGN.test(style)) {
    out.setAttribute('style', style)
  }
  children.forEach((child) => out.appendChild(child))
  return out
}

export function sanitizeHtml(html: string) {
  if (!html) {
    return ''
  }
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const target = document.implementation.createHTMLDocument('')
  const box = target.createElement('div')
  Array.from(doc.body.childNodes)
    .map((child) => clean(child, target))
    .filter((child): child is Node => child !== null)
    .forEach((child) => box.appendChild(child))
  return box.innerHTML
}
