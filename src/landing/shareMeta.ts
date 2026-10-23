// The title, text and picture WhatsApp / Facebook show for a landing page link. Their link readers do not run the
// page's code, so the small server function (api/landing-page.ts) writes these tags into the page it sends back.
// Kept free of browser and server code so both the function and the tests can use it.

export type ShareMeta = {
  title: string
  description: string
  image: string
  url: string
  siteName: string
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function shareTags(meta: ShareMeta) {
  const tags: [string, string, string][] = [
    ['name', 'description', meta.description],
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', meta.siteName],
    ['property', 'og:title', meta.title],
    ['property', 'og:description', meta.description],
    ['property', 'og:url', meta.url],
    ['property', 'og:image', meta.image],
    ['name', 'twitter:card', meta.image ? 'summary_large_image' : 'summary'],
  ]
  return tags
    .filter(([, , content]) => content.trim() !== '')
    .map(([attribute, name, content]) => `<meta ${attribute}="${name}" content="${escapeHtml(content.trim())}" />`)
    .join('\n    ')
}

// The app's index.html with the page's own title and share tags (any description already there is replaced).
export function injectShareTags(html: string, meta: ShareMeta) {
  const title = `<title>${escapeHtml(meta.title.trim() || meta.siteName)}</title>`
  const withoutOld = html.replace(/<meta\s+name="description"[^>]*>\s*/i, '')
  const withTitle = /<title>[\s\S]*?<\/title>/i.test(withoutOld)
    ? withoutOld.replace(/<title>[\s\S]*?<\/title>/i, title)
    : withoutOld.replace(/<\/head>/i, `  ${title}\n  </head>`)
  return withTitle.replace(/<\/head>/i, `    ${shareTags(meta)}\n  </head>`)
}
