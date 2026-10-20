import { useEffect, useRef, useState } from 'react'

import { heroVideoBox, playsHeroVideo, type HeroVideo } from '@/lib/heroVideo'

import { backgroundSources, designHeight, designWidth, heroBox, readScene, type LobbyScene } from '@/lib/lobbyLayout'

// The game scenery the lobby and the game sign-in page share (web only; the
// files that use it end in .web.tsx): the school's background covering the
// window, a light vignette, drifting petals, and the hero on the platform
// with its light ring, gold ribbons and rising sparkles. Motion is CSS only
// (transform and opacity), stops out of sight, and is off for reduced motion.

export const sceneryCss = `
.lb-root { position: fixed; inset: 0; z-index: 1; overflow: hidden; background: #140852; font-family: 'Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', sans-serif; color: #fff; -webkit-font-smoothing: antialiased; user-select: none; }
.lb-root img { position: absolute; display: block; pointer-events: none; -webkit-user-drag: none; }
.lb-bg { max-width: none; }
.lb-vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse 75% 70% at 46% 52%, rgba(20, 8, 60, 0) 60%, rgba(20, 8, 60, 0.28) 100%); }
.lb-hero { position: absolute; width: 0; height: 0; transform-origin: 0 0; pointer-events: none; }
.lb-abs { position: absolute; }
.lb-lat { font-family: 'Nunito', 'Segoe UI', sans-serif; }
.lb-btn { position: absolute; padding: 0; margin: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; transition: transform 160ms cubic-bezier(.3, 1.6, .5, 1), filter 160ms; }
.lb-btn:hover { transform: translateY(-2px); filter: brightness(1.08); }
.lb-btn:active { transform: scale(0.95); transition-duration: 80ms; }
.lb-btn:focus-visible { outline: 3px solid #ffe08a; outline-offset: 2px; border-radius: 12px; }
.lb-btn > img { position: static; width: 100%; height: auto; }
.lb-ring { position: absolute; left: -270px; top: -80px; width: 540px; height: 160px; pointer-events: none; }
.lb-ring-glow { position: absolute; inset: 20px 40px; border-radius: 50%; background: radial-gradient(closest-side, rgba(255, 226, 130, 0.55), rgba(252, 12, 151, 0.18) 60%, rgba(252, 12, 151, 0)); animation: lb-pulse 3.6s ease-in-out infinite; }
.lb-ring-flat { position: absolute; left: 0; top: 50%; width: 540px; height: 540px; margin-top: -270px; transform: scaleY(0.24); }
.lb-ring-spin { position: absolute; inset: 0; border-radius: 50%; border: 3px dashed rgba(255, 232, 150, 0.85); box-shadow: 0 0 18px rgba(255, 214, 80, 0.7), inset 0 0 18px rgba(255, 214, 80, 0.5); animation: lb-spin 14s linear infinite; }
.lb-ring-spin::after { content: ''; position: absolute; inset: 46px; border-radius: 50%; border: 2px solid rgba(255, 150, 210, 0.6); border-left-color: transparent; border-right-color: transparent; }
.lb-fx { position: absolute; inset: 0; pointer-events: none; }
.lb-petal { position: absolute; border-radius: 60% 0 60% 0; background: linear-gradient(135deg, #ffd0ea, #fc4fae); animation: lb-drift linear infinite; }
.lb-spark { position: absolute; border-radius: 50%; background: #fff6cf; animation: lb-float linear infinite; }
@keyframes lb-breathe { 0%, 100% { opacity: 0.2; } 50% { opacity: 0.75; } }
@keyframes lb-sweep { 0%, 62% { transform: translateX(-160%) skewX(-22deg); } 100% { transform: translateX(560%) skewX(-22deg); } }
@keyframes lb-spin { to { transform: rotate(360deg); } }
@keyframes lb-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
@keyframes lb-float { from { transform: translateY(0); opacity: 0; } 15% { opacity: 1; } to { transform: translateY(-140px); opacity: 0; } }
@keyframes lb-drift { from { transform: translate(0, 0) rotate(0deg); } to { transform: translate(-160px, 220px) rotate(220deg); } }
@keyframes lb-pop { from { transform: translateX(var(--lb-x, 0)) scale(0.7); opacity: 0; } to { transform: translateX(var(--lb-x, 0)) scale(1); opacity: 1; } }
.lb-paused, .lb-paused * , .lb-paused *::after { animation-play-state: paused !important; }
.lb-still *, .lb-still *::after { animation: none !important; }
`

