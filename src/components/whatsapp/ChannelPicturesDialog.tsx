import { useRef, useState } from 'react'
import { UploadSimple, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { pictureToDataUrl } from '../../lib/channelAvatars'
import { ChannelBadge, type ChannelKind } from './ChannelBadge'

// One Page (or Instagram account) the inbox has chats from. `auto` is the picture fetched from Facebook, `uploaded`
// the one an admin set; the uploaded one wins.
export type ChannelPictureRow = {
  key: string
  kind: Exclude<ChannelKind, 'whatsapp'>
  name: string
  auto: string | null
  uploaded: string | null
}

type ChannelPicturesDialogProps = {
  channels: ChannelPictureRow[]
  onSave: (key: string, picture: string) => Promise<string | null>
  onRemove: (key: string) => Promise<string | null>
  onClose: () => void
}

// Where an admin sets the picture of each Messenger Page / Instagram account, shown on its chats in the list. The
// CRM tries to fetch the Page's own picture first; a picture put here is used instead.
export function ChannelPicturesDialog({ channels, onSave, onRemove, onClose }: ChannelPicturesDialogProps) {
  const [problem, setProblem] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const pickers = useRef(new Map<string, HTMLInputElement>())

  async function choose(row: ChannelPictureRow, file: File | undefined) {
    if (!file) {
      return
    }
    setBusyKey(row.key)
    try {
      const picture = await pictureToDataUrl(file)
      setProblem(await onSave(row.key, picture))
    } catch (failure) {
      setProblem(failure instanceof Error ? failure.message : "That picture can't be read.")
    } finally {
      setBusyKey(null)
    }
  }

  async function clear(row: ChannelPictureRow) {
    setBusyKey(row.key)
    setProblem(await onRemove(row.key))
    setBusyKey(null)
  }

  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">Inbox</div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Page pictures</h2>
            <p className="mt-2 text-sm text-slate-500">
              Each chat shows the picture of the Page it came through. The CRM fetches the Page&apos;s own picture when
              it can; when it cannot, or you want another one, upload it here.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div data-modal-body className="max-h-[75vh] space-y-3 overflow-y-auto px-6 py-6 sm:px-8">
        {problem && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {problem}
          </p>
        )}
        {channels.length === 0 && (
          <p className="text-sm text-slate-500">No Messenger or Instagram chat has come in yet, so there is no Page to set.</p>
        )}
        <ul className="space-y-2">
          {channels.map((row) => {
            const shown = row.uploaded ?? row.auto
            return (
              <li key={row.key} className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-3 py-3">
                <ChannelBadge info={{ kind: row.kind, name: row.name, avatar: shown }} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{row.name}</p>
                  <p className="text-xs text-slate-500">
                    {row.kind === 'instagram' ? 'Instagram' : 'Messenger'} ·{' '}
                    {row.uploaded ? 'Your picture' : row.auto ? "The Page's own picture" : 'No picture yet'}
                  </p>
                </div>
                <input
                  ref={(element) => {
                    if (element) {
                      pickers.current.set(row.key, element)
                    } else {
                      pickers.current.delete(row.key)
                    }
                  }}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label={`Picture for ${row.name}`}
                  className="sr-only"
                  onChange={(event) => {
                    void choose(row, event.target.files?.[0])
                    event.target.value = ''
                  }}
                />
                <button
                  type="button"
                  disabled={busyKey === row.key}
                  onClick={() => pickers.current.get(row.key)?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <UploadSimple size={14} aria-hidden="true" />
                  {row.uploaded ? 'Change' : 'Upload'}
                </button>
                {row.uploaded && (
                  <button
                    type="button"
                    disabled={busyKey === row.key}
                    onClick={() => void clear(row)}
                    className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </ModalShell>
  )
}
