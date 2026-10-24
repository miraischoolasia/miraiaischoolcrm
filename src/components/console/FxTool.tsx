import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MusicNotes, SpeakerHigh, SpeakerSlash, Star, Sparkle, Stop } from '@phosphor-icons/react'
import {
  FX_COOLDOWN_MS,
  fetchClassFx,
  fetchFxPanel,
  fxKindLabels,
  MAX_PANEL,
  panelItems,
  previewSound,
  saveFxPanel,
  togglePanel,
  type ClassFxItem,
  type ClassFxKind,
} from '../../lib/classFx'

export type FxBgm = { item: ClassFxItem; volume: number } | null

// Class effects on the live class console: the teacher's own buttons (up to
// 8), every effect of the school under "All effects" (a star puts one on the
// buttons), and the background music with its volume. Pressing a button plays
// it on every child's class page; this computer stays quiet unless "Hear it
// here" is on (the teacher's computer is busy with Zoom).
export function FxTool({ onPlay, bgm, onBgm }: { onPlay: (item: ClassFxItem) => void; bgm: FxBgm; onBgm: (bgm: FxBgm) => void }) {
  const [items, setItems] = useState<ClassFxItem[] | null>(null)
  const [own, setOwn] = useState<number[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [hearHere, setHearHere] = useState(false)
  const lastPress = useRef(new Map<number, number>())
  const stopLocalBgm = useRef<(() => void) | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([fetchClassFx(), fetchFxPanel()])
      .then(([library, panel]) => {
        if (!alive) return
        setItems(library)
        setOwn(panel)
      })
      .catch((problem: Error) => alive && setError(problem.message))
    return () => {
      alive = false
    }
  }, [])

  // The music on this computer follows the class's music while "Hear it here" is on.
  useEffect(() => {
    stopLocalBgm.current?.()
    stopLocalBgm.current = hearHere && bgm?.item.url ? previewSound(bgm.item.url, bgm.volume, true) : null
    return () => {
      stopLocalBgm.current?.()
      stopLocalBgm.current = null
    }
  }, [bgm?.item.url, bgm?.volume, hearHere])

  if (error) return <FxCard><p className="text-sm text-rose-600">{error}</p></FxCard>
  if (!items) return <FxCard><p className="text-sm text-slate-500">Loading…</p></FxCard>

  const panel = panelItems(items, own)
  const panelIds = panel.map((item) => item.id)

  function press(item: ClassFxItem) {
    const now = Date.now()
    if (now - (lastPress.current.get(item.id) ?? 0) < FX_COOLDOWN_MS) return
    lastPress.current.set(item.id, now)
    if (item.kind === 'bgm') {
      onBgm(bgm?.item.id === item.id ? null : { item, volume: item.volume })
      return
    }
    onPlay(item)
    if (hearHere && item.url && item.kind === 'sound') previewSound(item.url, item.volume)
  }

  async function star(item: ClassFxItem) {
    const next = togglePanel(panelIds, item.id)
    if (next === panelIds) {
      setError(`At most ${MAX_PANEL} buttons. Take one off first.`)
      return
    }
    setOwn(next)
    const problem = await saveFxPanel(next)
    if (problem) setError(problem)
  }

  return (
    <FxCard>
      <div className="grid grid-cols-4 gap-1.5">
        {panel.map((item) => (
          <FxButton key={item.id} item={item} playing={bgm?.item.id === item.id} onPress={() => press(item)} />
        ))}
      </div>

      {bgm && (
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-violet-50 px-2.5 py-1.5 text-xs text-violet-900">
          <MusicNotes size={16} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-semibold">{bgm.item.name}</span>
          <label className="flex items-center gap-1">
            <span className="sr-only">Music volume</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(bgm.volume * 100)}
              onChange={(event) => onBgm({ item: bgm.item, volume: Number(event.target.value) / 100 })}
              className="w-24 accent-violet-600"
            />
          </label>
          <button type="button" onClick={() => onBgm(null)} className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 font-semibold hover:bg-violet-100">
            <Stop size={14} aria-hidden="true" />
            Stop
          </button>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2 text-xs">
        <button type="button" onClick={() => setShowAll((open) => !open)} className="font-semibold text-slate-600 underline underline-offset-2">
          {showAll ? 'Close all effects' : 'All effects'}
        </button>
        <label className="ml-auto flex items-center gap-1 text-slate-600">
          <input type="checkbox" checked={hearHere} onChange={(event) => setHearHere(event.target.checked)} />
          {hearHere ? <SpeakerHigh size={14} aria-hidden="true" /> : <SpeakerSlash size={14} aria-hidden="true" />}
          Hear it here
        </label>
      </div>

      {showAll && (
        <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
          {(['sound', 'bgm', 'sticker', 'animation'] as ClassFxKind[]).map((kind) => {
            const ofKind = items.filter((item) => item.kind === kind && !item.hidden)
            if (ofKind.length === 0) return null
            return (
              <div key={kind}>
                <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{fxKindLabels[kind]}</p>
                <ul className="mt-1 space-y-1">
                  {ofKind.map((item) => {
                    const onPanel = panelIds.includes(item.id)
                    return (
                      <li key={item.id} className="flex items-center gap-2 text-sm">
                        <button
                          type="button"
                          aria-pressed={onPanel}
                          aria-label={onPanel ? `Take ${item.name} off the buttons` : `Put ${item.name} on the buttons`}
                          onClick={() => void star(item)}
                          className="rounded p-1 hover:bg-slate-100"
                        >
                          <Star size={16} weight={onPanel ? 'fill' : 'regular'} className={onPanel ? 'text-amber-500' : 'text-slate-400'} aria-hidden="true" />
                        </button>
                        <span aria-hidden="true">{item.emoji}</span>
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        <button type="button" onClick={() => press(item)} className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs font-semibold hover:bg-slate-50">
                          {item.kind === 'bgm' && bgm?.item.id === item.id ? 'Stop' : 'Play'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </FxCard>
  )
}

function FxCard({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Class effects" className="rounded-2xl border border-slate-200 bg-white p-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <Sparkle size={16} className="text-violet-600" aria-hidden="true" />
        Class effects
      </h4>
      {children}
    </section>
  )
}

function FxButton({ item, playing, onPress }: { item: ClassFxItem; playing: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={item.kind === 'bgm' ? playing : undefined}
      title={item.kind === 'bgm' ? (playing ? `Stop ${item.name}` : `Play ${item.name} for the class`) : `Play ${item.name} for the class`}
      className={`flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 text-center text-[11px] leading-tight font-semibold transition active:translate-y-px ${
        playing ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      <span className="text-2xl leading-none" aria-hidden="true">
        {item.kind === 'bgm' && playing ? '⏹️' : item.emoji ?? '🔊'}
      </span>
      <span className="line-clamp-2">{item.name}</span>
    </button>
  )
}