const fontsHref = 'https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&family=Noto+Sans+SC:wght@700;900&display=swap'

// The design's fonts, loaded once (the system fonts stand in until they come).
export function useLobbyFonts() {
  useEffect(() => {
    if (document.querySelector(`link[href="${fontsHref}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = fontsHref
    document.head.appendChild(link)
  }, [])
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const update = () => setReduced(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

// The window's size, kept up to date however it changes (dragging the
// window, a full-screen key, zoom): a ResizeObserver on the page itself.
export function useWindowSize() {
  const read = () => ({ width: document.documentElement.clientWidth || window.innerWidth, height: document.documentElement.clientHeight || window.innerHeight })
  const [size, setSize] = useState(read)
  useEffect(() => {
    const update = () => setSize((current) => {
      const next = read()
      return next.width === current.width && next.height === current.height ? current : next
    })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(document.documentElement)
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])
  return size
}

export function usePageVisible() {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return visible
}

// Petals drifting and sparkles rising around the hero, from a fixed seed so
// every visit (and every screenshot) looks the same.
const effects = (() => {
  let seed = 11
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const petals = Array.from({ length: 14 }, () => {
    const x = 200 + rand() * 1400
    const y = rand() * 700
    const w = 10 + rand() * 12
    return { x, y, w, opacity: 0.6 + rand() * 0.35, duration: 9 + rand() * 8, delay: rand() * 9 }
  })
  const sparks = Array.from({ length: 24 }, () => {
    const x = 420 + rand() * 820
    const y = 200 + rand() * 620
    const z = 2 + rand() * 4
    return { x, y, z, duration: 4 + rand() * 4, delay: rand() * 4 }
  })
  return { petals, sparks }
})()

// The school's scene.json (background picture and where its platform is),
// read once per picture set; the theme's own values until then, or if missing.
const scenes = new Map<string, LobbyScene>()

export function useScene(folder: string, fallback: LobbyScene) {
  const [scene, setScene] = useState(() => scenes.get(folder) ?? fallback)
  useEffect(() => {
    if (scenes.has(folder)) return
    let cancelled = false
    fetch(`${folder}/scene.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((value: unknown) => {
        const next = readScene(value, fallback)
        scenes.set(folder, next)
        if (!cancelled) setScene(next)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [folder, fallback])
  return scene
}

// Where the scenery goes (lib/lobbyLayout.ts works it out for each page).
export type SceneryLayout = {
  unit: number
  background: { x: number; y: number; width: number; height: number }
  feet: { x: number; y: number }
  heroScale: number
}

// Whether this browser, now, should play the hero's video (else its still picture).
function useHeroVideoAllowed(reduced: boolean) {
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null)
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (type: string, fn: () => void) => void; removeEventListener: (type: string, fn: () => void) => void }> }
    if (!nav.getBattery) return
    let cancelled = false
    let detach = () => {}
    nav.getBattery().then((info) => {
      const update = () => !cancelled && setBattery({ level: info.level, charging: info.charging })
      update()
      info.addEventListener('levelchange', update)
      info.addEventListener('chargingchange', update)
      detach = () => {
        info.removeEventListener('levelchange', update)
        info.removeEventListener('chargingchange', update)
      }
    }, () => undefined)
    return () => {
      cancelled = true
      detach()
    }
  }, [])
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  return playsHeroVideo({
    userAgent: navigator.userAgent,
    reducedMotion: reduced,
    saveData: Boolean(connection?.saveData),
    connection: connection?.effectiveType ?? null,
    battery,
  })
}

