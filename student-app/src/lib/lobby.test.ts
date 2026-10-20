// Run from the CRM folder: npx vitest run --root student-app
import { describe, expect, it } from 'vitest'

import { canClaim, dailyToDo, type Daily, type DailyTask } from './dailyRules'
import { classEntry, earnedPoints, levelFrom, lobbyMinWidth, malaysiaClock, showsLobby, startButton } from './lobby'
import { backgroundSources, designHeight, heroBox, lobbyLayout, margin, minLayerWidth, readScene, signInLayout } from './lobbyLayout'
import { lobbyThemeKeys, lobbyThemes } from './lobbyThemes'
import type { UpcomingClass } from './portal'

// 2026-10-20 15:00 in Malaysia (07:00 UTC).
const now = new Date('2026-10-20T07:00:00Z')

function lesson(extra: Partial<UpcomingClass> = {}): UpcomingClass {
  return {
    date: '2026-10-20',
    start: '15:25',
    end: '16:25',
    title: 'Bahasa Melayu',
    class: 'Y5 BM',
    teacher: 'Cikgu Farah',
    zoom_link: null,
    session_id: null,
    in_app_zoom: false,
    ...extra,
  }
}

describe('the big button', () => {
  it('says Enter class with the minutes when a class starts within 30 minutes', () => {
    const state = startButton([lesson()], now)
    expect(state).toMatchObject({ kind: 'class', minutesToStart: 25, live: false })
    if (state.kind === 'class') expect(state.item.teacher).toBe('Cikgu Farah')
  })

  it('says the class is on between its start and end', () => {
    expect(startButton([lesson({ start: '14:30', end: '15:30', session_id: 9, in_app_zoom: true })], now)).toMatchObject({
      kind: 'class',
      minutesToStart: 0,
      live: true,
    })
  })

  it('says Start learning when there is no class, the class is later, already over, or on another day', () => {
    expect(startButton([], now)).toEqual({ kind: 'learn' })
    expect(startButton(undefined, now)).toEqual({ kind: 'learn' })
    expect(startButton([lesson({ start: '17:00', end: '18:00' })], now)).toEqual({ kind: 'learn' })
    expect(startButton([lesson({ start: '13:00', end: '14:00' })], now)).toEqual({ kind: 'learn' })
    expect(startButton([lesson({ date: '2026-10-21' })], now)).toEqual({ kind: 'learn' })
  })

  it('counts a lesson the teacher opened early', () => {
    expect(startButton([lesson({ start: '16:00', end: '17:00', session_id: 4 })], now)).toMatchObject({ kind: 'class', minutesToStart: 60 })
  })

  it('skips a finished class for the next one today', () => {
    const state = startButton([lesson({ start: '13:00', end: '14:00', title: 'Early' }), lesson({ title: 'Later' })], now)
    expect(state.kind === 'class' && state.item.title).toBe('Later')
  })

  it('opens the class page in the app, else Zoom, else waits for the teacher', () => {
    expect(classEntry(lesson({ session_id: 7, in_app_zoom: true }), true)).toEqual({ to: 'page', sessionId: 7 })
    expect(classEntry(lesson({ session_id: 7, in_app_zoom: true, zoom_link: 'https://zoom.us/j/1' }), false)).toEqual({ to: 'zoom', link: 'https://zoom.us/j/1' })
    expect(classEntry(lesson({ zoom_link: 'https://zoom.us/j/1' }), true)).toEqual({ to: 'zoom', link: 'https://zoom.us/j/1' })
    expect(classEntry(lesson(), true)).toEqual({ to: 'wait' })
  })

  it('uses Malaysia time', () => {
    expect(malaysiaClock(new Date('2026-10-19T17:30:00Z'))).toEqual({ date: '2026-10-20', minute: 90 })
  })
})

describe('the school switch (white-label)', () => {
  const on = { homeStyle: 'lobby' as const, homeTheme: 'eduhero' }

  it('shows the lobby only when the school turned it on, on the web, on a wide screen, with a known picture set', () => {
    expect(showsLobby(on, 1280, true, lobbyThemeKeys)).toBe(true)
    expect(showsLobby(on, lobbyMinWidth, true, lobbyThemeKeys)).toBe(true)
    expect(showsLobby({ homeStyle: 'classic', homeTheme: 'eduhero' }, 1280, true, lobbyThemeKeys)).toBe(false)
    expect(showsLobby(on, 390, true, lobbyThemeKeys)).toBe(false)
    expect(showsLobby(on, 1023, true, lobbyThemeKeys)).toBe(false)
    expect(showsLobby(on, 1280, false, lobbyThemeKeys)).toBe(false)
    expect(showsLobby({ homeStyle: 'lobby', homeTheme: 'mirai' }, 1280, true, lobbyThemeKeys)).toBe(false)
    expect(showsLobby({ homeStyle: 'lobby', homeTheme: '' }, 1280, true, lobbyThemeKeys)).toBe(false)
  })

  it('keeps every picture set in its own folder under public/lobby', () => {
    for (const key of lobbyThemeKeys) expect(lobbyThemes[key].folder).toBe(`/lobby/${key}`)
  })
})

