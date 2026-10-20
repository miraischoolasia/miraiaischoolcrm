// The brand colour, everywhere at once. The CRM's pages are written with Mirai's pinks (bg-[#fc0c97],
// text-[#be185d], ...). The build turns each of those pinks in the finished CSS into a CSS variable,
// --bp-<hex>, whose default is the same pink, so Mirai looks exactly as before; when a school sets its own
// colours (Class Settings > Brand), the page sets those variables to the matching shades of its colours.
// Nothing here touches the page, so the build (vite.config.ts) and the browser share it.

export const MIRAI_PRIMARY = '#fc0c97'
export const MIRAI_PRIMARY_DARK = '#be185d'

type Shade = {
  // Mirai's pink as the pages write it.
  hex: string
  // Which of the school's two colours it is a shade of.
  from: 'primary' | 'dark'
  // Lighter (towards white) or deeper (towards black) than that colour.
  towards: 'white' | 'black'
}

// Every Mirai pink in the pages' CSS. Red (errors) and the stage/tag colours a user picks are not here.
export const BRAND_SHADES: Shade[] = [
  { hex: '#fc0c97', from: 'primary', towards: 'white' },
  { hex: '#be185d', from: 'dark', towards: 'white' },
  // Hover and pressed buttons.
  { hex: '#de0a84', from: 'primary', towards: 'black' },
  { hex: '#e00a87', from: 'primary', towards: 'black' },
  { hex: '#e00b88', from: 'primary', towards: 'black' },
  { hex: '#c2077a', from: 'primary', towards: 'black' },
  { hex: '#db2777', from: 'primary', towards: 'black' },
  { hex: '#d62976', from: 'primary', towards: 'black' },
  { hex: '#ec4899', from: 'primary', towards: 'white' },
  { hex: '#9d174d', from: 'dark', towards: 'black' },
  // Pale backgrounds and borders.
  { hex: '#ffe4f2', from: 'primary', towards: 'white' },
  { hex: '#fff1f8', from: 'primary', towards: 'white' },
  { hex: '#fff8fc', from: 'primary', towards: 'white' },
  { hex: '#fff0f9', from: 'primary', towards: 'white' },
  { hex: '#fbcfe8', from: 'primary', towards: 'white' },
  { hex: '#fff0f8', from: 'primary', towards: 'white' },
  { hex: '#fff3fa', from: 'primary', towards: 'white' },
  { hex: '#ffd9ee', from: 'primary', towards: 'white' },
  { hex: '#fff7fb', from: 'primary', towards: 'white' },
  { hex: '#fff2f9', from: 'primary', towards: 'white' },
  { hex: '#ffe0f2', from: 'primary', towards: 'white' },
  { hex: '#ffd1ea', from: 'primary', towards: 'white' },
  { hex: '#fdf2f8', from: 'primary', towards: 'white' },
  { hex: '#fce7f3', from: 'primary', towards: 'white' },
]

// Tailwind's own light pinks (bg-pink-50, border-pink-100, ...) are brand tints on these pages too. They are
// CSS variables already, so the page only overrides them for a school with its own colour.
export const TAILWIND_PINKS: Array<[variable: string, hex: string]> = [
  ['--color-pink-50', '#fdf2f8'],
  ['--color-pink-100', '#fce7f3'],
  ['--color-pink-200', '#fbcfe8'],
  ['--color-pink-300', '#f9a8d4'],
]

export function shadeVariable(hex: string) {
  return `--bp-${hex.slice(1).toLowerCase()}`
}

type Rgb = [number, number, number]

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16)) as Rgb
}

export function rgbToHex([r, g, b]: Rgb) {
  return `#${[r, g, b].map((part) => Math.round(Math.min(255, Math.max(0, part))).toString(16).padStart(2, '0')).join('')}`
}

function mix(color: Rgb, target: Rgb, amount: number): Rgb {
  return color.map((part, index) => part + (target[index] - part) * amount) as Rgb
}

function distance(a: Rgb, b: Rgb) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [0, 0, 0]

// How far towards white or black Mirai's shade sits from Mirai's colour, so the same step can be taken from
// the school's colour.
function stepOf(shade: Shade) {
  const base = hexToRgb(shade.from === 'primary' ? MIRAI_PRIMARY : MIRAI_PRIMARY_DARK)
  const goal = hexToRgb(shade.hex)
  const target = shade.towards === 'white' ? WHITE : BLACK
  let best = 0
  let bestDistance = Infinity
  for (let step = 0; step <= 200; step += 1) {
    const gap = distance(mix(base, target, step / 200), goal)
    if (gap < bestDistance) {
      bestDistance = gap
      best = step / 200
    }
  }
  return best
}

const steps = new Map(BRAND_SHADES.map((shade) => [shade.hex, stepOf(shade)]))

// The value of every --bp-* variable (and Tailwind's light pinks) for a school's two colours.
export function brandShadeValues(primary: string, dark: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const shade of BRAND_SHADES) {
    const base = hexToRgb(shade.from === 'primary' ? primary : dark)
    values[shadeVariable(shade.hex)] = rgbToHex(mix(base, shade.towards === 'white' ? WHITE : BLACK, steps.get(shade.hex) ?? 0))
  }
  const primaryRgb = hexToRgb(primary)
  const miraiRgb = hexToRgb(MIRAI_PRIMARY)
  for (const [variable, hex] of TAILWIND_PINKS) {
    let best = 0
    let bestDistance = Infinity
    for (let step = 0; step <= 200; step += 1) {
      const gap = distance(mix(miraiRgb, WHITE, step / 200), hexToRgb(hex))
      if (gap < bestDistance) {
        bestDistance = gap
        best = step / 200
      }
    }
    values[variable] = rgbToHex(mix(primaryRgb, WHITE, best))
  }
  return values
}

