// Runs `tick` every `ms` while the tab is looked at, and at once when it is looked at again, so a tab left
// in the background (a phone in a pocket) asks the database nothing. Returns the function that stops it.
export function everyWhileVisible(tick: () => void, ms: number): () => void {
  const timer = window.setInterval(() => {
    if (!document.hidden) {
      tick()
    }
  }, ms)
  const onVisibility = () => {
    if (!document.hidden) {
      tick()
    }
  }
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
