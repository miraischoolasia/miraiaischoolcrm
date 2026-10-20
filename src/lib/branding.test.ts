import { afterEach, describe, expect, it } from 'vitest'
import { brand, deploymentBrand } from './brand'
import { applyBranding, brandContrast, brandPictureProblem, brandVariables, emptyBranding, parseBranding } from './branding'

afterEach(() => {
  applyBranding(emptyBranding)
})

describe('parseBranding', () => {
  it('keeps only well-formed values', () => {
    expect(parseBranding(null)).toEqual(emptyBranding)
    expect(
      parseBranding({ name: '  EduHero  ', primary: '#2563EB', primary_dark: 'blue', mascot_on: false, student_app_follows: 'no' }),
    ).toEqual({ ...emptyBranding, name: 'EduHero', primary: '#2563eb', mascot_on: false })
  })
})

describe('applyBranding', () => {
  it('changes nothing for a school that saved nothing', () => {
    applyBranding(emptyBranding)
    expect(brand.name).toBe(deploymentBrand.name)
    expect(brand.logo).toBe(deploymentBrand.logo)
    expect(brand.mascot).toBe(deploymentBrand.mascot)
    expect(brandVariables(emptyBranding)).toEqual({})
    expect(document.documentElement.style.getPropertyValue('--bp-fc0c97')).toBe('')
  })

  it("puts the school's look on the page", () => {
    applyBranding({
      ...emptyBranding,
      name: 'Bright Kids',
      logo_url: 'https://x.supabase.co/storage/v1/object/public/brand-assets/logo-1.png',
      primary: '#2563eb',
      mascot_url: 'https://x.supabase.co/storage/v1/object/public/brand-assets/mascot-1.png',
    })
    expect(brand.name).toBe('Bright Kids')
    expect(document.title).toBe('Bright Kids')
    expect(brand.logo).toContain('logo-1.png')
    expect(brand.mascot).toContain('mascot-1.png')
    expect(brand.primary).toBe('#2563eb')
    expect(document.documentElement.style.getPropertyValue('--bp-fc0c97')).toBe('#2563eb')
    // The words colour is worked out when only the main colour is set.
    expect(brandContrast(brand.primary, brand.primaryDark).onWhite).toBeGreaterThanOrEqual(4.5)
    expect(document.querySelector('link[rel="icon"]')?.getAttribute('href')).toContain('logo-1.png')
  })

  it('hides the mascot when it is switched off', () => {
    applyBranding({ ...emptyBranding, mascot_on: false })
    expect(brand.mascot).toBeNull()
  })
})

describe('brandPictureProblem', () => {
  it('takes PNG, JPG and WebP up to 2 MB', () => {
    expect(brandPictureProblem(new File(['x'], 'a.png', { type: 'image/png' }))).toBeNull()
    expect(brandPictureProblem(new File(['x'], 'a.svg', { type: 'image/svg+xml' }))).toMatch(/PNG/)
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'b.png', { type: 'image/png' })
    expect(brandPictureProblem(big)).toMatch(/2 MB/)
  })
})
