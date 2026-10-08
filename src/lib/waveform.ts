// Turns a voice message into a row of bars, like WhatsApp does.

export const WAVE_BARS = 36
const MIN_BAR = 0.14

export function peaksFromSamples(samples: Float32Array, bars = WAVE_BARS): number[] {
  const size = Math.max(1, Math.floor(samples.length / bars))
  const step = Math.max(1, Math.floor(size / 40))
  const raw: number[] = []
  for (let bar = 0; bar < bars; bar += 1) {
    const start = bar * size
    const end = Math.min(samples.length, start + size)
    let sum = 0
    let count = 0
    for (let index = start; index < end; index += step) {
      sum += Math.abs(samples[index])
      count += 1
    }
    raw.push(count > 0 ? sum / count : 0)
  }
  const loudest = Math.max(...raw, 0.0001)
  return raw.map((value) => Math.max(MIN_BAR, value / loudest))
}

// A steady, repeatable pattern for when the real sound can't be read.
export function pseudoPeaks(seed: number, bars = WAVE_BARS): number[] {
  let state = (seed * 9301 + 49297) % 233280
  return Array.from({ length: bars }, () => {
    state = (state * 9301 + 49297) % 233280
    return MIN_BAR + (state / 233280) * (0.9 - MIN_BAR)
  })
}

export async function loadPeaks(src: string, bars = WAVE_BARS) {
  const AudioContextClass =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) {
    throw new Error('No audio support')
  }
  const response = await fetch(src)
  if (!response.ok) {
    throw new Error('Could not read the voice message')
  }
  const context = new AudioContextClass()
  try {
    const decoded = await context.decodeAudioData(await response.arrayBuffer())
    return { peaks: peaksFromSamples(decoded.getChannelData(0), bars), duration: decoded.duration }
  } finally {
    void context.close()
  }
}

export function formatDuration(seconds: number) {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
