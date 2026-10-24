// The class screen: a big, plain window the teacher shares in Zoom so the
// children see the timer, who was picked, the top of the board and the
// question now. The console sends it what to show over a BroadcastChannel
// (same browser, same computer); nothing goes through the server.

export type ClassScreenState = {
  title: string
  timer: { endsAt: number | null; pausedLeft: number | null }
  picked: string | null
  top: { name: string; points: number }[]
  question: { number: number; prompt: string; closesAt: string } | null
  // Points the teacher just gave, cheered on the screen for a moment.
  // studentId lets the child who got them skip it (their own pop-up shows instead).
  cheer?: { id: number; studentId?: number; name: string; points: number; reason: string } | null
  // Random pick: names roll on the screen and stop on the child picked (seq is new for each pick).
  roll?: { seq: number; people: ScreenPerson[]; chosenId: number } | null
  // Star of the day: the child on a stage under a spotlight.
  star?: { seq: number; id: number; name: string } | null
  // Teams made in the console, with the points each team got.
  teams?: { key: string; label: string; color: string; text: string; members: ScreenPerson[]; score: number }[] | null
  // A class effect the teacher just played (sound, sticker, light animation); seq is new each time.
  fx?: ClassFxPlay | null
  // Background music playing now, so a child who comes in late hears it too.
  bgm?: { url: string; volume: number; startedAt: number } | null
  sentAt: number
}

// One effect played on the children's class pages. at: when it was played
// (a child joining later does not get it again).
export type ClassFxPlay = {
  seq: number
  at: number
  kind: 'sound' | 'sticker' | 'animation'
  name: string
  url: string | null
  emoji: string | null
  key: string | null
  volume: number
}

// A child as the class screen shows them: their face (from the id) and first name.
export type ScreenPerson = { id: number; name: string }

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name

export const classScreenChannel = (scheduleId: number, lessonDate: string) => `mirai-class-screen-${scheduleId}-${lessonDate}`

export const classScreenUrl = (scheduleId: number, lessonDate: string) => `/?screen=${scheduleId}&date=${lessonDate}`

// Only first names and points: what the class may see.
export function topForScreen(rows: { studentId: number; points: number }[], names: Map<number, string>, howMany: number) {
  return rows
    .filter((row) => row.points > 0)
    .slice(0, Math.max(0, howMany))
    .map((row) => ({ name: (names.get(row.studentId) ?? 'Student').trim().split(/\s+/)[0], points: row.points }))
}

export function readClassScreenState(value: unknown): ClassScreenState | null {
  if (!value || typeof value !== 'object') return null
  const state = value as Partial<ClassScreenState>
  if (typeof state.title !== 'string' || typeof state.sentAt !== 'number' || !state.timer || !Array.isArray(state.top)) return null
  return state as ClassScreenState
}
