import { useEffect, useRef, useState } from 'react'
import { AddressBook, ChartBarHorizontal, FileText, Image as ImageIcon, Lightning, MapPin, Microphone, PaperPlaneTilt, Paperclip, Plus, Smiley, Sparkle, Sticker, Trash, VideoCamera, X } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { useAutoGrow } from '../../hooks/useAutoGrow'
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder'
import type { SendInput } from '../../hooks/useWhatsAppInbox'
import { fillVariables, unfilledVariables, type QuickReply, type VariableValues } from '../../lib/quickReplies'
import { downloadQuickReplyMedia } from '../../lib/quickRepliesApi'
import { audioForMeta } from '../../lib/audioWav'
import { isEmptyDraft, type ComposerItem, type Draft } from '../../lib/draft'
import { fileKind, fileProblem } from '../../lib/outbox'
import { EmojiPicker } from './EmojiPicker'
import { insertAt, rememberEmoji } from '../../lib/emoji'
import { QuickReplyPicker } from './QuickReplyPicker'
import { SpecialMessageDialog, type SpecialKind } from './SpecialMessageDialog'
import type { SpecialMessage } from '../../lib/waActions'

type ComposerProps = {
  onSend: (input: SendInput) => Promise<boolean>
  quickReplies: { replies: QuickReply[]; isLoading: boolean; error: string | null; reload: () => Promise<void> }
  // What {parent name}, {child name} and the like become in this chat.
  variables: VariableValues
  // Only given to people who may edit quick replies.
  onManageQuickReplies?: () => void
  // Text written for the box from elsewhere (the enrol steps). Each new id adds its text once.
  draftRequest?: { id: number; text: string } | null
  // Files dropped on the chat from outside. Each new id adds its files once, as if they were picked.
  droppedFiles?: { id: number; files: File[] } | null
  // What was left unsent in this chat, and where to report changes to it (null once nothing is left).
  draft?: Draft | null
  onDraftChange?: (draft: Draft | null) => void
  // The message the next one answers, shown above the box; the first message sent quotes it.
  replyTo?: { id: number; author: string; text: string } | null
  onClearReply?: () => void
  // Sends a location, contact, poll or sticker; resolves to null when it went out, else what to tell the person.
  onSendSpecial?: (message: SpecialMessage) => Promise<string | null>
  // The Follow up button, shown beside the voice button (only when the chat has a lead to follow up).
  followUpControl?: React.ReactNode
  // Called as the team writes a reply, so the parent can be shown "typing...".
  onTyping?: () => void
  // A reply the AI suggests for the parent's last message. It is shown in grey where the text would
  // be; clicking it turns it into the real text. Nothing is sent by itself.
  aiSuggestion?: { text: string; note: string } | null
  aiLoading?: boolean
  aiError?: string | null
  // Why the AI wrote no reply for this message, when it said.
  aiSkipNote?: string | null
  // Whether there is an unanswered message the AI could answer (shows the "Suggest a reply" button).
  aiAvailable?: boolean
  onAiSuggest?: () => void
  // The grey text was used / put away.
  onAiUse?: () => void
  onAiDismiss?: () => void
  // Where the reply goes out from: the WhatsApp number, or the Page. Shown so nobody answers from the wrong one.
  sendingFrom?: string | null
  // Messenger and Instagram chats: the voice message is made as a WAV, which their apps can play.
  voiceAsWav?: boolean
}

const SPECIAL_CHOICES: { kind: SpecialKind; label: string }[] = [
  { kind: 'location', label: 'Location' },
  { kind: 'contact', label: 'Contact' },
  { kind: 'poll', label: 'Poll' },
  { kind: 'sticker', label: 'Sticker' },
]