describe('Lv from points', () => {
  it('is Lv 1 at no points and one level for every 50 by default', () => {
    expect(levelFrom(0, 50)).toMatchObject({ level: 1, fraction: 0 })
    expect(levelFrom(10, 50)).toMatchObject({ level: 1, into: 10, fraction: 0.2 })
    expect(levelFrom(640, 50)).toMatchObject({ level: 13, into: 40, fraction: 0.8 })
  })

  it('follows the school’s points per level and ignores bad numbers', () => {
    expect(levelFrom(640, 100)).toMatchObject({ level: 7, into: 40 })
    expect(levelFrom(640, 0)).toMatchObject({ level: 13, step: 50 })
    expect(levelFrom(-20, 50)).toMatchObject({ level: 1, into: 0 })
  })

  it('counts earned points, or the balance until the database sends them', () => {
    const points = { total: 120, level: null, next_level: null, level_start: 0, recent: [] }
    expect(earnedPoints(points)).toBe(120)
    expect(earnedPoints({ ...points, earned: 300 })).toBe(300)
    expect(earnedPoints({ ...points, total: -5 })).toBe(0)
  })
})

describe('full-window layout', () => {
  const scene = lobbyThemes.eduhero.scene
  const screens: [number, number][] = [
    [1024, 768],
    [1366, 768],
    [1672, 941],
    [1920, 1080],
    [2560, 1080],
    [2560, 1440],
    [3440, 1440],
  ]

  it('covers the whole window with the background (no empty or blurred edges)', () => {
    for (const [width, height] of screens) {
      const { background } = lobbyLayout(width, height, scene)
      expect(background.x).toBeLessThanOrEqual(0.001)
      expect(background.y).toBeLessThanOrEqual(0.001)
      expect(background.x + background.width).toBeGreaterThanOrEqual(width - 0.001)
      expect(background.y + background.height).toBeGreaterThanOrEqual(height - 0.001)
    }
  })

  it('keeps the buttons in from the edges, about 75-80% of the design size, the same size on 16:9 and ultra-wide', () => {
    for (const [width, height] of screens) {
      const { layer, unit } = lobbyLayout(width, height, scene)
      expect(layer.x).toBeCloseTo(width * margin.x)
      expect(layer.y).toBeCloseTo(height * margin.y)
      expect(layer.width).toBeGreaterThanOrEqual(minLayerWidth)
      expect(layer.x + layer.width * unit).toBeCloseTo(width - width * margin.x)
    }
    const full = lobbyLayout(1920, 1080, scene).unit / (1080 / designHeight)
    expect(full).toBeGreaterThanOrEqual(0.75)
    expect(full).toBeLessThanOrEqual(0.8)
    expect(lobbyLayout(1920, 1080, scene).unit).toBeCloseTo(lobbyLayout(2560, 1080, scene).unit)
  })

  it('never draws a button or the hero bigger than its own pixels', () => {
    for (const ratio of [1, 1.5, 2, 3]) {
      for (const [width, height] of screens) {
        const { unit, heroScale } = lobbyLayout(width, height, scene, ratio)
        expect(unit * ratio).toBeLessThanOrEqual(scene.buttonsMaxScale + 1e-9)
        expect(heroScale * ratio).toBeLessThanOrEqual(scene.heroMaxScale + 1e-9)
      }
    }
  })

  it('puts the hero on the platform, whole, smaller than the design and above the bottom bar', () => {
    const design = lobbyLayout(1672, 941, scene)
    expect(design.feet.x).toBeCloseTo(740, 0)
    expect(design.feet.y).toBeCloseTo(780, 0)
    for (const [width, height] of screens) {
      const { feet, heroScale, unit, layer } = lobbyLayout(width, height, scene)
      expect(heroScale).toBeLessThanOrEqual((height / designHeight) * 0.82 + 1e-9)
      expect(feet.y + heroBox.top * heroScale).toBeGreaterThanOrEqual(0)
      expect(feet.y).toBeLessThanOrEqual(height - layer.y - 115 * unit)
      expect(feet.x).toBeGreaterThan(width * 0.3)
      expect(feet.x).toBeLessThan(width * 0.6)
    }
  })

  it('gives the browser the background at several sizes to pick the sharp one', () => {
    const sources = backgroundSources(scene, '/lobby/eduhero', 1920)
    expect(sources.srcSet).toBe('/lobby/eduhero/bg-lobby-1672.webp 1672w, /lobby/eduhero/bg-lobby-2560.webp 2560w, /lobby/eduhero/bg-lobby-3344.webp 3344w')
    expect(sources.sizes).toBe('1920px')
    expect(sources.src).toBe('/lobby/eduhero/bg-lobby-3344.webp')
    expect(backgroundSources({ ...scene, backgrounds: undefined, background: 'bg.webp' }, '/x', 100)).toEqual({ src: '/x/bg.webp' })
  })

  it('reads a school scene.json, keeping the defaults for anything missing or wrong', () => {
    expect(readScene({ background: 'bg-wide.webp', width: 3344, height: 1433, platformX: 0.4 }, scene)).toMatchObject({ background: 'bg-wide.webp', width: 3344, height: 1433, platformX: 0.4, focusY: scene.focusY, backgrounds: undefined })
    expect(readScene({ background: '../x.js', width: -1, focusX: 3 }, scene)).toEqual(scene)
    expect(readScene(null, scene)).toEqual(scene)
  })
})

