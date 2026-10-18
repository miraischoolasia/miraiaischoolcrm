// Voice for Messenger and Instagram. Meta plays aac, m4a, mp4 and wav, but not the webm/ogg opus that Chrome
// records, so a voice message for those chats is turned into a small WAV (16 kHz, mono) in the browser.

export const WAV_SAMPLE_RATE = 16_000

// A mono WAV file (16-bit) of the samples, which run from -1 to 1.
export function encodeWav(samples: Float32Array, sampleRate = WAV_SAMPLE_RATE): Blob {
  const bytes = samples.length * 2
  const buffer = new ArrayBuffer(44 + bytes)
  const view = new DataView(buffer)
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index))
    }
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + bytes, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // plain PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, bytes, true)
  samples.forEach((sample, index) => {
    const clipped = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + index * 2, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true)
  })
  return new Blob([buffer], { type: 'audio/wav' })
}

// Decodes a recording (any format the browser can play) and writes it as a 16 kHz mono WAV.
export async function recordingToWav(recording: Blob): Promise<Blob> {
  const AudioContextClass =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) {
    throw new Error('No audio support')
  }
  const context = new AudioContextClass()
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer())
    const length = Math.max(1, Math.ceil(decoded.duration * WAV_SAMPLE_RATE))
    // Playing it through an offline context at the new rate mixes it down to one channel and resamples it.
    const offline = new OfflineAudioContext(1, length, WAV_SAMPLE_RATE)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    return encodeWav(rendered.getChannelData(0))
  } finally {
    void context.close()
  }
}

// A voice file for a Messenger or Instagram chat: OGG and MP3 become a WAV they can play; AAC, M4A and WAV
// are kept. If this browser cannot convert it, the original is returned so the message still goes.
export async function audioForMeta(file: File): Promise<File> {
  if (file.type !== 'audio/ogg' && file.type !== 'audio/mpeg') {
    return file
  }
  try {
    const wav = await recordingToWav(file)
    return new File([wav], `${file.name.replace(/\.[A-Za-z0-9]{1,5}$/, '') || 'voice'}.wav`, { type: 'audio/wav' })
  } catch {
    return file
  }
}
