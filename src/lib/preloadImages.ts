// Loads pictures into the browser's cache and resolves once all of them have
// arrived (or failed: a broken picture must not hold a page back), or once
// `timeoutMs` has passed, so a slow connection never leaves someone staring at
// a spinner for good.
export const IMAGE_WAIT_MS = 8000

export function preloadImages(urls: string[], timeoutMs = IMAGE_WAIT_MS): Promise<void> {
  const unique = [...new Set(urls.filter(Boolean))]
  if (unique.length === 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    let remaining = unique.length
    const timer = setTimeout(resolve, timeoutMs)
    const oneDone = () => {
      remaining -= 1
      if (remaining === 0) {
        clearTimeout(timer)
        resolve()
      }
    }

    for (const url of unique) {
      const image = new Image()
      image.onload = oneDone
      image.onerror = oneDone
      image.src = url
    }
  })
}