// The hero's video, over its still picture until the video plays; it stops
// with the rest of the motion (paused) and falls back to the picture if it fails.
function HeroFilm({ folder, video, paused }: { folder: string; video: HeroVideo; paused: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const box = heroVideoBox(video)
  useEffect(() => {
    const element = ref.current
    if (!element || failed) return
    if (paused) element.pause()
    else element.play().catch(() => setFailed(true))
  }, [paused, failed])
  return (
    <>
      <img src={`${folder}/${video.poster}`} alt="" style={{ ...box, opacity: playing && !failed ? 0 : 1 }} />
      {!failed && (
        <video
          ref={ref}
          className="lb-film"
          src={`${folder}/${video.webm}`}
          muted
          loop
          playsInline
          autoPlay={!paused}
          preload="auto"
          aria-hidden="true"
          onPlaying={() => setPlaying(true)}
          onError={() => setFailed(true)}
          style={{ position: 'absolute', ...box, opacity: playing ? 1 : 0, pointerEvents: 'none' }}
        />
      )}
    </>
  )
}

export function Scenery({ folder, scene, layout, heroSrc, reduced, paused = false }: { folder: string; scene: LobbyScene; layout: SceneryLayout; heroSrc: string; reduced: boolean; paused?: boolean }) {
  const videoAllowed = useHeroVideoAllowed(reduced)
  const video = scene.heroVideo
  const backdrop = backgroundSources(scene, folder, layout.background.width)
  return (
    <>
      {/* The background covers the window; the petals drift over all of it */}
      <img className="lb-bg" {...backdrop} alt="" style={{ left: layout.background.x, top: layout.background.y, width: layout.background.width, height: layout.background.height }} />
      <div className="lb-vignette" aria-hidden="true" />
      {!reduced && (
        <div className="lb-fx" aria-hidden="true">
          {effects.petals.map((petal, index) => (
            <span
              key={`p${index}`}
              className="lb-petal"
              style={{
                left: `${(petal.x / designWidth) * 100}%`,
                top: `${(petal.y / designHeight) * 100}%`,
                width: petal.w * layout.unit,
                height: petal.w * 0.6 * layout.unit,
                opacity: petal.opacity,
                animationDuration: `${petal.duration}s`,
                animationDelay: `-${petal.delay}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* The hero on the platform, with its light ring, gold ribbons and rising sparkles (design units from its feet) */}
      <div className="lb-hero" style={{ left: layout.feet.x, top: layout.feet.y, transform: `scale(${layout.heroScale})` }}>
        <div className="lb-ring" aria-hidden="true">
          <div className="lb-ring-glow" />
          <div className="lb-ring-flat">
            <div className="lb-ring-spin" />
          </div>
        </div>
        <svg className="lb-abs" style={{ left: -400, top: -454 }} width="620" height="500" viewBox="0 0 620 500" aria-hidden="true">
          <defs>
            <filter id="lb-soft">
              <feGaussianBlur stdDeviation="2.4" />
            </filter>
          </defs>
          <path d="M70 330 C 50 200, 220 140, 330 170 S 580 280, 520 370" fill="none" stroke="#ffe08a" strokeWidth="9" strokeLinecap="round" opacity=".75" filter="url(#lb-soft)" />
          <path d="M70 330 C 50 200, 220 140, 330 170 S 580 280, 520 370" fill="none" stroke="#fffbe8" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {video && videoAllowed ? (
          <HeroFilm folder={folder} video={video} paused={paused} />
        ) : video ? (
          <img src={`${folder}/${video.poster}`} alt="" style={heroVideoBox(video)} />
        ) : (
          <img src={heroSrc} alt="" style={{ ...heroBox, filter: 'drop-shadow(0 12px 18px rgba(40, 10, 90, 0.35))' }} />
        )}
        <svg className="lb-abs" style={{ left: -400, top: -454 }} width="620" height="500" viewBox="0 0 620 500" aria-hidden="true">
          <path d="M520 370 C 470 440, 290 460, 160 425" fill="none" stroke="#ffe08a" strokeWidth="9" strokeLinecap="round" opacity=".85" filter="url(#lb-soft)" />
          <path d="M520 370 C 470 440, 290 460, 160 425" fill="none" stroke="#fffbe8" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {!reduced &&
          effects.sparks.map((spark, index) => (
            <span
              key={`s${index}`}
              className="lb-spark"
              style={{ left: spark.x - 740, top: spark.y - 780, width: spark.z, height: spark.z, boxShadow: `0 0 ${6 + spark.z * 2}px rgba(255,214,80,.95)`, animationDuration: `${spark.duration}s`, animationDelay: `-${spark.delay}s` }}
            />
          ))}
      </div>
    </>
  )
}