// WCAG contrast between two colours: 1 (the same) to 21 (black on white). Small words need 4.5 or more.
export function contrastRatio(a: string, b: string) {
  const luminance = (hex: string) => {
    const [r, g, b] = hexToRgb(hex).map((part) => {
      const value = part / 255
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [light, deep] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (deep + 0.05)
}

// A darker colour for words, from the main colour: the lightest shade of it that reads on white (4.5).
export function suggestDarkColor(primary: string) {
  const base = hexToRgb(primary)
  for (let step = 0; step <= 100; step += 1) {
    const candidate = rgbToHex(mix(base, BLACK, step / 100))
    if (contrastRatio(candidate, '#ffffff') >= 4.5) {
      return candidate
    }
  }
  return '#000000'
}

// ---------------------------------------------------------------------------
// The build step: Mirai's pinks in the finished CSS become the --bp-* variables.

// OKLab to sRGB (0-255), for the colours Tailwind writes out as oklab(...) after mixing in an opacity.
function oklabToRgb(l: number, a: number, b: number): Rgb {
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1,
    -1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1,
    -0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1,
  ]
  return linear.map((value) => {
    const encoded = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055
    return encoded * 255
  }) as Rgb
}

const shadeRgbs = BRAND_SHADES.map((shade) => ({ hex: shade.hex, rgb: hexToRgb(shade.hex) }))

function shadeNear(rgb: Rgb) {
  return shadeRgbs.find((shade) => distance(shade.rgb, rgb) < 2.5)?.hex ?? null
}

function percent(alpha: string) {
  const value = alpha.endsWith('%') ? Number(alpha.slice(0, -1)) : Number(alpha) * 100
  return `${Math.round(value * 100) / 100}%`
}

function withAlpha(hex: string, alpha: string | null) {
  const variable = `var(${shadeVariable(hex)})`
  return alpha === null ? variable : `color-mix(in oklab,${variable} ${percent(alpha)},transparent)`
}

// Not after a backslash: ".bg-\[\#fc0c97\]" is the class's name, not a colour.
const HEX_PATTERN = new RegExp(`(?<!\\\\)#(${BRAND_SHADES.map((shade) => shade.hex.slice(1)).join('|')})([0-9a-f]{2})?(?![0-9a-f])`, 'gi')
const OKLAB_PATTERN = /oklab\(\s*([\d.]+)%\s+(-?[\d.]+)\s+(-?[\d.]+)\s*(?:\/\s*([\d.]+%?))?\s*\)/gi
const RGB_PATTERN = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[/,]\s*([\d.]+%?))?\s*\)/gi

const DEFAULTS_SELECTOR = ':root:not(#bp-defaults)'
const DEFAULTS_PATTERN = /:root:not\(#bp-defaults\)\{[^}]*\}\n?/g

// Rewrites one stylesheet, and puts the --bp-* defaults (Mirai's pinks) in front when it uses any. Safe to run
// twice (once on each file, once more on the finished, minified file).
export function rewriteBrandColors(css: string) {
  const rewritten = css
    .replace(DEFAULTS_PATTERN, '')
    .replace(HEX_PATTERN, (_match, hex: string, alphaHex: string | undefined) =>
      withAlpha(`#${hex.toLowerCase()}`, alphaHex === undefined ? null : String(parseInt(alphaHex, 16) / 255)),
    )
    .replace(OKLAB_PATTERN, (match, l: string, a: string, b: string, alpha: string | undefined) => {
      const hex = shadeNear(oklabToRgb(Number(l) / 100, Number(a), Number(b)))
      return hex ? withAlpha(hex, alpha ?? null) : match
    })
    .replace(RGB_PATTERN, (match, r: string, g: string, b: string, alpha: string | undefined) => {
      const hex = shadeNear([Number(r), Number(g), Number(b)])
      return hex ? withAlpha(hex, alpha ?? null) : match
    })
  if (!rewritten.includes('var(--bp-')) {
    return rewritten
  }
  const defaults = BRAND_SHADES.map((shade) => `${shadeVariable(shade.hex)}:${shade.hex}`).join(';')
  return `${DEFAULTS_SELECTOR}{${defaults}}\n${rewritten}`
}

// Mirai pinks a rewritten stylesheet still has outside the defaults: the build stops on any.
export function leftoverBrandColors(css: string) {
  const body = css.replace(DEFAULTS_PATTERN, '')
  const found = new Set<string>()
  for (const match of body.matchAll(HEX_PATTERN)) {
    found.add(match[0])
  }
  for (const match of body.matchAll(OKLAB_PATTERN)) {
    if (shadeNear(oklabToRgb(Number(match[1]) / 100, Number(match[2]), Number(match[3])))) {
      found.add(match[0])
    }
  }
  for (const match of body.matchAll(RGB_PATTERN)) {
    if (shadeNear([Number(match[1]), Number(match[2]), Number(match[3])])) {
      found.add(match[0])
    }
  }
  return [...found]
}
