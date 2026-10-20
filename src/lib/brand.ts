// What makes one deployment of the CRM look like its own school. Mirai's values are the defaults, so the
// Mirai deployment needs no settings; another brand sets VITE_BRAND_* in its own Vercel project. On top of
// that, an admin can set the name, logo, tab icon, colours and mascot on Class Settings > Brand
// (src/lib/branding.ts); those replace the fields below before the page is drawn.
import miraiLogo from '../assets/mirai-logo.png'
import { MIRAI_PRIMARY, MIRAI_PRIMARY_DARK } from './brandShades'

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const customName = text(import.meta.env.VITE_BRAND_NAME)
const logoUrl = text(import.meta.env.VITE_BRAND_LOGO_URL)
const faviconUrl = text(import.meta.env.VITE_BRAND_FAVICON_URL)

type Brand = {
  name: string
  company: string
  logo: string | null
  usesMiraiArt: boolean
  clubName: string
  usesFees: boolean
  usesPackages: boolean
  loginHint: string
  favicon: string | null
  primary: string
  primaryDark: string
  mascot: 'mirai' | string | null
}

export const brand: Brand = {
  // Shown on the sign-in page, the sidebar, forms, reports and the default messages.
  name: customName || 'Mirai AI School',
  // "<name> is operated by <company>" in the footer of the public form.
  company: text(import.meta.env.VITE_BRAND_COMPANY) || 'EGENIUS SDN. BHD.',
  // A picture, or null: then the name is written out as text instead.
  logo: logoUrl || (customName ? null : miraiLogo),
  // The pink seal of the public form belongs to Mirai only.
  usesMiraiArt: !customName,
  // What the yearly membership fee next to the Account Fee is called (Mirai's is the Mirai Club).
  clubName: text(import.meta.env.VITE_BRAND_CLUB_NAME) || (customName ? 'Membership' : 'Mirai Club'),
  // Whether the school charges the yearly Account Fee and membership fee. Mirai does; another brand starts with
  // none (nothing about fees shows) until it sets VITE_BRAND_FEES=true.
  usesFees: !customName || text(import.meta.env.VITE_BRAND_FEES) === 'true',
  // Whether every student is meant to have a package (a number of classes and an end date). Mirai's are; another
  // brand starts without (a student with no package is not chased for classes left or an end date, while one
  // with a package still is) until it sets VITE_BRAND_PACKAGES=true.
  usesPackages: !customName || text(import.meta.env.VITE_BRAND_PACKAGES) === 'true',
  // One line under the sign-in form telling staff what to type (VITE_BRAND_LOGIN_HINT), e.g. EduHero's
  // "Sign in with your e-mail, like msangie@eduhero.com".
  loginHint: text(import.meta.env.VITE_BRAND_LOGIN_HINT) || 'Use the username the school gave you.',
  // The tab icon: another brand's own picture (VITE_BRAND_FAVICON_URL, else its logo), or none; null for Mirai's.
  favicon: customName ? faviconUrl || logoUrl || null : null,
  // The main colour (buttons, highlights) and the darker one for coloured words on white.
  primary: MIRAI_PRIMARY,
  primaryDark: MIRAI_PRIMARY_DARK,
  // The mascot: 'mirai' (Eggy and Gordo), one picture's address, or null (none).
  mascot: customName ? null : 'mirai',
}

// The deployment's own look, before any Brand settings: what "not set" falls back to.
export const deploymentBrand: Readonly<Brand> = Object.freeze({ ...brand })
