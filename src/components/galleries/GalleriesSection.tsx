import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowCounterClockwise,
  ArrowsOutCardinal,
  CaretRight,
  Copy,
  File as FileIcon,
  FilmStrip,
  Folder,
  FolderPlus,
  Gear,
  MagnifyingGlass,
  MusicNote,
  PencilSimple,
  Trash,
  UploadSimple,
  Warning,
  X,
} from '@phosphor-icons/react'
import { brand } from '../../lib/brand'
import { cn } from '../../lib/cn'
import { useConfirm } from '../../hooks/useConfirm'
import { ModalShell } from '../ModalShell'
import {
  addFolder,
  binItems,
  binSubtree,
  childFolders,
  deleteForever,
  fetchGallery,
  fetchUsage,
  filesIn,
  folderChoices,
  folderTrail,
  formatBytes,
  galleryError,
  moveItems,
  publicUrl,
  renameItem,
  restoreItems,
  saveLimits,
  searchFiles,
  trashItems,
  uploadProblem,
  uploadToGallery,
  usageLevel,
  type GalleryData,
  type GalleryFile,
  type GalleryFolder,
  type GalleryUsage,
} from '../../lib/galleries'

export type GalleriesApi = {
  fetchGallery: typeof fetchGallery
  fetchUsage: typeof fetchUsage
  uploadToGallery: typeof uploadToGallery
  addFolder: typeof addFolder
  renameItem: typeof renameItem
  moveItems: typeof moveItems
  trashItems: typeof trashItems
  restoreItems: typeof restoreItems
  deleteForever: typeof deleteForever
  saveLimits: typeof saveLimits
}

const defaultApi: GalleriesApi = {
  fetchGallery,
  fetchUsage,
  uploadToGallery,
  addFolder,
  renameItem,
  moveItems,
  trashItems,
  restoreItems,
  deleteForever,
  saveLimits,
}

const EMPTY: GalleryData = { folders: [], files: [] }

type Item = { kind: 'file'; file: GalleryFile } | { kind: 'folder'; folder: GalleryFolder }

