import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WaveformPlayer } from './WaveformPlayer'

vi.mock('../../lib/waveform', () => ({
  formatDuration: (seconds: number) => `0:${String(Math.round(seconds)).padStart(2, '0')}`,
  loadPeaks: vi.fn().mockResolvedValue({ peaks: [0.5, 0.8, 0.3], duration: 12 }),
  pseudoPeaks: () => [0.4, 0.6, 0.2],
}))

const audioOf = (container: HTMLElement) => container.querySelector('audio') as HTMLAudioElement

describe('WaveformPlayer speed', () => {
  beforeEach(() => window.localStorage.clear())

  it('goes 1x, 1.5x, 2x and round again, and sets the speed on the sound', async () => {
    const { container } = render(<WaveformPlayer src="/voice.ogg" seed={1} />)
    const button = () => screen.getByRole('button', { name: /^Playback speed/ })

    expect(button()).toHaveTextContent('1x')
    await userEvent.click(button())
    expect(button()).toHaveTextContent('1.5x')
    expect(audioOf(container).playbackRate).toBe(1.5)
    await userEvent.click(button())
    expect(button()).toHaveTextContent('2x')
    expect(audioOf(container).playbackRate).toBe(2)
    await userEvent.click(button())
    expect(button()).toHaveTextContent('1x')
    expect(audioOf(container).playbackRate).toBe(1)
  })

  it('keeps the chosen speed for the next voice message', async () => {
    const first = render(<WaveformPlayer src="/a.ogg" seed={1} />)
    await userEvent.click(screen.getByRole('button', { name: /^Playback speed/ }))
    first.unmount()

    const second = render(<WaveformPlayer src="/b.ogg" seed={2} />)
    expect(screen.getByRole('button', { name: /^Playback speed/ })).toHaveTextContent('1.5x')
    expect(audioOf(second.container).playbackRate).toBe(1.5)
  })
})
