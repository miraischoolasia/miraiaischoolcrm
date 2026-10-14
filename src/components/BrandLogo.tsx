import { brand } from '../lib/brand'

// The brand's logo, or its name in plain text when it has no logo picture.
export function BrandLogo({ className, textClassName }: { className?: string; textClassName?: string }) {
  if (brand.logo) {
    return <img src={brand.logo} alt={brand.name} className={className} />
  }
  return <span className={textClassName ?? 'text-lg font-bold'}>{brand.name}</span>
}