// Media > Galleries: the school's shared files. Folders on the left, the folder's files on the right; upload by the
// button or by dropping files; rename, move, copy the link, delete (to the Bin, where it can be restored).
export function GalleriesSection({
  canEdit,
  canDelete,
  api = defaultApi,
}: {
  canEdit: boolean
  canDelete: boolean
  api?: GalleriesApi
}) {
  const [data, setData] = useState<GalleryData | null>(null)
  const [usage, setUsage] = useState<GalleryUsage | null>(null)
  const [folderId, setFolderId] = useState<number | null>(null)
  const [view, setView] = useState<'files' | 'bin'>('files')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [uploads, setUploads] = useState<{ name: string; problem: string | null; done: boolean }[]>([])
  const [renaming, setRenaming] = useState<Item | null>(null)
  const [moving, setMoving] = useState<Item | null>(null)
  const [previewing, setPreviewing] = useState<GalleryFile | null>(null)
  const [limitsOpen, setLimitsOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const { confirm, dialog } = useConfirm()

  const reload = useCallback(async () => {
    try {
      const [gallery, space] = await Promise.all([api.fetchGallery(), api.fetchUsage()])
      setData(gallery)
      setUsage(space)
      setError(null)
    } catch (failure) {
      setData(EMPTY)
      setError(galleryError(failure, "Couldn't load Galleries."))
    }
  }, [api])

  useEffect(() => {
    void reload()
  }, [reload])

  const gallery = data ?? EMPTY
  const folders = useMemo(() => childFolders(gallery, folderId), [gallery, folderId])
  const files = useMemo(() => (search.trim() ? searchFiles(gallery, search) : filesIn(gallery, folderId)), [gallery, folderId, search])
  const trail = useMemo(() => folderTrail(gallery, folderId), [gallery, folderId])
  const bin = useMemo(() => binItems(gallery), [gallery])

  async function run(action: () => Promise<unknown>, done?: string) {
    setError(null)
    try {
      await action()
      setNotice(done ?? null)
      await reload()
    } catch (failure) {
      setError(galleryError(failure))
    }
  }

  async function upload(list: FileList | File[] | null) {
    const chosen = Array.from(list ?? [])
    if (chosen.length === 0 || !canEdit) {
      return
    }
    setNotice(null)
    setUploads(chosen.map((file) => ({ name: file.name, problem: null, done: false })))
    // The space left is counted as the files go in, so the second of two big files is refused before it uploads.
    let space = usage
    for (const [index, file] of chosen.entries()) {
      const problem = uploadProblem(file, space)
      try {
        if (problem) {
          throw new Error(problem)
        }
        await api.uploadToGallery(file, folderId, space)
        space = space ? { ...space, usedBytes: space.usedBytes + file.size } : space
        setUploads((current) => current.map((entry, at) => (at === index ? { ...entry, done: true } : entry)))
      } catch (failure) {
        const text = galleryError(failure, `Couldn't upload ${file.name}.`)
        setUploads((current) => current.map((entry, at) => (at === index ? { ...entry, problem: text, done: true } : entry)))
      }
    }
    await reload()
  }

  async function remove(item: Item) {
    const what = item.kind === 'file' ? `“${item.file.name}”` : `the folder “${item.folder.name}” and everything in it`
    if (!(await confirm(`Move ${what} to the Bin? You can restore it from the Bin.`, { confirmLabel: 'Move to Bin' }))) {
      return
    }
    await run(
      () => api.trashItems(item.kind === 'file' ? [item.file.id] : [], item.kind === 'folder' ? [item.folder.id] : []),
      'Moved to the Bin.',
    )
  }

  async function forget(item: Item) {
    const what = item.kind === 'file' ? `“${item.file.name}”` : `the folder “${item.folder.name}” and everything in it`
    if (!(await confirm(`Delete ${what} forever? It cannot be brought back, and messages that link to it will show nothing.`, { confirmLabel: 'Delete forever' }))) {
      return
    }
    if (item.kind === 'file') {
      await run(() => api.deleteForever([item.file], []), 'Deleted forever.')
    } else {
      const subtree = binSubtree(gallery, item.folder.id)
      await run(() => api.deleteForever(subtree.files, subtree.folderIds), 'Deleted forever.')
    }
  }

  async function emptyBin() {
    if (!(await confirm('Empty the Bin? Everything in it is deleted forever.', { confirmLabel: 'Empty the Bin' }))) {
      return
    }
    await run(() => api.deleteForever(bin.allFiles, bin.allFolders.map((folder) => folder.id)), 'The Bin is empty.')
  }

  async function newFolder() {
    const name = window.prompt('Folder name')
    if (name && name.trim()) {
      await run(() => api.addFolder(name.trim(), folderId), `Folder “${name.trim()}” made.`)
    }
  }

  async function copyLink(file: GalleryFile) {
    try {
      await navigator.clipboard.writeText(publicUrl(file.path))
      setNotice(`Link to “${file.name}” copied.`)
    } catch {
      setError("Couldn't copy the link.")
    }
  }

  const level = usage ? usageLevel(usage) : 'ok'

  return (
    <section
      className="space-y-4"
      onDragOver={(event) => {
        if (canEdit && view === 'files') {
          event.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        if (view === 'files') {
          void upload(event.dataTransfer.files)
        }
      }}
    >
      <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        <Warning size={16} aria-hidden="true" />
        Don&apos;t upload ID cards, report cards or other private papers. 不要上传身份证、成绩单等敏感文件。
      </p>

      {usage && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-slate-800">
              {formatBytes(usage.usedBytes)} of {usage.quotaMb >= 1024 ? `${(usage.quotaMb / 1024).toFixed(1)} GB` : `${usage.quotaMb} MB`} used
              {usage.binBytes > 0 && <span className="text-slate-500"> · {formatBytes(usage.binBytes)} in the Bin</span>}
            </span>
            <span className="text-xs text-slate-500">Largest file: {usage.maxFileMb} MB</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Space used"
            aria-valuenow={Math.round((usage.usedBytes / (usage.quotaMb * 1_048_576)) * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div
              className={cn('h-full rounded-full', level === 'full' ? 'bg-red-500' : level === 'warn' ? 'bg-amber-500' : '')}
              style={{
                width: `${Math.min(100, (usage.usedBytes / (usage.quotaMb * 1_048_576)) * 100)}%`,
                ...(level === 'ok' ? { backgroundColor: brand.primary } : {}),
              }}
            />
          </div>
          {level !== 'ok' && (
            <p role="alert" className={cn('mt-2 text-sm', level === 'full' ? 'text-red-700' : 'text-amber-800')}>
              {level === 'full'
                ? 'Galleries is full. Empty the Bin or delete files you no longer need, or ask an admin for more space.'
                : `Galleries is over ${usage.warnPercent}% full. Empty the Bin or delete files you no longer need.`}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Galleries view" className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {(
            [
              ['files', 'Files'],
              ['bin', `Bin${bin.allFiles.length + bin.allFolders.length > 0 ? ` (${bin.files.length + bin.folders.length})` : ''}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={cn('rounded-lg px-3 py-1.5 text-sm font-semibold', view === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}
            >
              {label}
            </button>
          ))}
        </div>
        {view === 'files' && (
          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Search files</span>
            <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search every folder"
              aria-label="Search files"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none"
            />
          </label>
        )}
        {view === 'files' && canEdit && (
          <>
            <button type="button" onClick={() => void newFolder()} className={secondaryButton}>
              <FolderPlus size={16} aria-hidden="true" /> New folder
            </button>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: brand.primary }}
            >
              <UploadSimple size={16} aria-hidden="true" /> Upload
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              aria-label="Choose files to upload"
              onChange={(event) => {
                void upload(event.target.files)
                event.target.value = ''
              }}
            />
          </>
        )}
        {view === 'bin' && canDelete && bin.allFiles.length + bin.allFolders.length > 0 && (
          <button type="button" onClick={() => void emptyBin()} className={cn(secondaryButton, 'text-red-700')}>
            <Trash size={16} aria-hidden="true" /> Empty the Bin
          </button>
        )}
        {canDelete && usage && (
          <button type="button" onClick={() => setLimitsOpen(true)} className={secondaryButton} aria-label="Galleries limits">
            <Gear size={16} aria-hidden="true" /> Limits
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {uploads.length > 0 && (
        <ul aria-label="Uploads" className="space-y-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
          {uploads.map((entry, index) => (
            <li key={`${entry.name}-${index}`} className={entry.problem ? 'text-red-700' : 'text-slate-700'}>
              {entry.problem ?? `${entry.name} — ${entry.done ? 'uploaded' : 'uploading…'}`}
            </li>
          ))}
        </ul>
      )}

      {data === null ? (
        <p className="text-sm text-slate-500">Loading Galleries…</p>
      ) : view === 'bin' ? (
        <BinList bin={bin} canDelete={canDelete} onRestore={(item) => void run(() => api.restoreItems(
          item.kind === 'file' ? [item.file.id] : [], item.kind === 'folder' ? [item.folder.id] : []), 'Restored.')} onForget={(item) => void forget(item)} />
      ) : (
        <div className={cn('rounded-2xl border bg-white', dragging ? 'border-dashed border-slate-400' : 'border-slate-200')}>
          <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 border-b border-slate-100 px-4 py-3 text-sm">
            <button type="button" onClick={() => { setFolderId(null); setSearch('') }} className="font-semibold text-slate-700 hover:underline">
              Galleries
            </button>
            {search.trim() ? (
              <>
                <CaretRight size={12} className="text-slate-400" aria-hidden="true" />
                <span className="text-slate-500">Search results</span>
              </>
            ) : (
              trail.map((folder) => (
                <span key={folder.id} className="flex items-center gap-1">
                  <CaretRight size={12} className="text-slate-400" aria-hidden="true" />
                  <button type="button" onClick={() => setFolderId(folder.id)} className="text-slate-700 hover:underline">
                    {folder.name}
                  </button>
                </span>
              ))
            )}
          </nav>
          {!search.trim() && folders.length === 0 && files.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              {canEdit ? 'Nothing here yet. Upload files or drop them on this page.' : 'Nothing here yet.'}
            </p>
          ) : search.trim() && files.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">No file has that name.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
              {!search.trim() &&
                folders.map((folder) => (
                  <Tile
                    key={`folder-${folder.id}`}
                    label={folder.name}
                    detail={`${filesIn(gallery, folder.id).length} files`}
                    thumb={<Folder size={40} weight="duotone" className="text-amber-500" aria-hidden="true" />}
                    onOpen={() => setFolderId(folder.id)}
                    actions={[
                      ...(canEdit ? [{ label: 'Rename', icon: PencilSimple, run: () => setRenaming({ kind: 'folder', folder }) }] : []),
                      ...(canEdit ? [{ label: 'Move', icon: ArrowsOutCardinal, run: () => setMoving({ kind: 'folder', folder }) }] : []),
                      ...(canDelete ? [{ label: 'Delete', icon: Trash, run: () => void remove({ kind: 'folder', folder }) }] : []),
                    ]}
                  />
                ))}
              {files.map((file) => (
                <Tile
                  key={`file-${file.id}`}
                  label={file.name}
                  detail={formatBytes(file.sizeBytes)}
                  thumb={<Thumb file={file} />}
                  onOpen={() => setPreviewing(file)}
                  actions={[
                    { label: 'Copy link', icon: Copy, run: () => void copyLink(file) },
                    ...(canEdit ? [{ label: 'Rename', icon: PencilSimple, run: () => setRenaming({ kind: 'file', file }) }] : []),
                    ...(canEdit ? [{ label: 'Move', icon: ArrowsOutCardinal, run: () => setMoving({ kind: 'file', file }) }] : []),
                    ...(canDelete ? [{ label: 'Delete', icon: Trash, run: () => void remove({ kind: 'file', file }) }] : []),
                  ]}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {renaming && (
        <RenameDialog
          item={renaming}
          onClose={() => setRenaming(null)}
          onSave={(name) =>
            run(
              () => api.renameItem(renaming.kind, renaming.kind === 'file' ? renaming.file.id : renaming.folder.id, name),
              'Renamed.',
            ).then(() => setRenaming(null))
          }
        />
      )}
      {moving && (
        <MoveDialog
          item={moving}
          choices={folderChoices(gallery).filter((choice) => moving.kind === 'file' || choice.id !== moving.folder.id)}
          onClose={() => setMoving(null)}
          onMove={(to) =>
            run(
              () => api.moveItems(moving.kind === 'file' ? [moving.file.id] : [], moving.kind === 'folder' ? [moving.folder.id] : [], to),
              'Moved.',
            ).then(() => setMoving(null))
          }
        />
      )}
      {previewing && <PreviewDialog file={previewing} onClose={() => setPreviewing(null)} />}
      {limitsOpen && usage && (
        <LimitsDialog
          usage={usage}
          onClose={() => setLimitsOpen(false)}
          onSave={(limits) => run(() => api.saveLimits(limits), 'Limits saved.').then(() => setLimitsOpen(false))}
        />
      )}
      {dialog}
    </section>
  )
}

const secondaryButton =
  'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'

export function Thumb({ file, size = 'lg' }: { file: GalleryFile; size?: 'lg' | 'sm' }) {
  const box = size === 'lg' ? 'h-24 w-full' : 'h-12 w-12'
  if (file.kind === 'image') {
    return <img src={publicUrl(file.path)} alt="" loading="lazy" className={cn(box, 'rounded-lg object-cover')} />
  }
  const Icon = file.kind === 'video' ? FilmStrip : file.kind === 'audio' ? MusicNote : FileIcon
  return (
    <span className={cn(box, 'flex items-center justify-center rounded-lg bg-slate-100 text-slate-500')}>
      <Icon size={size === 'lg' ? 32 : 20} aria-hidden="true" />
    </span>
  )
}

function Tile({
  label,
  detail,
  thumb,
  onOpen,
  actions,
}: {
  label: string
  detail: string
  thumb: ReactNode
  onOpen: () => void
  actions: { label: string; icon: typeof Trash; run: () => void }[]
}) {
  return (
    <li className="group relative rounded-xl border border-slate-200 bg-white p-2">
      <button type="button" onClick={onOpen} className="block w-full text-left" aria-label={`Open ${label}`}>
        <span className="flex h-24 items-center justify-center">{thumb}</span>
        <span className="mt-2 block truncate text-sm font-medium text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">{detail}</span>
      </button>
      {actions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.run}
              aria-label={`${action.label} ${label}`}
              title={action.label}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <action.icon size={14} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </li>
  )
}

function BinList({
  bin,
  canDelete,
  onRestore,
  onForget,
}: {
  bin: ReturnType<typeof binItems>
  canDelete: boolean
  onRestore: (item: Item) => void
  onForget: (item: Item) => void
}) {
  const rows: Item[] = [
    ...bin.folders.map((folder): Item => ({ kind: 'folder', folder })),
    ...bin.files.map((file): Item => ({ kind: 'file', file })),
  ]
  if (rows.length === 0) {
    return <p className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">The Bin is empty.</p>
  }
  return (
    <ul aria-label="Bin" className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
      {rows.map((item) => {
        const name = item.kind === 'file' ? item.file.name : item.folder.name
        return (
          <li key={`${item.kind}-${item.kind === 'file' ? item.file.id : item.folder.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            {item.kind === 'file' ? <Thumb file={item.file} size="sm" /> : <Folder size={28} weight="duotone" className="text-amber-500" aria-hidden="true" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-slate-900">{name}</span>
              <span className="block text-xs text-slate-500">
                {item.kind === 'file' ? `${formatBytes(item.file.sizeBytes)}${item.file.deletedByName ? ` · deleted by ${item.file.deletedByName}` : ''}` : 'Folder and what was in it'}
              </span>
            </span>
            {canDelete && (
              <>
                <button type="button" onClick={() => onRestore(item)} className={secondaryButton} aria-label={`Restore ${name}`}>
                  <ArrowCounterClockwise size={14} aria-hidden="true" /> Restore
                </button>
                <button type="button" onClick={() => onForget(item)} className={cn(secondaryButton, 'text-red-700')} aria-label={`Delete ${name} forever`}>
                  <Trash size={14} aria-hidden="true" /> Delete forever
                </button>
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function DialogFrame({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  return (
    <ModalShell maxWidth="sm" onClose={onClose}>
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
          <X size={14} />
        </button>
      </div>
      <div className="space-y-3 px-6 py-5">{children}</div>
      <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-3">{footer}</div>
    </ModalShell>
  )
}

function PrimaryButton({ onClick, children, disabled }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      style={{ backgroundColor: brand.primary }}
    >
      {children}
    </button>
  )
}

function RenameDialog({ item, onClose, onSave }: { item: Item; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(item.kind === 'file' ? item.file.name : item.folder.name)
  return (
    <DialogFrame
      title={item.kind === 'file' ? 'Rename file' : 'Rename folder'}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <PrimaryButton onClick={() => void onSave(name)} disabled={!name.trim()}>Save</PrimaryButton>
        </>
      }
    >
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} aria-label="New name" autoFocus
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </label>
    </DialogFrame>
  )
}

function MoveDialog({
  item,
  choices,
  onClose,
  onMove,
}: {
  item: Item
  choices: { id: number; label: string }[]
  onClose: () => void
  onMove: (to: number | null) => Promise<void>
}) {
  const [to, setTo] = useState('')
  return (
    <DialogFrame
      title={`Move “${item.kind === 'file' ? item.file.name : item.folder.name}”`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <PrimaryButton onClick={() => void onMove(to === '' ? null : Number(to))}>Move</PrimaryButton>
        </>
      }
    >
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Into</span>
        <select value={to} onChange={(event) => setTo(event.target.value)} aria-label="Move into" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
          <option value="">Galleries (the top)</option>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>{choice.label}</option>
          ))}
        </select>
      </label>
    </DialogFrame>
  )
}

function PreviewDialog({ file, onClose }: { file: GalleryFile; onClose: () => void }) {
  const url = publicUrl(file.path)
  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-slate-900">{file.name}</h2>
          <p className="text-xs text-slate-500">
            {formatBytes(file.sizeBytes)}{file.uploadedByName ? ` · uploaded by ${file.uploadedByName}` : ''} · {new Date(file.createdAt).toLocaleDateString()}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
          <X size={14} />
        </button>
      </div>
      <div data-modal-body className="flex max-h-[70vh] justify-center overflow-auto bg-slate-50 p-4">
        {file.kind === 'image' ? (
          <img src={url} alt={file.name} className="max-h-[65vh] rounded-lg" />
        ) : file.kind === 'video' ? (
          <video src={url} controls className="max-h-[65vh] rounded-lg" />
        ) : file.kind === 'audio' ? (
          <audio src={url} controls />
        ) : (
          <a href={url} target="_blank" rel="noreferrer" className="text-sm font-semibold underline">
            Open the file in a new tab
          </a>
        )}
      </div>
    </ModalShell>
  )
}

function LimitsDialog({
  usage,
  onClose,
  onSave,
}: {
  usage: GalleryUsage
  onClose: () => void
  onSave: (limits: Pick<GalleryUsage, 'maxFileMb' | 'quotaMb' | 'warnPercent'>) => Promise<void>
}) {
  const [maxFileMb, setMaxFileMb] = useState(String(usage.maxFileMb))
  const [quotaMb, setQuotaMb] = useState(String(usage.quotaMb))
  const [warnPercent, setWarnPercent] = useState(String(usage.warnPercent))
  const field = (label: string, value: string, set: (value: string) => void, hint: string) => (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input type="number" min={1} value={value} onChange={(event) => set(event.target.value)} aria-label={label}
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      <span className="mt-1 block text-xs text-slate-500">{hint}</span>
    </label>
  )
  return (
    <DialogFrame
      title="Galleries limits"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <PrimaryButton onClick={() => void onSave({ maxFileMb: Number(maxFileMb), quotaMb: Number(quotaMb), warnPercent: Number(warnPercent) })}>
            Save
          </PrimaryButton>
        </>
      }
    >
      {field('Largest file (MB)', maxFileMb, setMaxFileMb, 'Supabase Free takes up to 50 MB a file.')}
      {field('Space for all files (MB)', quotaMb, setQuotaMb, 'Supabase Free has 1 GB for the whole school, shared with other files.')}
      {field('Warn when used (%)', warnPercent, setWarnPercent, 'A yellow note shows from this much.')}
    </DialogFrame>
  )
}
