import { useRef, useState } from 'react'
import {
  CaretDown,
  CaretUp,
  DotsSixVertical,
  FileText,
  Image,
  PencilSimple,
  Plus,
  Trash,
  VideoCamera,
  X,
} from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { cn } from '../../lib/cn'
import { useConfirm } from '../../hooks/useConfirm'
import {
  checkQuickReplyFile,
  MAX_QUICK_REPLY_STEPS,
  mediaKind,
  moveItem,
  QUICK_REPLY_FILE_TYPES,
  QUICK_REPLY_VARIABLES,
  type QuickReply,
  type QuickReplyMedia,
} from '../../lib/quickReplies'
import type { QuickReplyDraft } from '../../lib/quickRepliesApi'

type QuickReplyManagerProps = {
  replies: QuickReply[]
  isLoading: boolean
  loadError: string | null
  onClose: () => void
  // Each returns an error message, or null when it worked.
  onSave: (existing: QuickReply | null, draft: QuickReplyDraft) => Promise<string | null>
  onRemove: (reply: QuickReply) => Promise<string | null>
  // The ids in the order the team dragged them into.
  onReorder: (ids: number[]) => Promise<string | null>
}

const fieldClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#fc0c97]'

function KindIcon({ type }: { type: string }) {
  const kind = mediaKind(type)
  const Icon = kind === 'image' ? Image : kind === 'video' ? VideoCamera : FileText
  return <Icon size={14} aria-hidden="true" className="shrink-0 text-slate-500" />
}

// One row being edited. A file row holds a stored file or a newly chosen one, never both.
type Row = { key: number; type: 'text' | 'file'; text: string; media: QuickReplyMedia | null; file: File | null }

let nextRowKey = 1
const newRow = (patch: Partial<Row> = {}): Row => ({ key: nextRowKey++, type: 'text', text: '', media: null, file: null, ...patch })

function rowsOf(reply: QuickReply | null): Row[] {
  if (!reply || reply.steps.length === 0) {
    return [newRow()]
  }
  return reply.steps.map((step) =>
    step.kind === 'text' ? newRow({ text: step.text }) : newRow({ type: 'file', media: step.media }),
  )
}

