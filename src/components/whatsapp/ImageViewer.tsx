import { useEffect, useState } from 'react'
import { ArrowSquareOut, CaretLeft, CaretRight, MagnifyingGlassMinus, MagnifyingGlassPlus, X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'

export type ViewerImage = { src: string; label: string }

// The photo of a chat on a dark screen, like WhatsApp: arrows (or the keys) go to the other photos of the
// chat, Escape closes, a click on the photo zooms.
export function ImageViewer({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: ViewerImage[]
  index: number
  onIndex: (next: number) => void
  onClose: () => void
}) {
  const [zoomed, setZoomed] = useState(false)
  const current = images[index]
  const hasPrevious = index > 0
  const hasNext = index < images.length - 1

  // A new photo starts at normal size.
  useEffect(() => {
    setZoomed(false)
  }, [index])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      } else if (event.key === 'ArrowLeft' && index > 0) {
        onIndex(index - 1)
      } else if (event.key === 'ArrowRight' && index < images.length - 1) {
        onIndex(index + 1)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [index, images.length, onIndex, onClose])

  if (!current) {
    return null
  }
  const barButton = 'inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'
  return (
    <div role="dialog" aria-modal="true" aria-label="Photo viewer" className="fixed inset-0 z-50 flex flex-col bg-black/90">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <span className="min-w-0 truncate text-sm">
          {current.label}
          <span className="ml-2 text-white/60">
            {index + 1} of {images.length}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setZoomed((value) => !value)} aria-label={zoomed ? 'Zoom out' : 'Zoom in'} title={zoomed ? 'Zoom out' : 'Zoom in'} className={barButton}>
            {zoomed ? <MagnifyingGlassMinus size={20} /> : <MagnifyingGlassPlus size={20} />}
          </button>
          <a href={current.src} target="_blank" rel="noopener noreferrer" aria-label="Open the original in a new tab" title="Open the original" className={barButton}>
            <ArrowSquareOut size={20} />
          </a>
          <button type="button" onClick={onClose} aria-label="Close the photo viewer" title="Close (Esc)" className={barButton}>
            <X size={20} />
          </button>
        </span>
      </div>
      <div
        className={cn('relative flex min-h-0 flex-1 items-center justify-center p-4', zoomed ? 'overflow-auto' : 'overflow-hidden')}
        onClick={(event) => {
          // A click on the dark part, not on the photo, closes.
          if (event.target === event.currentTarget) {
            onClose()
          }
        }}
      >
        <img
          src={current.src}
          alt={current.label}
          onClick={() => setZoomed((value) => !value)}
          className={cn('select-none', zoomed ? 'max-w-none cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in object-contain')}
        />
        {hasPrevious && (
          <button type="button" onClick={() => onIndex(index - 1)} aria-label="Previous photo" className={cn(barButton, 'absolute left-3 top-1/2 -translate-y-1/2')}>
            <CaretLeft size={22} />
          </button>
        )}
        {hasNext && (
          <button type="button" onClick={() => onIndex(index + 1)} aria-label="Next photo" className={cn(barButton, 'absolute right-3 top-1/2 -translate-y-1/2')}>
            <CaretRight size={22} />
          </button>
        )}
      </div>
    </div>
  )
}
