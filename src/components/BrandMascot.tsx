import mascotEggy from '../assets/mascot-eggy.png'
import mascotGordo from '../assets/mascot-gordo.png'
import { brand } from '../lib/brand'

// Mirai's mascots belong to Mirai only: another brand shows no picture where Mirai shows one.
export function BrandMascot({ name, className }: { name: 'eggy' | 'gordo'; className?: string }) {
  if (!brand.usesMiraiArt) {
    return null
  }
  return <img src={name === 'eggy' ? mascotEggy : mascotGordo} alt="" aria-hidden="true" className={className} />
}
