// Where the lobby's parts go on a screen of any size (no React here, so
// lobby.test.ts can check it). The background fills the whole window (like
// CSS object-fit: cover). The buttons are laid out in the design's units
// (the 1672 x 941 design) on a layer inside a margin round the window,
// pinned to its corners and edges and scaled with the window's height, a
// little smaller than the design so the background shows between them. The
// hero stands on the background's platform. No picture is ever drawn bigger
// than its own pixels (the screen's pixel ratio counted).

import { readHeroVideo, type HeroVideo } from './heroVideo'

export const designWidth = 1672
export const designHeight = 941

// The narrowest the buttons' layer gets, in design units: the top row (name
// plate, sound, settings) and the bottom row (Ask AI, the big button) still
// fit side by side at 1024 px wide.
export const minLayerWidth = 1250

// Room left round the window's edges (share of its width and height), so the
// buttons sit in from the edges with the background showing.
export const margin = { x: 0.05, y: 0.04 }

// The buttons and the hero against the design's size: smaller, so the screen
// does not feel crowded.
export const buttonsSize = 0.85
export const heroSize = 0.82

// The bottom bar at most this wide (design units), in the middle.
export const navMaxWidth = 1460

// A school's lobby background and where its platform is, kept in
// public/lobby/<set>/scene.json so a new picture (a wider one, say) needs no
// program change. Fractions are of the picture's width and height.
export type LobbyScene = {
  background: string
  // The same picture at other widths, for a smaller screen (srcset); the
  // biggest is used on a big screen.
  backgrounds?: { file: string; width: number }[]
  width: number
  height: number
  // Which part of the picture stays in view when the window crops it (0 = left/top, 1 = right/bottom).
  focusX: number
  focusY: number
  // The middle of the platform the hero stands on.
  platformX: number
  platformY: number
  // The hero's height as a share of the picture's height.
  heroHeight: number
  // The most screen pixels one design unit may take before a picture is
  // drawn bigger than its own pixels: the buttons' pictures (the least
  // detailed of them, the bottom bar's icons, are 2.18 x their design size)
  // and the hero's (1448 px tall for 688 design units: 2.1).
  buttonsMaxScale: number
  heroMaxScale: number
  // The hero as a looping see-through video instead of the still picture (lib/heroVideo.ts).
  heroVideo?: HeroVideo
}

// The hero picture in design units, measured from the middle of its feet.
export const heroBox = { left: -272, top: -662, width: 516, height: 688 }

// The bottom bar's top, from the layer's bottom (design units), and how far
// above it the hero's feet stay.
const navTop = 115
const feetAboveNav = 36

export function lobbyLayout(windowWidth: number, windowHeight: number, scene: LobbyScene, pixelRatio = 1) {
  const width = Math.max(1, windowWidth)
  const height = Math.max(1, windowHeight)
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1
  // The layer the buttons sit on: the window less its margin.
  const inset = { x: width * margin.x, y: height * margin.y }
  const inner = { width: width - 2 * inset.x, height: height - 2 * inset.y }
  // The buttons: one design unit = `unit` px.
  const unit = Math.min(Math.min(inner.height / designHeight, inner.width / minLayerWidth) * buttonsSize, scene.buttonsMaxScale / ratio)
  // The background covers the window.
  const cover = Math.max(width / scene.width, height / scene.height)
  const background = {
    width: scene.width * cover,
    height: scene.height * cover,
    x: (width - scene.width * cover) * scene.focusX,
    y: (height - scene.height * cover) * scene.focusY,
  }
  // The hero grows with the background, but never taller than the window
  // allows (a very wide window crops the background's top and bottom), and
  // never past its own pixels.
  const heroScale = Math.min(
    Math.min((background.height * scene.heroHeight) / heroBox.height, height / designHeight) * heroSize,
    scene.heroMaxScale / ratio,
  )
  const feet = {
    x: background.x + background.width * scene.platformX,
    y: Math.min(background.y + background.height * scene.platformY, height - inset.y - (navTop + feetAboveNav) * unit),
  }
  const layerWidth = inner.width / unit
  return {
    unit,
    layer: { x: inset.x, y: inset.y, width: layerWidth, height: inner.height / unit },
    navWidth: Math.min(navMaxWidth, layerWidth),
    background,
    heroScale,
    feet,
  }
}

