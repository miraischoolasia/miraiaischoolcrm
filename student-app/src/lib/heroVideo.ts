// The hero as a moving picture: a looping video with a see-through
// background (WebM VP9 with alpha), kept in public/lobby/<set>/ with the
// app and described in scene.json, so a new video needs no program change.
// Browsers that cannot show a see-through WebM (Safari and every iPhone
// browser), reduced motion, a data saver or a slow connection, and a low
// battery that is not charging get its still picture instead.

export type HeroVideo = {
  // The video and its still picture (the same size), in the set's folder.
  webm: string
  poster: string
  // The video's size in pixels.
  width: number
  height: number
  // The middle of the hero's feet in the video, and the hero's height (top of the head to the soles), in its pixels.
  feetX: number
  feetY: number
  heroPixels: number
}

const fileName = /^[\w.() -]+\.(webm|webp|png)$/i

export function readHeroVideo(value: unknown): HeroVideo | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const size = (key: string) => (typeof raw[key] === 'number' && Number.isFinite(raw[key]) && (raw[key] as number) > 0 && (raw[key] as number) <= 8000 ? (raw[key] as number) : null)
  const file = (key: string, ending: RegExp) => (typeof raw[key] === 'string' && fileName.test(raw[key] as string) && ending.test(raw[key] as string) ? (raw[key] as string) : null)
  const webm = file('webm', /\.webm$/i)
  const poster = file('poster', /\.(webp|png)$/i)
  const width = size('width')
  const height = size('height')
  const feetX = size('feetX')
  const feetY = size('feetY')
  const heroPixels = size('heroPixels')
  if (!webm || !poster || !width || !height || !feetX || !feetY || !heroPixels) return undefined
  return { webm, poster, width, height, feetX, feetY, heroPixels }
}

// Safari and the iPhone browsers (all WebKit) play WebM without its see-through layer.
export function playsSeeThroughWebm(userAgent: string) {
  if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent)) return false
  if (/Chrome|Chromium|Edg\/|OPR\/|Firefox/.test(userAgent)) return true
  return !/AppleWebKit/.test(userAgent)
}

export type MotionConditions = {
  userAgent: string
  reducedMotion: boolean
  saveData: boolean
  // navigator.connection.effectiveType when the browser tells it ('4g', '3g', ...).
  connection: string | null
  // The battery when the browser tells it.
  battery: { level: number; charging: boolean } | null
}

// Whether to play the hero's video (else its still picture).
export function playsHeroVideo(conditions: MotionConditions) {
  if (conditions.reducedMotion || conditions.saveData) return false
  if (conditions.connection && /^(slow-2g|2g|3g)$/.test(conditions.connection)) return false
  if (conditions.battery && !conditions.battery.charging && conditions.battery.level <= 0.2) return false
  return playsSeeThroughWebm(conditions.userAgent)
}

// Where the video goes in the hero's own units (the static hero is 660
// units from the top of its head to its soles; scene.json gives the point
// of the video that sits where the still hero's feet are).
export const heroUnitsTall = 660

export function heroVideoBox(video: HeroVideo) {
  const unitsPerPixel = heroUnitsTall / video.heroPixels
  return {
    left: -video.feetX * unitsPerPixel,
    top: -video.feetY * unitsPerPixel,
    width: video.width * unitsPerPixel,
    height: video.height * unitsPerPixel,
  }
}
