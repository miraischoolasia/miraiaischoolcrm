import { useSyncExternalStore } from 'react'
import mascotEggy from '../assets/mascot-eggy.png'
import mascotGordo from '../assets/mascot-gordo.png'
import { brand, deploymentBrand } from './brand'
import { brandShadeValues, contrastRatio, suggestDarkColor, TAILWIND_PINKS, BRAND_SHADES, shadeVariable } from './brandShades'
import { supabase } from './supabase'

// Class Settings > Brand: the school's own name, logo, tab icon, colours and mascot, kept in app_settings
// 'crm_branding' (migration 20261027000000). Any field left empty falls back to the deployment's own look
// (src/lib/brand.ts), so a school that never saves here looks exactly as before.

export type CrmBranding = {
  name: string
  logo_url: string
  favicon_url: string
  primary: string
  primary_dark: string
  // Whether a mascot shows at all.
  mascot_on: boolean
  // One picture for every place a mascot shows; '' = the deployment's own (Mirai's Eggy and Gordo, or none).
  mascot_url: string
  // The student app takes this name and colour.
  student_app_follows: boolean
}

export const emptyBranding: CrmBranding = {
  name: '',
  logo_url: '',
  favicon_url: '',
  primary: '',
  primary_dark: '',
  mascot_on: true,
  mascot_url: '',
  student_app_follows: true,
}

const HEX = /^#[0-9a-fA-F]{6}$/
export const BRAND_PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const BRAND_PICTURE_MAX_BYTES = 2 * 1024 * 1024
const BUCKET = 'brand-assets'

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

export function parseBranding(raw: unknown): CrmBranding {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const color = (key: string) => (HEX.test(text(value[key])) ? text(value[key]).toLowerCase() : '')
  return {
    name: text(value.name).slice(0, 60),
    logo_url: text(value.logo_url),
    favicon_url: text(value.favicon_url),
    primary: color('primary'),
    primary_dark: color('primary_dark'),
    mascot_on: value.mascot_on !== false,
    mascot_url: text(value.mascot_url),
    student_app_follows: value.student_app_follows !== false,
  }
}

export function isHexColor(value: string) {
  return HEX.test(value)
}

// How readable the colours are, for the warnings on the Brand page (they warn, they never stop a save).
export function brandContrast(primary: string, dark: string) {
  return {
    // White words on a button in the main colour.
    onButton: contrastRatio('#ffffff', primary),
    // Coloured words on a white page.
    onWhite: contrastRatio(dark, '#ffffff'),
  }
}

export { suggestDarkColor }

// ---------------------------------------------------------------------------
// Putting a look on the page

let version = 0
const listeners = new Set<() => void>()

function notify() {
  version += 1
  listeners.forEach((listener) => listener())
}

// Re-draws a component when the look changes (a save, or the Brand page trying a look on).
export function useBrandVersion() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => version,
  )
}

// The CSS variables a look sets on <html>; none for a school on its deployment's colours.
export function brandVariables(settings: CrmBranding): Record<string, string> {
  if (!settings.primary && !settings.primary_dark) {
    return {}
  }
  const primary = settings.primary || deploymentBrand.primary
  const dark = settings.primary_dark || (settings.primary ? suggestDarkColor(primary) : deploymentBrand.primaryDark)
  return brandShadeValues(primary, dark)
}

const ALL_VARIABLES = [...BRAND_SHADES.map((shade) => shadeVariable(shade.hex)), ...TAILWIND_PINKS.map(([variable]) => variable)]

function setFavicon(href: string | null | 'deployment') {
  document.querySelectorAll('link[rel="icon"]').forEach((link) => link.remove())
  const chosen = href === 'deployment' ? (deploymentBrand.usesMiraiArt ? '/favicon.png' : deploymentBrand.favicon) : href
  if (chosen) {
    const icon = document.createElement('link')
    icon.rel = 'icon'
    icon.href = chosen
    document.head.appendChild(icon)
  }
}