// The srcset for the background: the browser picks the smallest picture
// that is sharp at the size it is drawn (sizes = that size).
export function backgroundSources(scene: LobbyScene, folder: string, drawnWidth: number) {
  const list = (scene.backgrounds ?? []).filter((entry) => entry.file && entry.width > 0)
  if (list.length === 0) return { src: `${folder}/${scene.background}` }
  const biggest = list.reduce((best, entry) => (entry.width > best.width ? entry : best), list[0])
  return {
    src: `${folder}/${biggest.file}`,
    srcSet: list.map((entry) => `${folder}/${entry.file} ${Math.round(entry.width)}w`).join(', '),
    sizes: `${Math.ceil(drawnWidth)}px`,
  }
}

const fileName = /^[\w.() -]+\.(webp|png|jpe?g|avif)$/i

// A scene.json read from the app's files: anything missing or not a number keeps the default.
export function readScene(value: unknown, fallback: LobbyScene): LobbyScene {
  if (!value || typeof value !== 'object') return fallback
  const raw = value as Record<string, unknown>
  const number = (key: keyof LobbyScene, min: number, max: number) => {
    const entry = raw[key]
    return typeof entry === 'number' && Number.isFinite(entry) && entry >= min && entry <= max ? entry : (fallback[key] as number)
  }
  const newPicture = typeof raw.background === 'string' && fileName.test(raw.background)
  const listed: { file: string; width: number }[] = Array.isArray(raw.backgrounds)
    ? raw.backgrounds.filter(
        (entry) => Boolean(entry) && typeof entry.file === 'string' && fileName.test(entry.file) && typeof entry.width === 'number' && entry.width >= 100 && entry.width <= 20000,
      )
    : []
  return {
    background: newPicture ? (raw.background as string) : fallback.background,
    // Its sizes as listed; a new picture without a list is used as it is.
    backgrounds: listed.length > 0 ? listed : newPicture ? undefined : fallback.backgrounds,
    width: number('width', 100, 20000),
    height: number('height', 100, 20000),
    focusX: number('focusX', 0, 1),
    focusY: number('focusY', 0, 1),
    platformX: number('platformX', 0, 1),
    platformY: number('platformY', 0, 1),
    heroHeight: number('heroHeight', 0.1, 1),
    buttonsMaxScale: number('buttonsMaxScale', 0.5, 10),
    heroMaxScale: number('heroMaxScale', 0.5, 10),
    heroVideo: 'heroVideo' in raw ? readHeroVideo(raw.heroVideo) : fallback.heroVideo,
  }
}

// The game sign-in page: the same background, the hero on the left half, and
// the school's sign-in frame on the right (its picture is frameSize px, one
// picture pixel per frame unit), none of it crowded: the frame at most 74% of
// the window's height and 40% of its width, never past its own pixels.
export const frameSize = { width: 1122, height: 1402 }

export function signInLayout(windowWidth: number, windowHeight: number, scene: LobbyScene, pixelRatio = 1) {
  const width = Math.max(1, windowWidth)
  const height = Math.max(1, windowHeight)
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1
  const cover = Math.max(width / scene.width, height / scene.height)
  const background = {
    width: scene.width * cover,
    height: scene.height * cover,
    x: (width - scene.width * cover) * scene.focusX,
    y: (height - scene.height * cover) * scene.focusY,
  }
  const frameScale = Math.min((height * 0.74) / frameSize.height, (width * 0.4) / frameSize.width, 1 / ratio)
  const frame = {
    scale: frameScale,
    width: frameSize.width * frameScale,
    height: frameSize.height * frameScale,
    x: width - width * 0.07 - frameSize.width * frameScale,
    y: (height - frameSize.height * frameScale) / 2 + height * 0.01,
  }
  const unit = (height / designHeight) * heroSize
  const heroScale = Math.min(unit, scene.heroMaxScale / ratio)
  // The hero's right edge stays clear of the frame.
  const feet = {
    x: Math.min(width * 0.3, frame.x - width * 0.04 - (heroBox.left + heroBox.width) * heroScale),
    y: Math.min(background.y + background.height * scene.platformY, height * 0.93),
  }
  return { unit, background, heroScale, feet, frame, logo: { x: width * 0.05, y: height * 0.05, height: height * 0.075 } }
}
