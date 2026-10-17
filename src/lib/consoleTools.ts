// Small tools of the live class console: the countdown timer and the random
// name picker. Pure, so they are easy to test.

export function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = String(seconds % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

// Picks one child who has not been picked yet this round; when everyone has
// been picked, a new round starts (and the last one picked is not picked
// again straight away when there is anyone else).
export function pickNext(
  candidates: number[],
  picked: number[],
  random: () => number = Math.random,
): { studentId: number | null; picked: number[] } {
  if (candidates.length === 0) return { studentId: null, picked }
  let left = candidates.filter((id) => !picked.includes(id))
  let round = picked
  if (left.length === 0) {
    const last = picked[picked.length - 1]
    left = candidates.length > 1 ? candidates.filter((id) => id !== last) : candidates
    round = []
  }
  const studentId = left[Math.min(left.length - 1, Math.floor(random() * left.length))]
  return { studentId, picked: [...round, studentId] }
}