describe('game sign-in layout', () => {
  const scene = lobbyThemes.eduhero.scene
  const screens: [number, number][] = [
    [1024, 768],
    [1366, 768],
    [1920, 1080],
    [2560, 1080],
    [2560, 1440],
  ]

  it('keeps the frame on the right, inside the window, not too big, never past its own pixels', () => {
    for (const ratio of [1, 2]) {
      for (const [width, height] of screens) {
        const { frame } = signInLayout(width, height, scene, ratio)
        expect(frame.x).toBeGreaterThan(width / 2)
        expect(frame.x + frame.width).toBeLessThanOrEqual(width)
        expect(frame.y).toBeGreaterThanOrEqual(0)
        expect(frame.y + frame.height).toBeLessThanOrEqual(height)
        expect(frame.height).toBeLessThanOrEqual(height * 0.74 + 1e-9)
        expect(frame.width).toBeLessThanOrEqual(width * 0.4 + 1e-9)
        expect(frame.scale * ratio).toBeLessThanOrEqual(1 + 1e-9)
      }
    }
  })

  it('puts the hero on the left, clear of the frame, whole', () => {
    for (const [width, height] of screens) {
      const { frame, feet, heroScale, background } = signInLayout(width, height, scene)
      expect(feet.x + (heroBox.left + heroBox.width) * heroScale).toBeLessThan(frame.x)
      expect(feet.x + heroBox.left * heroScale).toBeGreaterThanOrEqual(0)
      expect(feet.y + heroBox.top * heroScale).toBeGreaterThanOrEqual(0)
      expect(background.x + background.width).toBeGreaterThanOrEqual(width - 0.001)
      expect(background.y + background.height).toBeGreaterThanOrEqual(height - 0.001)
    }
  })
})

describe('daily check-in and tasks', () => {
  const task = (extra: Partial<DailyTask> = {}): DailyTask => ({ id: 1, label: 'Watch a video', kind: 'video', target: 1, coins: 3, progress: 0, claimed: false, ...extra })
  const daily = (extra: Partial<Daily> = {}): Daily => ({
    day: '2026-10-20',
    checkin: { enabled: true, coins: 2, done: false, streak: 0 },
    tasks: [],
    practice: { enabled: true, per_day: 5, coins: 1, done_today: 0, right_today: 0, has_questions: true },
    ...extra,
  })

  it('lets a task be claimed only when done and not claimed yet', () => {
    expect(canClaim(task())).toBe(false)
    expect(canClaim(task({ progress: 1 }))).toBe(true)
    expect(canClaim(task({ progress: 3, target: 3, claimed: true }))).toBe(false)
  })

  it('counts what is left to do today', () => {
    expect(dailyToDo(null)).toBe(0)
    expect(dailyToDo(daily())).toBe(2)
    expect(dailyToDo(daily({ checkin: { enabled: true, coins: 2, done: true, streak: 1 }, tasks: [task({ progress: 1 })] }))).toBe(2)
    expect(
      dailyToDo(
        daily({
          checkin: { enabled: false, coins: 2, done: false, streak: 0 },
          practice: { enabled: true, per_day: 5, coins: 1, done_today: 5, right_today: 3, has_questions: true },
        }),
      ),
    ).toBe(0)
  })
})