function ReplyForm({
  existing,
  onCancel,
  onSave,
}: {
  existing: QuickReply | null
  onCancel: () => void
  onSave: QuickReplyManagerProps['onSave']
}) {
  const [title, setTitle] = useState(existing?.title ?? '')
  const [rows, setRows] = useState<Row[]>(() => rowsOf(existing))
  const [isActive, setIsActive] = useState(existing?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const textFields = useRef(new Map<number, HTMLTextAreaElement>())
  // The text row a name tag is put into: the one last clicked in.
  const lastText = useRef<number | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const pickingFor = useRef<number | null>(null)

  function change(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function chooseFile(list: FileList | null) {
    const file = list?.[0]
    const key = pickingFor.current
    if (!file || key === null) {
      return
    }
    const problem = checkQuickReplyFile(file)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    change(key, { file, media: null })
  }

  function insertVariable(token: string) {
    const target = rows.find((row) => row.key === lastText.current && row.type === 'text') ?? rows.find((row) => row.type === 'text')
    if (!target) {
      return
    }
    const field = textFields.current.get(target.key)
    const start = field?.selectionStart ?? target.text.length
    const end = field?.selectionEnd ?? target.text.length
    change(target.key, { text: `${target.text.slice(0, start)}${token}${target.text.slice(end)}` })
    window.requestAnimationFrame(() => {
      field?.focus()
      field?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  async function save() {
    if (!title.trim()) {
      setError('Give it a short title so the team can find it.')
      return
    }
    const steps: QuickReplyDraft['steps'] = []
    for (const [index, row] of rows.entries()) {
      if (row.type === 'text') {
        if (row.text.trim()) {
          steps.push({ kind: 'text', text: row.text.trim() })
        }
      } else if (row.file) {
        steps.push({ kind: 'file', file: row.file })
      } else if (row.media) {
        steps.push({ kind: 'media', media: row.media })
      } else {
        setError(`Row ${index + 1} has no file yet. Choose one, or change the row to a text.`)
        return
      }
    }
    if (steps.length === 0) {
      setError('Write a message or attach a file.')
      return
    }
    setIsSaving(true)
    setError(null)
    const problem = await onSave(existing, { title, steps, isActive })
    setIsSaving(false)
    if (problem) {
      setError(problem)
      return
    }
    onCancel()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div data-modal-body className="max-h-[70vh] min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-6 sm:px-8">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Title</span>
          <input
            value={title}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Trial class details"
            className={fieldClass}
          />
          <span className="mt-1 block text-xs text-slate-500">Only your team sees this. It is what you search for.</span>
        </label>

        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">What to send, in this order</p>
          <ol className="space-y-3">
            {rows.map((row, index) => (
              <li key={row.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3" aria-label={`Row ${index + 1}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-700">{index + 1}</span>
                  <select
                    value={row.type}
                    aria-label={`Row ${index + 1} type`}
                    onChange={(event) => change(row.key, { type: event.target.value as Row['type'] })}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-[#fc0c97]"
                  >
                    <option value="text">Text</option>
                    <option value="file">Photo, video or PDF</option>
                  </select>
                  <span className="flex-1" />
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => setRows((current) => moveItem(current, index, index - 1))}
                    aria-label={`Move row ${index + 1} up`}
                    className="rounded p-1 text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                  >
                    <CaretUp size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={index === rows.length - 1}
                    onClick={() => setRows((current) => moveItem(current, index, index + 1))}
                    aria-label={`Move row ${index + 1} down`}
                    className="rounded p-1 text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                  >
                    <CaretDown size={14} />
                  </button>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setRows((current) => current.filter((entry) => entry.key !== row.key))}
                      aria-label={`Remove row ${index + 1}`}
                      className="rounded p-1 text-slate-500 hover:bg-slate-200"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {row.type === 'text' ? (
                  <textarea
                    ref={(element) => {
                      if (element) {
                        textFields.current.set(row.key, element)
                      } else {
                        textFields.current.delete(row.key)
                      }
                    }}
                    value={row.text}
                    rows={index === 0 ? 4 : 3}
                    maxLength={4000}
                    aria-label={`Row ${index + 1} text`}
                    onFocus={() => {
                      lastText.current = row.key
                    }}
                    onChange={(event) => change(row.key, { text: event.target.value })}
                    className={cn(fieldClass, 'mt-2 bg-white')}
                  />
                ) : (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                    {row.file || row.media ? (
                      <>
                        <KindIcon type={row.file?.type ?? row.media?.type ?? ''} />
                        <span className="min-w-0 flex-1 truncate">{row.file?.name ?? row.media?.name}</span>
                        {row.file && <span className="text-xs text-emerald-700">New</span>}
                      </>
                    ) : (
                      <span className="min-w-0 flex-1 text-slate-500">No file chosen</span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        pickingFor.current = row.key
                        fileInput.current?.click()
                      }}
                      className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {row.file || row.media ? 'Change file' : 'Choose file'}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept={QUICK_REPLY_FILE_TYPES.join(',')}
            onChange={(event) => {
              chooseFile(event.target.files)
              event.target.value = ''
            }}
          />
          {rows.length < MAX_QUICK_REPLY_STEPS && (
            <button
              type="button"
              onClick={() => setRows((current) => [...current, newRow()])}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Plus size={14} aria-hidden="true" />
              Add a row
            </button>
          )}
          <p className="text-xs text-slate-500">
            Each row is sent on its own, one after the other, from the first row down. Up to {MAX_QUICK_REPLY_STEPS} rows. Files can be PNG, JPG,
            WebP, MP4 or PDF, up to 16 MB each.
          </p>
        </div>

        <div>
          <p className="text-xs text-slate-500">Add a name that fills in by itself for each parent:</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {QUICK_REPLY_VARIABLES.map((variable) => (
              <button
                key={variable.token}
                type="button"
                onClick={() => insertVariable(variable.token)}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {variable.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
          Show it in the quick reply list
        </label>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white px-6 py-3 sm:px-8">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => void save()}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : 'Save quick reply'}
        </button>
      </div>
    </div>
  )
}

// Where the team adds, changes, removes and orders quick replies.
export function QuickReplyManager({ replies, isLoading, loadError, onClose, onSave, onRemove, onReorder }: QuickReplyManagerProps) {
  const [editing, setEditing] = useState<QuickReply | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const { confirm, dialog } = useConfirm()

  async function remove(reply: QuickReply) {
    const sure = await confirm(`Delete "${reply.title}"? Its photos and videos are deleted too.`, {
      confirmLabel: 'Delete',
    })
    if (!sure) {
      return
    }
    setError(await onRemove(reply))
  }

  async function drop(to: number) {
    const from = dragging
    setDragging(null)
    setOver(null)
    if (from === null || from === to) {
      return
    }
    setError(await onReorder(moveItem(replies, from, to).map((reply) => reply.id)))
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">WhatsApp</div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              {editing === null ? 'Quick replies' : editing === 'new' ? 'New quick reply' : 'Edit quick reply'}
            </h2>
            {editing === null && (
              <p className="mt-2 text-sm text-slate-500">
                Messages the team can send in two clicks, with photos or videos if you like. Drag them into the order you want.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {editing !== null ? (
        <ReplyForm existing={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSave={onSave} />
      ) : (
        <div data-modal-body className="max-h-[70vh] min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-6 sm:px-8">
          {(error || loadError) && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error ?? loadError}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setError(null)
              setEditing('new')
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84]"
          >
            <Plus size={14} aria-hidden="true" />
            New quick reply
          </button>
          {isLoading && <p className="text-sm text-slate-500">Loading...</p>}
          {!isLoading && !loadError && replies.length === 0 && (
            <p className="text-sm text-slate-500">None yet. Add the messages you send most often.</p>
          )}
          <ul className="divide-y divide-slate-100">
            {replies.map((reply, index) => (
              <li
                key={reply.id}
                draggable
                aria-label={`Quick reply ${reply.title}`}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  setDragging(index)
                }}
                onDragOver={(event) => {
                  if (dragging !== null) {
                    event.preventDefault()
                    setOver(index)
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  void drop(index)
                }}
                onDragEnd={() => {
                  setDragging(null)
                  setOver(null)
                }}
                className={cn(
                  'flex items-start gap-3 py-3',
                  dragging === index && 'opacity-40',
                  over === index && dragging !== index && 'bg-pink-50',
                )}
              >
                <span
                  className="mt-0.5 cursor-grab text-slate-400 active:cursor-grabbing"
                  title="Drag to change the order"
                  aria-hidden="true"
                >
                  <DotsSixVertical size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="truncate">{reply.title}</span>
                    {!reply.isActive && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Hidden</span>
                    )}
                  </p>
                  {reply.steps.map((step, position) =>
                    step.kind === 'text' ? (
                      <p key={position} className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs text-slate-500">
                        <span className="font-medium text-slate-600">{position + 1}. </span>
                        {step.text}
                      </p>
                    ) : (
                      <p key={position} className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <span className="font-medium text-slate-600">{position + 1}. </span>
                        <KindIcon type={step.media.type} />
                        {step.media.name}
                      </p>
                    ),
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setError(null)
                    setEditing(reply)
                  }}
                  aria-label={`Edit ${reply.title}`}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                >
                  <PencilSimple size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(reply)}
                  aria-label={`Delete ${reply.title}`}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {dialog}
    </ModalShell>
  )
}

