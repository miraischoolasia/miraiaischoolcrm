import { brandMascotSrc, useBrandVersion } from '../lib/branding'

// The school's mascot: its one picture from Class Settings > Brand everywhere, Mirai's Eggy and Gordo on the
// Mirai deployment, or nothing (another brand without one, or the mascot switched off).
export function BrandMascot({ name, className }: { name: 'eggy' | 'gordo'; className?: string }) {
  useBrandVersion()
  const src = brandMascotSrc(name)
  if (!src) {
    return null
  }
  return <img src={src} alt="" aria-hidden="true" className={className} />
}
