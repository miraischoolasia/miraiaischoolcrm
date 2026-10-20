import { describe, expect, it } from 'vitest'
import {
  BRAND_SHADES,
  brandShadeValues,
  contrastRatio,
  leftoverBrandColors,
  MIRAI_PRIMARY,
  MIRAI_PRIMARY_DARK,
  rewriteBrandColors,
  suggestDarkColor,
} from './brandShades'

describe('brandShadeValues', () => {
  it("gives Mirai's own pinks back for Mirai's colours", () => {
    const values = brandShadeValues(MIRAI_PRIMARY, MIRAI_PRIMARY_DARK)
    expect(values['--bp-fc0c97']).toBe('#fc0c97')
    expect(values['--bp-be185d']).toBe('#be185d')
    // Every other shade lands within a step of Mirai's.
    for (const shade of BRAND_SHADES) {
      const [r, g, b] = [1, 3, 5].map((at) => parseInt(values[`--bp-${shade.hex.slice(1)}`].slice(at, at + 2), 16))
      const [er, eg, eb] = [1, 3, 5].map((at) => parseInt(shade.hex.slice(at, at + 2), 16))
      expect(Math.hypot(r - er, g - eg, b - eb)).toBeLessThan(40)
    }
  })

  it("follows a school's own colours", () => {
    const values = brandShadeValues('#2563eb', '#1e3a8a')
    expect(values['--bp-fc0c97']).toBe('#2563eb')
    expect(values['--bp-be185d']).toBe('#1e3a8a')
    // A pale background stays pale, a hover stays deeper.
    expect(contrastRatio(values['--bp-ffe4f2'], '#ffffff')).toBeLessThan(1.3)
    expect(contrastRatio(values['--bp-de0a84'], '#ffffff')).toBeGreaterThan(contrastRatio('#2563eb', '#ffffff'))
    expect(values['--color-pink-50']).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('contrast', () => {
  it('measures white words on the colours', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0)
    expect(contrastRatio('#ffffff', MIRAI_PRIMARY)).toBeLessThan(4.5)
    expect(contrastRatio('#ffffff', MIRAI_PRIMARY_DARK)).toBeGreaterThan(4.5)
  })

  it('suggests a words colour that reads on white', () => {
    const dark = suggestDarkColor('#facc15')
    expect(contrastRatio(dark, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('rewriteBrandColors', () => {
  it('turns the pinks into variables and keeps class names', () => {
    const css = '.bg-\\[\\#fc0c97\\]{background-color:#fc0c97}.text-\\[\\#BE185D\\]{color:#BE185D}'
    const out = rewriteBrandColors(css)
    expect(out).toContain('.bg-\\[\\#fc0c97\\]{background-color:var(--bp-fc0c97)}')
    expect(out).toContain('{color:var(--bp-be185d)}')
    expect(out.startsWith(':root:not(#bp-defaults){--bp-fc0c97:#fc0c97;')).toBe(true)
    expect(leftoverBrandColors(out)).toEqual([])
  })

  it('handles opacity written as hex alpha, oklab and colour mixes', () => {
    const css = [
      '.a{box-shadow:0 0 0 3px var(--tw-shadow-color,#fc0c971f)}',
      '.b{border-color:oklab(64.94% .262334 -.0230782/.4)}',
      '.c{background:color-mix(in oklab,#fc0c97 10%,transparent)}',
      '.d{color:rgb(252 12 151/.5)}',
    ].join('')
    const out = rewriteBrandColors(css)
    expect(out).toContain('color-mix(in oklab,var(--bp-fc0c97) 12.16%,transparent)')
    expect(out).toContain('.b{border-color:color-mix(in oklab,var(--bp-fc0c97) 40%,transparent)}')
    expect(out).toContain('.c{background:color-mix(in oklab,var(--bp-fc0c97) 10%,transparent)}')
    expect(out).toContain('.d{color:color-mix(in oklab,var(--bp-fc0c97) 50%,transparent)}')
    expect(leftoverBrandColors(out)).toEqual([])
  })

  it('leaves other colours alone and can run twice', () => {
    const css = '.e{color:#dc2626;background:oklab(50% .1 .1)}'
    expect(rewriteBrandColors(css)).toBe(css)
    const once = rewriteBrandColors('.f{color:#fc0c97}')
    expect(rewriteBrandColors(once)).toBe(once)
  })

  it('finds a pink that was missed', () => {
    expect(leftoverBrandColors('.g{color:#fc0c97}')).toEqual(['#fc0c97'])
  })
})
