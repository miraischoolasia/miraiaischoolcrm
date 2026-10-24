import { useEffect, useRef, useState } from 'react'
import { Eye, EyeSlash, Play, Stop } from '@phosphor-icons/react'
import { fetchClassFx, fxKindLabels, previewSound, updateClassFx, type ClassFxItem, type ClassFxKind } from '../lib/classFx'

// Class settings → Class effects (admin): every effect the teachers can play
// in class, to listen to, rename or hide. The sounds and music that come with
// the system are placeholders; the school's own files come from Galleries later.
export function ClassFxSettings() {
  const [items, setItems] = useState<ClassFxItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<number | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    fetchClassFx()
      .then(setItems)
      .catch((problem: Error) => setError(problem.message))
    return () => stopRef.current?.()
  }, [])

  function listen(item: ClassFxItem) {
    stopRef.current?.()
    stopRef.current = null
    if (playingId === item.id || !item.url) {
      setPlayingId(null)
      return
    }
    const stop = previewSound(item.url, item.volume, item.kind === 'bgm')
    stopRef.current = stop
    setPlayingId(item.id)
    // A sound stops by itself; the button goes back after a few seconds.
    if (item.kind === 'sound') setTimeout(() => setPlayingId((current) => (current === item.id ? null : current)), 3000)
  }

  async function change(item: ClassFxItem, next: { name?: string; hidden?: boolean }) {
    const problem = await updateClassFx(item.id, next)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setItems((list) => list?.map((other) => (other.id === item.id ? { ...other, ...next } : other)) ?? list)
  }

  if (!items) return <p className="text-sm text-slate-500">{error ?? 'Loading…'}</p>

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        What teachers can play in a live class (Effects on the class console): every child&apos;s class page plays it at once. Listen, rename, or hide one the
        school does not want. The sounds and music that come with the system are simple placeholders — swap them for the school&apos;s own once Galleries is on.
      </p>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {(['sound', 'bgm', 'sticker', 'animation'] as ClassFxKind[]).map((kind) => {
        const ofKind = items.filter((item) => item.kind === kind)
        if (ofKind.length === 0) return null
        return (
          <section key={kind}>
            <h4 className="text-sm font-semibold text-slate-900">{fxKindLabels[kind]}</h4>
            <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {ofKind.map((item) => (
                <li key={item.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${item.hidden ? 'opacity-50' : ''}`}>
                  <span className="text-xl" aria-hidden="true">{item.emoji ?? '🔊'}</span>
                  <input
                    aria-label={`Name of ${item.name}`}
                    defaultValue={item.name}
                    maxLength={40}
                    onBlur={(event) => {
                      const name = event.target.value.trim()
                      if (name && name !== item.name) void change(item, { name })
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
                  />
                  {item.url ? (
                    <button
                      type="button"
                      onClick={() => listen(item)}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {playingId === item.id ? <Stop size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                      {playingId === item.id ? 'Stop' : 'Listen'}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">{kind === 'animation' ? 'Drawn on the page' : 'Picture coming'}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => void change(item, { hidden: !item.hidden })}
                    aria-label={item.hidden ? `Show ${item.name} to teachers` : `Hide ${item.name} from teachers`}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {item.hidden ? <Eye size={14} aria-hidden="true" /> : <EyeSlash size={14} aria-hidden="true" />}
                    {item.hidden ? 'Show' : 'Hide'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
