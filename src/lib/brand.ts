// What makes one deployment of the CRM look like its own school. Mirai's values are the defaults, so the
// Mirai deployment needs no settings; another brand sets VITE_BRAND_* in its own Vercel project.
import miraiLogo from '../assets/mirai-logo.png'

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const customName = text(import.meta.env.VITE_BRAND_NAME)
const logoUrl = text(import.meta.env.VITE_BRAND_LOGO_URL)

export const brand = {
  // Shown on the sign-in page, the sidebar, forms, reports and the default messages.
  name: customName || 'Mirai AI School',
  // "<name> is operated by <company>" in the footer of the public form.
  company: text(import.meta.env.VITE_BRAND_COMPANY) || 'EGENIUS SDN. BHD.',
  // A picture, or null: then the name is written out as text instead.
  logo: logoUrl || (customName ? null : miraiLogo),
  // The pink seal and mascot of the public form belong to Mirai only.
  usesMiraiArt: !customName,
}
