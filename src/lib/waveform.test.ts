import { describe, expect, it } from 'vitest'
import { formatDuration, peaksFromSamples, pseudoPeaks, WAVE_BARS } from './waveform'

describe('peaksFromSamples', () => {
  it('makes one bar per slice, loudest at 1, never fully flat', () => {
    const samples = new Float32Array(3600)
    samples.fill(0.05, 0, 1800)
    samples.fill(0.5, 1800)
    const peaks = peaksFromSamples(samples)
    expect(peaks).toHaveLength(WAVE_BARS)
    expect(Math.max(...peaks)).toBe(1)
    expect(peaks[0]).toBeLessThan(0.3)
    expect(Math.min(...peaks)).toBeGreaterThanOrEqual(0.14)
  })

  it('copes with silence and very short sounds', () => {
    expect(peaksFromSamples(new Float32Array(0))).toHaveLength(WAVE_BARS)
    expect(peaksFromSamples(new Float32Array(10))).toHaveLength(WAVE_BARS)
  })
})

describe('pseudoPeaks', () => {
  it('gives the same bars for the same seed', () => {
    expect(pseudoPeaks(42)).toEqual(pseudoPeaks(42))
    expect(pseudoPeaks(42)).not.toEqual(pseudoPeaks(43))
    expect(pseudoPeaks(7, 10)).toHaveLength(10)
  })
})

describe('formatDuration', () => {
  it('shows minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(65.4)).toBe('1:05')
  })
})
