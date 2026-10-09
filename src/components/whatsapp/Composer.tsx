import { useEffect, useRef, useState } from 'react'
import { FileText, Image as ImageIcon, Lightning, Microphone, PaperPlaneTilt, Paperclip, Smiley, Trash, VideoCamera, X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { useAutoGrow } from '../../hooks/useAutoGrow'
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder'
import type { SendInput } from '../../hooks/useWhatsAppInbox'
import { fillVariables, unfilledVariables, type QuickReply, type VariableValues } from '../../lib/quickReplies'
import { downloadQuickReplyMedia } from '../../lib/quickRepliesApi'
import { isEmptyDraft, type ComposerItem, type Draft } from '../../lib/draft'
import { fileKind } from '../../lib/outbox'
import { EmojiPicker } from './EmojiPicker'
import { insertAt, rememberEmoji } from '../../lib/emoji'
import { QuickReplyPicker } from './QuickReplyPicker'

type ComposerProps = {
  onSend: (input: SendInput) => Promise<boolean>
  quickReplies: { replies: QuickReply[]; isLoading: boolean; error: string | null; reload: () => Promise<void> }
  // What {parent name}, {child name} and the like become in this chat.
  variables: VariableValues
  // Only given to people who may edit quick replies.
  onManageQuickReplies?: () => void
  // Text written for the box from elsewhere (the enrol steps). Each new id adds its text once.
  draftRequest?: { id: number; text: string } | null
  // What was left unsent in this chat, and where to report changes to it (null once nothing is left).
  draft?: Draft | null
  onDraftChange?: (draft: Draft | null) => void
}

function formatSeconds(total: number) {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const isTouchDevice = () => window.matchMedia?.('(pointer: coarse)').matches ?? false

let nextItemId = 1

function FileIcon({ file }: { file: File }) {
  const kind = fileKind(file)
  const Icon = kind === 'image' ? ImageIcon : kind === 'video' ? VideoCamera : FileText
  return <Icon size={14} aria-hidden="true" className="shrink-0 text-slate-500" />
}

// The text of a quick reply row waiting to be sent; grows with what is written, like the main box.
function QueuedText({
  index,
  value,
  onChange,
  onKeyDown,
}: {
  index: number
  value: string
  onChange: (next: string) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const field = useRef<HTMLTextAreaElement>(null)
  useAutoGrow(field, value)
  return (
    <textarea
      ref={field}
      value={value}
      rows={1}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      aria-label={`Message ${index + 1}`}
      className="min-h-[36px] w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-[#fc0c97]"
    />
  )
}

export function Composer({
  onSend,
  quickReplies,
  variables,
  onManageQuickReplies,
  draftRequest,
  draft = null,
  onDraftChange,
}: ComposerProps) {
  const [mode, setMode] = useState<'reply' | 'note'>(draft?.mode ?? 'reply')
  const [text, setText] = useState(draft?.text ?? '')
  // Rows from a quick reply, in the order they will be sent, before anything else.
  const [queue, setQueue] = useState<ComposerItem[]>(draft?.queue ?? [])
  const [files, setFiles] = useState<File[]>(draft?.files ?? [])
  const [hint, setHint] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  useAutoGrow(textarea, text)
  const lastDraft = useRef<number | null>(draftRequest?.id ?? null)
  // Kept after what is already typed, so nothing the team wrote is lost.
  useEffect(() => {
    if (!draftRequest || draftRequest.id === lastDraft.current) {
      return
    }
    lastDraft.current = draftRequest.id
    setMode('reply')
    setText((current) => (current.trim() ? `${current.trimEnd()}

${draftRequest.text}` : draftRequest.text))
    textarea.current?.focus()
  }, [draftRequest])
  // Keeps the chat's draft up to date, so it is still here after going to another chat or page.
  const report = useRef(onDraftChange)
  useEffect(() => {
    report.current = onDraftChange
  })
  useEffect(() => {
    const next: Draft = { mode, text, queue, files }
    report.current?.(isEmptyDraft(next) ? null : next)
  }, [mode, text, queue, files])
  const [isLoadingMedia, setIsLoadingMedia] = useState(false)
  const { reload: reloadQuickReplies } = quickReplies
  const fileInput = useRef<HTMLInputElement>(null)
  const voice = useVoiceRecorder()
  const sendVoiceWhenReady = useRef(false)

  // A voice message goes out the moment the recording stops.
  const { state: voiceState, file: voiceFile, discard: discardVoice } = voice
  useEffect(() => {
    if (voiceState === 'ready' && voiceFile && sendVoiceWhenReady.current) {
      sendVoiceWhenReady.current = false
      void onSend({ isPrivate: mode === 'note', sequence: [voiceFile] }).then(() => discardVoice())
    }
  }, [voiceState, voiceFile, discardVoice, onSend, mode])

  function addFiles(list: FileList | File[]) {
    setFiles((current) => [...current, ...Array.from(list)])
    setHint(null)
  }

  // Puts the emoji where the cursor is, and leaves the cursor after it.
  function addEmoji(emoji: string) {
    const field = textarea.current
    const next = insertAt(text, emoji, field?.selectionStart ?? text.length, field?.selectionEnd ?? text.length)
    setText(next.text)
    setHint(null)
    rememberEmoji(emoji)
    window.requestAnimationFrame(() => {
      field?.focus()
      field?.setSelectionRange(next.cursor, next.cursor)
    })
  }

  function openPicker() {
    setPickerOpen(true)
    void reloadQuickReplies()
  }

  // Every row of the reply is added, in its order, as a card above the box (names filled in), so the
  // person can still read and change it, or take a row out, before sending.
  async function applyQuickReply(reply: QuickReply) {
    setPickerOpen(false)
    setHint(null)
    const hasFiles = reply.steps.some((step) => step.kind === 'media')
    if (hasFiles) {
      setIsLoadingMedia(true)
    }
    try {
      const added = await Promise.all(
        reply.steps.map(async (step): Promise<ComposerItem | null> => {
          if (step.kind === 'text') {
            const filled = fillVariables(step.text, variables)
            return filled.trim() ? { id: nextItemId++, kind: 'text', text: filled } : null
          }
          return { id: nextItemId++, kind: 'file', file: await downloadQuickReplyMedia(step.media) }
        }),
      )
      setQueue((current) => [...current, ...added.flatMap((item) => item ?? [])])
    } catch {
      setHint("Couldn't load this quick reply's photo or video. Try again.")
    } finally {
      setIsLoadingMedia(false)
    }
  }

  async function submit() {
    if (voice.state === 'recording') {
      setHint('Send or cancel the voice message first.')
      return
    }
    if (isLoadingMedia) {
      setHint('Wait a moment, the photo or video is still loading.')
      return
    }
    const queuedTexts = queue.flatMap((item) => (item.kind === 'text' ? [item.text] : []))
    if (!text.trim() && !queuedTexts.some((message) => message.trim()) && files.length === 0 && !queue.some((item) => item.kind === 'file')) {
      setHint('Write a message or attach something first.')
      return
    }
    const missing = mode === 'reply' ? unfilledVariables([text, ...queuedTexts].join(' ')) : []
    if (missing.length > 0) {
      setHint(`Fill in ${missing.join(', ')} before sending.`)
      return
    }
    // The quick reply rows first, in their order; then files attached by hand; the typed text last.
    const sequence = [...queue.map((item) => (item.kind === 'text' ? item.text : item.file)), ...files, text]
    const sent = await onSend({ isPrivate: mode === 'note', sequence })
    if (sent) {
      setText('')
      setQueue([])
      setFiles([])
      setHint(null)
    }
  }

  function insertNewLine(element: HTMLTextAreaElement, value: string, change: (next: string) => void) {
    const start = element.selectionStart
    const end = element.selectionEnd
    change(`${value.slice(0, start)}\n${value.slice(end)}`)
    window.requestAnimationFrame(() => element.setSelectionRange(start + 1, start + 1))
  }

  // Enter sends, Ctrl+Enter (or Shift/Cmd) starts a new line; phones keep Enter for a new line.
  function handleEnter(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    value: string,
    change: (next: string) => void,
  ) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
      return
    }
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      event.preventDefault()
      insertNewLine(event.currentTarget, value, change)
    } else if (!isTouchDevice()) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <div className="relative border-t border-slate-200 bg-white px-3 py-3 sm:px-4">
      {pickerOpen && (
        <QuickReplyPicker
          replies={quickReplies.replies}
          isLoading={quickReplies.isLoading}
          error={quickReplies.error}
          onPick={(reply) => void applyQuickReply(reply)}
          onClose={() => setPickerOpen(false)}
          onManage={
            onManageQuickReplies
              ? () => {
                  setPickerOpen(false)
                  onManageQuickReplies()
                }
              : undefined
          }
        />
      )}
      <div className="mb-2 flex gap-4 text-sm font-medium">
        {(
          [
            ['reply', 'Reply to parent'],
            ['note', 'Private note'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={cn(
              'border-b-2 pb-1 transition',
              mode === key ? 'border-[#fc0c97] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'note' && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          Only your team can see this note. The parent will not get it.
        </p>
      )}

      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <span
              key={`${file.name}-${index}`}
              className="inline-flex max-w-[200px] items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-xs text-slate-700"
            >
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                className="rounded-full p-1 hover:bg-slate-200"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {voice.state !== 'recording' && queue.length > 0 && (
        <ol className="mb-2 max-h-72 space-y-2 overflow-y-auto" aria-label="Quick reply rows, sent in this order">
          {queue.map((item, index) => (
            <li key={item.id} className="flex items-start gap-2">
              <span className="mt-2 w-4 shrink-0 text-center text-[11px] font-semibold text-slate-400">{index + 1}</span>
              <div className="min-w-0 flex-1">
                {item.kind === 'text' ? (
                  <QueuedText
                    index={index}
                    value={item.text}
                    onChange={(next) =>
                      setQueue((current) => current.map((entry) => (entry.id === item.id && entry.kind === 'text' ? { ...entry, text: next } : entry)))
                    }
                    onKeyDown={(event) =>
                      handleEnter(event, item.text, (next) =>
                        setQueue((current) => current.map((entry) => (entry.id === item.id && entry.kind === 'text' ? { ...entry, text: next } : entry))),
                      )
                    }
                  />
                ) : (
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
                    <FileIcon file={item.file} />
                    <span className="truncate">{item.file.name}</span>
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setQueue((current) => current.filter((entry) => entry.id !== item.id))}
                aria-label={`Remove row ${index + 1}`}
                className="mt-1 rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ol>
      )}

      {voice.state === 'recording' ? (
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-600" aria-hidden="true" />
            <span className="w-10 shrink-0 tabular-nums">{formatSeconds(voice.seconds)}</span>
            <div className="flex h-8 min-w-0 flex-1 items-center justify-end gap-[3px]" aria-label="Sound level">
              {Array.from({ length: 40 }, (_, index) => {
                const level = voice.levels[voice.levels.length - 40 + index] ?? 0
                return (
                  <span
                    key={index}
                    style={{ height: `${Math.round(Math.max(0.12, level) * 100)}%` }}
                    className="w-[3px] shrink-0 rounded-full bg-red-500 transition-[height] duration-100"
                  />
                )
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={voice.discard}
            aria-label="Cancel voice message"
            title="Cancel voice message"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 sm:p-2.5"
          >
            <Trash size={18} />
          </button>
          <button
            type="button"
            onClick={() => {
              sendVoiceWhenReady.current = true
              voice.stop()
            }}
            aria-label="Send voice message"
            title="Send voice message"
            className="rounded-lg bg-[#fc0c97] p-2.5 text-white hover:bg-[#e00a87]"
          >
            <PaperPlaneTilt size={18} weight="fill" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5 sm:gap-2">
          <div className="relative min-w-0 flex-1">
          <textarea
            ref={textarea}
            value={text}
            rows={1}
            onChange={(event) => {
              // A "/" on an empty box is the shortcut for the quick reply list.
              if (event.target.value === '/' && text === '') {
                openPicker()
                return
              }
              setText(event.target.value)
              setHint(null)
            }}
            onKeyDown={(event) => handleEnter(event, text, setText)}
            onPaste={(event) => {
              if (event.clipboardData.files.length > 0) {
                addFiles(event.clipboardData.files)
              }
            }}
            placeholder={mode === 'note' ? 'Write a note for your team' : 'Write a message'}
            aria-label={mode === 'note' ? 'Private note' : 'Message to parent'}
            className="min-h-[40px] w-full resize-none rounded-lg border border-slate-200 py-2 pl-3 pr-10 text-sm leading-5 outline-none focus:border-[#fc0c97]"
          />
          <button
            type="button"
            data-emoji-toggle
            onClick={() => setEmojiOpen((open) => !open)}
            aria-label="Add an emoji"
            aria-expanded={emojiOpen}
            title="Add an emoji"
            className="absolute bottom-1.5 right-1.5 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <Smiley size={20} />
          </button>
          {emojiOpen && <EmojiPicker onPick={addEmoji} onClose={() => setEmojiOpen(false)} />}
          </div>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files) {
                addFiles(event.target.files)
              }
              event.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())}
            aria-label="Quick replies"
            title="Quick replies (or type / )"
            aria-expanded={pickerOpen}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 sm:p-2.5"
          >
            <Lightning size={18} />
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            aria-label="Attach a photo, video or file"
            title="Attach a photo, video or file"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 sm:p-2.5"
          >
            <Paperclip size={18} />
          </button>
          <button
            type="button"
            onClick={() => void voice.start()}
            aria-label="Record a voice message"
            title="Record a voice message"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 sm:p-2.5"
          >
            <Microphone size={18} />
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={isLoadingMedia}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#fc0c97] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e00a87] disabled:opacity-60 sm:px-4"
          >
            <PaperPlaneTilt size={16} weight="fill" aria-hidden="true" />
            <span className="max-sm:sr-only">{mode === 'note' ? 'Save note' : 'Send'}</span>
          </button>
        </div>
      )}

      {isLoadingMedia && <p className="mt-2 text-xs text-slate-500">Loading the photo or video...</p>}
      {(hint || voice.error) &&<p className="mt-2 text-xs text-red-600">{hint ?? voice.error}</p>}
      {voice.state !== 'recording' && (
        <p className="mt-1.5 hidden text-[11px] text-slate-400 sm:block">Enter to send. Ctrl+Enter for a new line.</p>
      )}
    </div>
  )
}
