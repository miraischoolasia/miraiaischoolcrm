// Run from the CRM folder: npx vitest run --root student-app
import { describe, expect, it } from 'vitest'

import { heroUnitsTall, heroVideoBox, playsHeroVideo, playsSeeThroughWebm, readHeroVideo } from './heroVideo'
import { readScene } from './lobbyLayout'
import { lobbyThemes } from './lobbyThemes'

const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const edge = `${chrome} Edg/130.0.0.0`
const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const iphoneChrome = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1'
const video = { webm: 'hero-loop.webm', poster: 'hero-loop-poster.webp', width: 500, height: 700, feetX: 250, feetY: 680, heroPixels: 662 }

describe('the hero video', () => {
  it('plays the see-through WebM in Chrome and Edge, not in Safari or iPhone browsers', () => {
    expect(playsSeeThroughWebm(chrome)).toBe(true)
    expect(playsSeeThroughWebm(edge)).toBe(true)
    expect(playsSeeThroughWebm(safari)).toBe(false)
    expect(playsSeeThroughWebm(iphoneChrome)).toBe(false)
  })

  it('shows the still picture for reduced motion, a data saver, a slow connection or a low battery', () => {
    const base = { userAgent: chrome, reducedMotion: false, saveData: false, connection: '4g', battery: { level: 0.9, charging: false } }
    expect(playsHeroVideo(base)).toBe(true)
    expect(playsHeroVideo({ ...base, reducedMotion: true })).toBe(false)
    expect(playsHeroVideo({ ...base, saveData: true })).toBe(false)
    expect(playsHeroVideo({ ...base, connection: '3g' })).toBe(false)
    expect(playsHeroVideo({ ...base, battery: { level: 0.15, charging: false } })).toBe(false)
    expect(playsHeroVideo({ ...base, battery: { level: 0.15, charging: true } })).toBe(true)
    expect(playsHeroVideo({ ...base, connection: null, battery: null })).toBe(true)
  })

  it('puts the video so its hero is as tall as the still hero, feet on the same spot', () => {
    const box = heroVideoBox({ ...video, heroPixels: heroUnitsTall / 2 })
    expect(box).toEqual({ left: -500, top: -1360, width: 1000, height: 1400 })
  })

  it('reads the video from scene.json, and leaves it out when anything is missing or wrong', () => {
    expect(readHeroVideo(video)).toEqual(video)
    expect(readHeroVideo({ ...video, webm: 'hero.mp4' })).toBeUndefined()
    expect(readHeroVideo({ ...video, poster: '../x.webp' })).toBeUndefined()
    expect(readHeroVideo({ ...video, heroPixels: 0 })).toBeUndefined()
    const scene = lobbyThemes.eduhero.scene
    expect(readScene({ heroVideo: video }, scene).heroVideo).toEqual(video)
    expect(readScene({ heroVideo: null }, scene).heroVideo).toBeUndefined()
    expect(readScene({}, scene).heroVideo).toEqual(scene.heroVideo)
  })
})
