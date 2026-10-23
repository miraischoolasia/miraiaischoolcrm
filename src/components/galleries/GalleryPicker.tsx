import { useEffect, useMemo, useState } from 'react'
import { CaretRight, Folder, MagnifyingGlass, X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { ModalShell } from '../ModalShell'
import {
  childFolders,
  fetchGallery,
  filesIn,
  folderTrail,
  formatBytes,
  galleryError,
  searchFiles,
  usableProblem,
  type GalleryData,
  type GalleryFile,
  type GalleryUse,
} from '../../lib/galleries'
import { Thumb } from './GalleriesSection'

const EMPTY: GalleryData = { folders: [], files: [] }

// "From Galleries": pick one of the school's shared files for the Inbox, an Automation message or a quick reply.
// Files that cannot be used there (too big for WhatsApp, not a picture for Automation) are shown greyed with why.
export function GalleryPicker({
  use,
  onPick,
  onClose,
  load = fetchGallery,
}: {
  use: GalleryUse
  onPick: (file: GalleryFile) => void | Promise<void>
  onClose: () => void
  load?: typeof fetchGallery
}) {
  const [data, setData] = useState<GalleryData | null>(null)
  const [folderId, setFolderId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    load()
      .then((gallery) => alive && setData(gallery))
      .catch((failure) => {
        if (alive) {
          setData({ folders: [], files: [] })
          setError(galleryError(failure, "Couldn't open Galleries."))
        }
      })
    return () => {
      alive = false
    }
  }, [load])

  const gallery = data ?? EMPTY
  const folders = useMemo(() => (search.trim() ? [] : childFolders(gallery, folderId)), [gallery, folderId, search])
  const files = useMemo(() => (search.trim() ? searchFiles(gallery, search) : filesIn(gallery, folderId)), [gallery, folderId, search])
  const trail = folderTrail(gallery, folderId)

  async function pick(file: GalleryFile) {
    setBusy(true)
    setError(null)
    try {
      await onPick(file)
    } catch (failure) {
      setError(galleryError(failure, `Couldn't use ${file.name}.`))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell onClose={onClose} layer="overlay">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">From Galleries</h2>
          <p className="text-sm text-slate-500">
            {use === 'automation' ? 'Pick a picture for this message.' : 'Pick a file.'}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
          <X size={14} />
        </button>
      </div>
      <div data-modal-body className="max-h-[65vh] space-y-3 overflow-y-auto px-6 py-4">
        <label className="relative block">
          <span className="sr-only">Search Galleries</span>
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search every folder"
            aria-label="Search Galleries"
            className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none"
          />
        </label>
        {!search.trim() && (
          <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-sm">
            <button type="button" onClick={() => setFolderId(null)} className="font-semibold text-slate-700 hover:underline">Galleries</button>
            {trail.map((folder) => (
              <span key={folder.id} className="flex items-center gap-1">
                <CaretRight size={12} className="text-slate-400" aria-hidden="true" />
                <button type="button" onClick={() => setFolderId(folder.id)} className="text-slate-700 hover:underline">{folder.name}</button>
              </span>
            ))}
          </nav>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}
        {data === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : folders.length === 0 && files.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            {search.trim() ? 'No file has that name.' : 'Nothing here. Files are added on the Galleries page.'}
          </p>
        ) : (
          <ul aria-label="Gallery files" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {folders.map((folder) => (
              <li key={`folder-${folder.id}`}>
                <button
                  type="button"
                  onClick={() => setFolderId(folder.id)}
                  className="flex w-full items-center gap-2 rounded-xl border border-slate-200 p-3 text-left text-sm hover:bg-slate-50"
                >
                  <Folder size={24} weight="duotone" className="text-amber-500" aria-hidden="true" />
                  <span className="truncate font-medium text-slate-800">{folder.name}</span>
                </button>
              </li>
            ))}
            {files.map((file) => {
              const problem = usableProblem(file, use)
              return (
                <li key={`file-${file.id}`}>
                  <button
                    type="button"
                    disabled={Boolean(problem) || busy}
                    onClick={() => void pick(file)}
                    aria-label={`Use ${file.name}`}
                    title={problem ?? undefined}
                    className={cn(
                      'w-full rounded-xl border p-2 text-left text-sm',
                      problem ? 'cursor-not-allowed border-slate-100 opacity-50' : 'border-slate-200 hover:bg-slate-50',
                    )}
                  >
                    <Thumb file={file} />
                    <span className="mt-1 block truncate font-medium text-slate-800">{file.name}</span>
                    <span className="block text-xs text-slate-500">{problem ?? formatBytes(file.sizeBytes)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </ModalShell>
  )
}
