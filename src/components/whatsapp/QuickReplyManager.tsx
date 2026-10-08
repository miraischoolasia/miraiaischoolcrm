import { useRef, useState } from 'react'
import { FileText, Image, PencilSimple, Plus, Trash, VideoCamera, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { useConfirm } from '../../hooks/useConfirm'
import {
  checkQuickReplyFile,
  MAX_QUICK_REPLY_FILES,
  MAX_QUICK_REPLY_MESSAGES,
  mediaKind,
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
}

const fieldClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#fc0c97]'

function KindIcon({ type }: { type: string }) {
  const kind = mediaKind(type)
  const Icon = kind === 'image' ? Image : kind === 'video' ? VideoCamera : FileText
  return <Icon size={14} aria-hidden="true" className="shrink-0 text-slate-500" />
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
  const [messages, setMessages] = useState<string[]>(existing?.messages.length ? existing.messages : [''])
  const [isActive, setIsActive] = useState(existing?.isActive ?? true)
  const [keep, setKeep] = useState<QuickReplyMedia[]>(existing?.media ?? [])
  const [added, setAdded] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const messageFields = useRef<Array<HTMLTextAreaElement | null>>([])
  // The box a name tag is put into: the one last clicked in.
  const lastBox = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const fileCount = keep.length + added.length

  function addFiles(list: FileList) {
    const chosen = Array.from(list)
    const problem = chosen.map(checkQuickReplyFile).find(Boolean)
    if (problem) {
      setError(problem)
      return
    }
    if (fileCount + chosen.length > MAX_QUICK_REPLY_FILES) {
      setError(`A quick reply can carry up to ${MAX_QUICK_REPLY_FILES} files.`)
      return
    }
    setError(null)
    setAdded((current) => [...current, ...chosen])
  }

  function insertVariable(token: string) {
    const index = Math.min(lastBox.current, messages.length - 1)
    const field = messageFields.current[index]
    const value = messages[index] ?? ''
    const start = field?.selectionStart ?? value.length
    const end = field?.selectionEnd ?? value.length
    setMessages((current) =>
      current.map((entry, position) => (position === index ? `${value.slice(0, start)}${token}${value.slice(end)}` : entry)),
    )
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
    const written = messages.map((message) => message.trim()).filter(Boolean)
    if (written.length === 0 && fileCount === 0) {
      setError('Write a message or attach a file.')
      return
    }
    setIsSaving(true)
    setError(null)
    const problem = await onSave(existing, { title, messages: written, isActive, keep, add: added })
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
          {messages.map((message, index) => (
            <div key={index}>
              <div className="flex items-center justify-between">
                <label htmlFor={`quick-reply-message-${index}`} className="text-sm font-medium text-slate-700">
                  {messages.length === 1 ? 'Message' : `Message ${index + 1}`}
                </label>
                {messages.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setMessages((current) => current.filter((_, position) => position !== index))}
                    aria-label={`Remove message ${index + 1}`}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <textarea
                id={`quick-reply-message-${index}`}
                ref={(element) => {
                  messageFields.current[index] = element
                }}
                value={message}
                rows={index === 0 ? 5 : 3}
                maxLength={4000}
                onFocus={() => {
                  lastBox.current = index
                }}
                onChange={(event) =>
                  setMessages((current) => current.map((entry, position) => (position === index ? event.target.value : entry)))
                }
                className={fieldClass}
              />
            </div>
          ))}
          {messages.length < MAX_QUICK_REPLY_MESSAGES && (
            <button
              type="button"
              onClick={() => setMessages((current) => [...current, ''])}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Plus size={14} aria-hidden="true" />
              Add another message
            </button>
          )}
          <p className="text-xs text-slate-500">
            Each message is sent on its own, one after the other, after any photo or video. Up to {MAX_QUICK_REPLY_MESSAGES} messages.
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

        <div>
          <span className="text-sm font-medium text-slate-700">Photos, videos or PDFs</span>
          <ul className="mt-1.5 space-y-1.5">
            {keep.map((item) => (
              <li key={item.path} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                <KindIcon type={item.type} />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <button
                  type="button"
                  onClick={() => setKeep((current) => current.filter((entry) => entry.path !== item.path))}
                  aria-label={`Remove ${item.name}`}
                  className="rounded p-1 text-slate-500 hover:bg-slate-200"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
            {added.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm">
                <KindIcon type={file.type} />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="text-xs text-emerald-700">New</span>
                <button
                  type="button"
                  onClick={() => setAdded((current) => current.filter((_, position) => position !== index))}
                  aria-label={`Remove ${file.name}`}
                  className="rounded p-1 text-slate-500 hover:bg-emerald-100"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            accept={QUICK_REPLY_FILE_TYPES.join(',')}
            onChange={(event) => {
              if (event.target.files) {
                addFiles(event.target.files)
              }
              event.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={fileCount >= MAX_QUICK_REPLY_FILES}
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Plus size={14} aria-hidden="true" />
            Add a file
          </button>
          <p className="mt-1 text-xs text-slate-500">PNG, JPG, WebP, MP4 or PDF, up to 16 MB each, {MAX_QUICK_REPLY_FILES} files at most.</p>
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

// Where the team adds, changes and removes quick replies.
export function QuickReplyManager({ replies, isLoading, loadError, onClose, onSave, onRemove }: QuickReplyManagerProps) {
  const [editing, setEditing] = useState<QuickReply | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
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
              <p className="mt-2 text-sm text-slate-500">Messages the team can send in two clicks, with photos or videos if you like.</p>
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
            {replies.map((reply) => (
              <li key={reply.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="truncate">{reply.title}</span>
                    {!reply.isActive && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Hidden</span>
                    )}
                  </p>
                  {reply.messages.map((message, index) => (
                    <p key={index} className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs text-slate-500">
                      {reply.messages.length > 1 && <span className="font-medium text-slate-600">{index + 1}. </span>}
                      {message}
                    </p>
                  ))}
                  {reply.media.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      {reply.media.map((item) => (
                        <span key={item.path} className="inline-flex items-center gap-1">
                          <KindIcon type={item.type} />
                          {item.name}
                        </span>
                      ))}
                    </p>
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
