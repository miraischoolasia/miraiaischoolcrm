import { useCallback, useContext, useEffect, useState } from 'react'
import { Plus, X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import {
  StickerSourceContext,
  addLibrarySticker,
  hideLibrarySticker,
  listLibraryStickers,
  listReceivedStickers,
  stickerError,
  stickerFile,
  type LibrarySticker,
  type ReceivedSticker,
} from '../../lib/inboxStickers'

type Tab = 'library' | 'received'

const inLibrary = (sticker: LibrarySticker | ReceivedSticker): sticker is LibrarySticker => 'id' in sticker

// The school's stickers and the ones parents sent lately: one click sends. An admin adds to the library and
// takes stickers out of it.
export function StickerPicker({
  onPick,
  isSending,
  api = { listLibraryStickers, listReceivedStickers, addLibrarySticker, hideLibrarySticker, stickerFile },
}: {
  onPick: (file: File) => void
  isSending: boolean
  // For tests.
  api?: {
    listLibraryStickers: typeof listLibraryStickers
    listReceivedStickers: typeof listReceivedStickers
    addLibrarySticker: typeof addLibrarySticker
    hideLibrarySticker: typeof hideLibrarySticker
    stickerFile: typeof stickerFile
  }
}) {
  const { mediaUrl, canManage } = useContext(StickerSourceContext)
  const [tab, setTab] = useState<Tab>('library')
  const [library, setLibrary] = useState<LibrarySticker[] | null>(null)
  const [received, setReceived] = useState<ReceivedSticker[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadLibrary = useCallback(() => {
    api.listLibraryStickers().then(setLibrary).catch((failure) => {
      setLibrary([])
      setError(stickerError(failure))
    })
  }, [api])

  useEffect(() => {
    loadLibrary()
  }, [loadLibrary])

  useEffect(() => {
    if (tab !== 'received' || received !== null) {
      return
    }
    api.listReceivedStickers().then(setReceived).catch((failure) => {
      setReceived([])
      setError(stickerError(failure))
    })
  }, [tab, received, api])

  async function pick(url: string, name: string | null) {
    setError(null)
    setBusy(true)
    try {
      onPick(await api.stickerFile(url, name))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn't get that sticker.")
    } finally {
      setBusy(false)
    }
  }

  async function add(file: File | undefined) {
    if (!file) {
      return
    }
    setError(null)
    setBusy(true)
    try {
      await api.addLibrarySticker(file)
      loadLibrary()
    } catch (failure) {
      setError(failure instanceof Error && !('code' in failure) ? failure.message : stickerError(failure))
    } finally {
      setBusy(false)
    }
  }

  async function hide(id: number) {
    setError(null)
    try {
      await api.hideLibrarySticker(id)
      setLibrary((current) => current?.filter((sticker) => sticker.id !== id) ?? null)
    } catch (failure) {
      setError(stickerError(failure))
    }
  }

  const shown = tab === 'library' ? library : received
  const disabled = busy || isSending

  return (
    <div className="space-y-2">
      <div role="tablist" aria-label="Stickers" className="flex gap-1.5">
        {(
          [
            ['library', 'School stickers'],
            ['received', 'Received lately'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'rounded-lg border px-2.5 py-1 text-xs font-semibold',
              tab === key ? 'border-[#fbcfe8] bg-[#fff1f8] text-[#be185d]' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {shown === null ? (
        <p className="text-sm text-slate-500">Loading stickers…</p>
      ) : (
        <div className="grid max-h-60 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
          {tab === 'library' && canManage && (
            <label
              className={cn(
                'flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-[11px] text-slate-500 hover:bg-slate-50',
                disabled && 'pointer-events-none opacity-50',
              )}
            >
              <Plus size={18} aria-hidden="true" />
              Add sticker
              <input
                type="file"
                accept="image/png,image/webp,image/jpeg"
                className="sr-only"
                aria-label="Add a sticker to the school's library"
                onChange={(event) => {
                  void add(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </label>
          )}
          {shown.map((sticker) => {
            const url = inLibrary(sticker) ? sticker.url : mediaUrl(sticker.url)
            const key = inLibrary(sticker) ? `l${sticker.id}` : `r${sticker.url}`
            return (
              <span key={key} className="relative">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void pick(url, sticker.name)}
                  aria-label={`Send sticker${sticker.name ? ` ${sticker.name}` : ''}`}
                  className="flex aspect-square w-full items-center justify-center rounded-lg border border-slate-200 bg-white p-1 hover:border-[#fc0c97] disabled:opacity-50"
                >
                  <img src={url} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
                </button>
                {inLibrary(sticker) && canManage && (
                  <button
                    type="button"
                    onClick={() => void hide(sticker.id)}
                    aria-label={`Take ${sticker.name ?? 'this sticker'} out of the library`}
                    className="absolute -right-1 -top-1 rounded-full border border-slate-200 bg-white p-0.5 text-slate-500 shadow-sm min-h-0! hover:text-red-600"
                  >
                    <X size={10} />
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}
      {shown !== null && shown.length === 0 && !error && (
        <p className="text-xs text-slate-500">
          {tab === 'library'
            ? canManage
              ? 'No stickers yet. Add the school’s stickers here; everyone in the team can then send them.'
              : 'No school stickers yet. An admin can add them.'
            : 'No stickers from parents in the last 90 days.'}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