// Puts a look on the page: the brand fields everyone reads, the colours, the tab's title and icon.
export function applyBranding(settings: CrmBranding) {
  brand.name = settings.name || deploymentBrand.name
  brand.logo = settings.logo_url || deploymentBrand.logo
  brand.mascot = !settings.mascot_on ? null : settings.mascot_url || deploymentBrand.mascot
  const variables = brandVariables(settings)
  brand.primary = variables[shadeVariable('#fc0c97')] ?? deploymentBrand.primary
  brand.primaryDark = variables[shadeVariable('#be185d')] ?? deploymentBrand.primaryDark

  if (typeof document !== 'undefined') {
    const root = document.documentElement
    ALL_VARIABLES.forEach((variable) => root.style.removeProperty(variable))
    Object.entries(variables).forEach(([variable, value]) => root.style.setProperty(variable, value))
    document.title = brand.name
    setFavicon(settings.favicon_url || settings.logo_url || 'deployment')
  }
  notify()
}

// The mascot picture for a place that shows one (Mirai's Eggy or Gordo there), or null for none.
export function brandMascotSrc(name: 'eggy' | 'gordo') {
  if (brand.mascot === 'mirai') {
    return name === 'eggy' ? mascotEggy : mascotGordo
  }
  return brand.mascot
}

// ---------------------------------------------------------------------------
// Loading and saving

// The last look this browser saw, so the next visit draws it straight away (index.html reads the colours too).
export const BRANDING_CACHE_KEY = 'crm-branding'

export function readCachedBranding(): CrmBranding | null {
  try {
    const raw = window.localStorage.getItem(BRANDING_CACHE_KEY)
    return raw ? parseBranding((JSON.parse(raw) as { settings?: unknown }).settings) : null
  } catch {
    return null
  }
}

function cacheBranding(settings: CrmBranding) {
  try {
    window.localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify({ settings, vars: brandVariables(settings) }))
  } catch {
    // Without storage the look is simply read again next time.
  }
}

// The saved look ('{}' = nothing saved). Open to people not signed in: the sign-in page needs it.
export async function fetchCrmBranding(): Promise<CrmBranding> {
  if (!supabase) {
    return emptyBranding
  }
  // crm_branding is newer than src/types/database.ts.
  const rpc = supabase.rpc as unknown as (name: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>
  const { data, error } = await rpc.call(supabase, 'crm_branding')
  if (error) {
    throw new Error(error.message)
  }
  return parseBranding(data)
}

// Before the first page is drawn: the cached look at once, then the saved one. With nothing cached it waits
// for the saved one (up to waitMs), so the sign-in page does not first show the wrong logo.
export async function startBranding(waitMs = 1500) {
  const cached = readCachedBranding()
  if (cached) {
    applyBranding(cached)
  }
  const fresh = fetchCrmBranding()
    .then((settings) => {
      cacheBranding(settings)
      if (JSON.stringify(settings) !== JSON.stringify(cached ?? emptyBranding)) {
        applyBranding(settings)
      }
    })
    .catch(() => {
      // A database without the Brand settings yet, or no connection: the deployment's own look stays.
    })
  if (!cached) {
    await Promise.race([fresh, new Promise((resolve) => setTimeout(resolve, waitMs))])
  }
}

export async function saveCrmBranding(settings: CrmBranding): Promise<string | null> {
  if (!supabase) {
    return 'Supabase is not configured.'
  }
  const payload = { ...settings, name: settings.name.trim() }
  const rpc = supabase.rpc as unknown as (
    name: string,
    args: object,
  ) => PromiseLike<{ error: { message: string } | null }>
  const { error } = await rpc.call(supabase, 'set_crm_branding', { p_settings: payload })
  if (error) {
    return error.message
  }
  cacheBranding(payload)
  applyBranding(payload)
  return null
}

// Checks a picture before it is uploaded: the bucket takes PNG, JPG or WebP up to 2 MB.
export function brandPictureProblem(file: File) {
  if (!BRAND_PICTURE_TYPES.includes(file.type)) {
    return 'Please pick a PNG, JPG or WebP picture.'
  }
  if (file.size > BRAND_PICTURE_MAX_BYTES) {
    return 'The picture is bigger than 2 MB. Please pick a smaller one.'
  }
  return null
}

// Stores a picture in the public brand-assets bucket and returns its address. Every upload gets its own
// name, so a new logo never shows an old cached copy.
export async function uploadBrandPicture(file: File, kind: 'logo' | 'favicon' | 'mascot') {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  const problem = brandPictureProblem(file)
  if (problem) {
    throw new Error(problem)
  }
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type] ?? 'png'
  const path = `${kind}-${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000' })
  if (error) {
    throw error
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
