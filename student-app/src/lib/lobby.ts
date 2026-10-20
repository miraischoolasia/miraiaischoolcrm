// The game-lobby home's rules, kept apart from the screen so they can be
// tested: which home a school shows, the child's level from points, and what
// the big button says. No React Native imports here (lobby.test.ts runs it in
// plain Node).

import type { Points, UpcomingClass } from './portal'

// The lobby is for a wide screen (a computer); a phone keeps the classic home
// until its own lobby is designed.
export const lobbyMinWidth = 1024

export type HomeStyle = 'classic' | 'lobby'

// The school's switch (student_portal settings: home_style + home_theme), the
// screen width and whether this is the web build decide which home shows.
// A picture set the app does not have keeps the classic home.
export function showsLobby(
  setting: { homeStyle: HomeStyle; homeTheme: string },
  width: number,
  isWeb: boolean,
  knownThemes: readonly string[],
) {
  return setting.homeStyle === 'lobby' && isWeb && width >= lobbyMinWidth && knownThemes.includes(setting.homeTheme)
}

// Lv from the points earned so far: spending coins later never lowers it.
// Lv 1 at 0 points; every `perLevel` points is one more level.
export function levelFrom(earned: number, perLevel: number) {
  const step = Number.isFinite(perLevel) && perLevel > 0 ? Math.round(perLevel) : 50
  const total = Math.max(0, Math.floor(earned))
  return { level: Math.floor(total / step) + 1, into: total % step, step, fraction: (total % step) / step }
}

// Points earned in total (the database sends `earned` once it has it; until
// then the balance is the same thing, as nothing can be spent yet).
export function earnedPoints(points: Points & { earned?: number }) {
  return typeof points.earned === 'number' ? points.earned : Math.max(0, points.total)
}

// Malaysia's date and the minute of its day.
export function malaysiaClock(now: Date) {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  return { date: shifted.toISOString().slice(0, 10), minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() }
}

function minuteOf(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + (minutes || 0)
}

export type StartButton =
  | { kind: 'class'; item: UpcomingClass; minutesToStart: number; live: boolean }
  | { kind: 'learn' }

// The big gold button: a class today that starts within `windowMinutes`, or
// is on now (until it ends), shows "Enter class"; otherwise "Start learning".
// A lesson the teacher has already opened counts from then on, even early.
export function startButton(schedule: UpcomingClass[] | undefined, now: Date, windowMinutes = 30): StartButton {
  const clock = malaysiaClock(now)
  for (const item of schedule ?? []) {
    if (item.date !== clock.date) continue
    const start = minuteOf(item.start)
    const end = item.end ? minuteOf(item.end) : start + 60
    if (clock.minute > end) continue
    const opened = Boolean(item.session_id)
    if (clock.minute >= start - windowMinutes || opened) {
      const minutesToStart = Math.max(0, start - clock.minute)
      return { kind: 'class', item, minutesToStart, live: minutesToStart === 0 }
    }
  }
  return { kind: 'learn' }
}

// How the button opens the class: inside the app (the class page) when the
// teacher has opened it with in-app Zoom, else the lesson's Zoom link, else
// not yet (the teacher has not opened it).
export function classEntry(item: UpcomingClass, isWeb: boolean): { to: 'page'; sessionId: number } | { to: 'zoom'; link: string } | { to: 'wait' } {
  if (isWeb && item.session_id && item.in_app_zoom) return { to: 'page', sessionId: item.session_id }
  if (item.zoom_link) return { to: 'zoom', link: item.zoom_link }
  return { to: 'wait' }
}
