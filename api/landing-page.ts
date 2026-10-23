// Vercel function for /p/<slug> (vercel.json sends those addresses here). It returns the app's own index.html with
// the landing page's title, text and picture written in, so a link shared on WhatsApp or Facebook shows a preview
// (their link readers do not run the page's code). Parents get the same page, and the app then draws it as usual.
// Each school's Vercel project already has its own VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.

import { injectShareTags } from '../src/landing/shareMeta'

declare const process: { env: Record<string, string | undefined> }

type Published = {
  slug: string
  title: string
  seo_title: string
  seo_description: string
  share_image_url: string
} | null

const SLUG = /^[a-z0-9][a-z0-9-]{1,59}$/

async function rpc<T>(name: string, body: object): Promise<T | null> {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    return null
  }
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    return null
  }
  return (await response.json()) as T
}

export async function GET(request: Request): Promise<Response> {
  const address = new URL(request.url)
  const slug = (address.searchParams.get('slug') ?? '').toLowerCase()
  const shell = await fetch(new URL('/index.html', address.origin))
  const html = shell.ok ? await shell.text() : '<!doctype html><html><head></head><body><div id="root"></div></body></html>'

  const [page, branding] = SLUG.test(slug)
    ? await Promise.all([
        rpc<Published>('get_published_landing_page', { p_slug: slug }).catch(() => null),
        rpc<{ name?: string; logo_url?: string }>('crm_branding', {}).catch(() => null),
      ])
    : [null, null]

  const siteName = branding?.name || process.env.VITE_BRAND_NAME || 'Mirai AI School'
  const body = page
    ? injectShareTags(html, {
        title: page.seo_title || page.title,
        description: page.seo_description,
        image: page.share_image_url || branding?.logo_url || '',
        url: `${address.origin}/p/${page.slug}`,
        siteName,
      })
    : html

  return new Response(body, {
    status: page ? 200 : 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // A change shows within a minute; WhatsApp and Facebook keep their own copy longer.
      'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
    },
  })
}