const SPECIAL_ICONS: Record<SpecialKind, Icon> = {
  location: MapPin,
  contact: AddressBook,
  poll: ChartBarHorizontal,
  sticker: Sticker,
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
  droppedFiles,
  draft = null,
  onDraftChange,
  replyTo = null,
  onClearReply,
  onSendSpecial,
  followUpControl,
  onTyping,
  aiSuggestion = null,
  aiLoading = false,
  aiError = null,
  aiSkipNote = null,
  aiAvailable = false,
  onAiSuggest,
  onAiUse,
  onAiDismiss,
  sendingFrom = null,
  voiceAsWav = false,
}: ComposerProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuBox = useRef<HTMLDivElement>(null)
  const [special, setSpecial] = useState<SpecialKind | null>(null)
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
  // The grey suggestion only shows while the box is empty and the person is writing a reply.
  // Like WhatsApp: the microphone while there is nothing to send, the send button once there is.
  const showMic = mode === 'reply' && text.trim() === '' && queue.length === 0 && files.length === 0
  const showSuggestion = Boolean(aiSuggestion) && mode === 'reply' && text === '' && queue.length === 0 && files.length === 0
  const focusAfterUse = useRef(false)
  useEffect(() => {
    if (focusAfterUse.current && text !== '') {
      focusAfterUse.current = false
      const field = textarea.current
      field?.focus()
      field?.setSelectionRange(text.length, text.length)
    }
  }, [text])
  function useSuggestion() {
    if (!aiSuggestion) {
      return
    }
    focusAfterUse.current = true
    setText(aiSuggestion.text)
    setHint(null)
    onAiUse?.()
  }
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
  const voice = useVoiceRecorder({ asWav: voiceAsWav })
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
    const all = Array.from(list)
    const accepted = all.filter((file) => fileProblem(file) === null)
    const refused = all.map((file) => fileProblem(file)).filter((problem): problem is string => problem !== null)
    if (accepted.length > 0) {
      setFiles((current) => [...current, ...accepted])
    }
    setHint(refused.length > 0 ? refused.join(' ') : null)
  }

  const lastDrop = useRef<number | null>(droppedFiles?.id ?? null)
  useEffect(() => {
    if (!droppedFiles || droppedFiles.id === lastDrop.current) {
      return
    }
    lastDrop.current = droppedFiles.id
    addFiles(droppedFiles.files)
  }, [droppedFiles])

  // The "+" menu closes on a click anywhere else, or Escape.
  useEffect(() => {
    if (!menuOpen) {
      return undefined
    }
    const close = (event: MouseEvent) => {
      if (!menuBox.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [menuOpen])

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
          const file = await downloadQuickReplyMedia(step.media)
          // Messenger and Instagram cannot play OGG or MP3 voice messages; they get a WAV.
          return { id: nextItemId++, kind: 'file', file: voiceAsWav ? await audioForMeta(file) : file }
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
    const sent = await onSend({ isPrivate: mode === 'note', sequence, replyTo: replyTo?.id })
    if (sent) {
      onClearReply?.()
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
      <div className="mb-2 flex items-center gap-4 text-sm font-medium">
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
              'whitespace-nowrap border-b-2 pb-1 transition',
              mode === key ? 'border-[#fc0c97] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {label}
          </button>
        ))}
        {sendingFrom && (
          <span
            title="This reply goes out from here"
            className="ml-auto inline-flex min-w-0 max-w-[60%] items-center gap-1 truncate rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-sky-100"
          >
            <span className="shrink-0 text-sky-600 max-sm:hidden">Sending from</span>
            <span className="truncate">{sendingFrom}</span>
          </span>
        )}
        {onAiSuggest && aiAvailable && mode === 'reply' && !showSuggestion && text === '' && (
          <button
            type="button"
            onClick={onAiSuggest}
            disabled={aiLoading}
            aria-label="Suggest a reply"
            title="Suggest a reply"
            className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60", !sendingFrom && "ml-auto")}
          >
            <Sparkle size={13} weight="fill" className="text-[#fc0c97]" aria-hidden="true" />
            {aiLoading ? 'Writing…' : 'Suggest reply'}
          </button>
        )}
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

      {replyTo && mode === 'reply' && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border-l-4 border-[#fc0c97] bg-slate-50 px-3 py-1.5 text-xs">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-[#be185d]">Replying to {replyTo.author}</div>
            <div className="line-clamp-2 whitespace-pre-wrap text-slate-600">{replyTo.text}</div>
          </div>
          <button type="button" onClick={onClearReply} aria-label="Cancel reply" className="rounded p-1 text-slate-500 hover:bg-slate-200">
            <X size={12} />
          </button>
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
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
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
        <div className="relative flex items-end gap-1 rounded-3xl border border-slate-200 bg-white px-1.5 py-1 focus-within:border-[#fc0c97]">
          <div ref={menuBox} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Attach and more"
              title="Attach a file, quick replies and more"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <Plus size={20} className={cn('transition-transform', menuOpen && 'rotate-45')} />
            </button>
            {menuOpen && (
              <ul
                role="menu"
                className="absolute bottom-full left-0 z-30 mb-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-lg"
              >
                {[
                  { label: 'Photo, video or file', icon: Paperclip, run: () => fileInput.current?.click(), aria: 'Attach a photo, video or file' },
                  { label: 'Quick replies', icon: Lightning, run: () => (pickerOpen ? setPickerOpen(false) : openPicker()), aria: 'Quick replies' },
                  ...(onSendSpecial && mode === 'reply'
                    ? SPECIAL_CHOICES.map((choice) => ({
                        label: choice.label,
                        icon: SPECIAL_ICONS[choice.kind],
                        run: () => setSpecial(choice.kind),
                        aria: choice.label,
                      }))
                    : []),
                ].map((item) => (
                  <li key={item.label} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      aria-label={item.aria}
                      onClick={() => {
                        setMenuOpen(false)
                        item.run()
                      }}
                      className="flex w-full items-center gap-3 px-3.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <item.icon size={18} className="shrink-0 text-slate-500" aria-hidden="true" />
                      {item.label}
                    </button>
                  </li>
                ))}
                {followUpControl && (
                  <li role="none" className="flex items-center gap-3 px-3.5 py-1.5 text-sm text-slate-700">
                    {followUpControl}
                    Follow up
                  </li>
                )}
              </ul>
            )}
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
            data-emoji-toggle
            onClick={() => setEmojiOpen((open) => !open)}
            aria-label="Add an emoji"
            aria-expanded={emojiOpen}
            title="Add an emoji"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            <Smiley size={20} />
          </button>
          {emojiOpen && <EmojiPicker onPick={addEmoji} onClose={() => setEmojiOpen(false)} />}
          <div className="relative min-w-0 flex-1">
          {showSuggestion && aiSuggestion ? (
            <div
              role="button"
              tabIndex={0}
              aria-label="Use the suggested reply"
              title="Click to use this reply"
              onClick={useSuggestion}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === 'Tab') {
                  event.preventDefault()
                  useSuggestion()
                } else if (event.key === 'Escape') {
                  onAiDismiss?.()
                }
              }}
              className="min-h-[36px] w-full cursor-pointer whitespace-pre-wrap py-2 pl-1 pr-8 text-sm leading-5 text-slate-400 outline-none"
            >
              {aiSuggestion.text}
            </div>
          ) : (
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
              if (mode === 'reply' && event.target.value.trim()) {
                onTyping?.()
              }
            }}
            onKeyDown={(event) => handleEnter(event, text, setText)}
            onPaste={(event) => {
              if (event.clipboardData.files.length > 0) {
                addFiles(event.clipboardData.files)
              }
            }}
            placeholder={mode === 'note' ? 'Write a note for your team' : 'Write a message'}
            aria-label={mode === 'note' ? 'Private note' : 'Message to parent'}
            className="max-h-40 min-h-[36px] w-full resize-none bg-transparent py-2 pl-1 pr-1 text-sm leading-5 outline-none"
          />
          )}
          {showSuggestion && (
            <button
              type="button"
              onClick={onAiDismiss}
              aria-label="Dismiss the suggested reply"
              title="Dismiss"
              className="absolute right-0 top-2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={14} />
            </button>
          )}
          </div>
          {showMic ? (
            <button
              type="button"
              onClick={() => void voice.start()}
              aria-label="Record a voice message"
              title="Record a voice message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <Microphone size={20} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={isLoadingMedia}
              aria-label={mode === 'note' ? 'Save note' : 'Send'}
              title={mode === 'note' ? 'Save note' : 'Send'}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fc0c97] text-white transition hover:bg-[#e00a87] disabled:opacity-60"
            >
              <PaperPlaneTilt size={18} weight="fill" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {special && onSendSpecial && <SpecialMessageDialog kind={special} onClose={() => setSpecial(null)} onSend={onSendSpecial} />}
      {isLoadingMedia && <p className="mt-2 text-xs text-slate-500">Loading the photo or video...</p>}
      {(hint || voice.error) &&<p className="mt-2 text-xs text-red-600">{hint ?? voice.error}</p>}
      {showSuggestion && (
        <p className="mt-1.5 text-[11px] text-slate-500">
          <Sparkle size={11} weight="fill" className="mr-1 inline text-[#fc0c97]" aria-hidden="true" />
          AI suggestion: click the grey text to use it, then check it before you send.
          {aiSuggestion?.note ? <span className="ml-1 font-semibold text-amber-700">{aiSuggestion.note}</span> : null}
        </p>
      )}
      {aiSkipNote && !aiError && !showSuggestion && text === '' && mode === 'reply' && (
        <p className="mt-1.5 text-[11px] text-slate-500">AI wrote no reply: {aiSkipNote}</p>
      )}
      {aiError && !showSuggestion && text === '' && mode === 'reply' && (
        <p className="mt-1.5 text-[11px] text-slate-500">{aiError}</p>
      )}
    </div>
  )
}
