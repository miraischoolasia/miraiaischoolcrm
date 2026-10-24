import { describe, expect, it } from 'vitest'
import { fxPlay, MAX_PANEL, panelItems, togglePanel, type ClassFxItem } from './classFx'

function item(id: number, over: Partial<ClassFxItem> = {}): ClassFxItem {
  return { id, kind: 'sound', name: `Fx ${id}`, url: `/fx/${id}.mp3`, emoji: null, key: null, volume: 0.8, sort: id, hidden: false, ...over }
}

describe('class effects', () => {
  it('shows the default buttons until the teacher picks their own', () => {
    const items = [item(1, { key: 'applause' }), item(2, { key: 'correct' }), item(3, { key: 'anim_confetti', kind: 'animation', url: null }), item(4)]
    expect(panelItems(items, null).map((fx) => fx.id)).toEqual([1, 2, 3])
  })

  it("keeps the teacher's own order and drops hidden effects", () => {
    const items = [item(1), item(2, { hidden: true }), item(3)]
    expect(panelItems(items, [3, 2, 1]).map((fx) => fx.id)).toEqual([3, 1])
  })

  it('falls back to the first effects when the defaults were all hidden', () => {
    const items = [item(1, { key: 'applause', hidden: true }), item(5), item(6)]
    expect(panelItems(items, null).map((fx) => fx.id)).toEqual([5, 6])
  })

  it('adds and takes off buttons, at most eight', () => {
    expect(togglePanel([1, 2], 3)).toEqual([1, 2, 3])
    expect(togglePanel([1, 2, 3], 2)).toEqual([1, 3])
    const full = Array.from({ length: MAX_PANEL }, (_, index) => index + 1)
    expect(togglePanel(full, 99)).toEqual(full)
  })

  it('sends sounds, stickers and animations, but not music (that is ongoing)', () => {
    expect(fxPlay(item(1), 7, 1000)).toEqual({ seq: 7, at: 1000, kind: 'sound', name: 'Fx 1', url: '/fx/1.mp3', emoji: null, key: null, volume: 0.8 })
    expect(fxPlay(item(2, { kind: 'bgm' }), 8, 1000)).toBeNull()
  })
})
