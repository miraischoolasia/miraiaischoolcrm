import { describe, expect, it } from 'vitest'
import { encodeWav, WAV_SAMPLE_RATE } from './audioWav'

describe('encodeWav', () => {
  it('writes a mono 16-bit WAV with the right header and sound', async () => {
    const blob = encodeWav(new Float32Array([0, 1, -1, 0.5]))
    const view = new DataView(await blob.arrayBuffer())
    const text = (offset: number, length: number) =>
      Array.from({ length }, (_, index) => String.fromCharCode(view.getUint8(offset + index))).join('')

    expect(blob.type).toBe('audio/wav')
    expect(blob.size).toBe(44 + 4 * 2)
    expect(text(0, 4)).toBe('RIFF')
    expect(text(8, 4)).toBe('WAVE')
    expect(text(36, 4)).toBe('data')
    expect(view.getUint32(4, true)).toBe(36 + 8)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(WAV_SAMPLE_RATE)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(8)
    expect([44, 46, 48, 50].map((offset) => view.getInt16(offset, true))).toEqual([0, 32767, -32768, 16383])
  })

  it('keeps sounds that are too loud inside the range', async () => {
    const view = new DataView(await encodeWav(new Float32Array([3, -3])).arrayBuffer())
    expect(view.getInt16(44, true)).toBe(32767)
    expect(view.getInt16(46, true)).toBe(-32768)
  })
})
