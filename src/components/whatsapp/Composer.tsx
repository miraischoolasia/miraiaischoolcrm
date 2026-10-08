import { useEffect, useRef, useState } from 'react'
import { Microphone, PaperPlaneTilt, Paperclip, Trash, X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder'
import type { SendInput } from '../../hooks/useWhatsAppInbox'

type ComposerProps = {
  onSend: (input: SendInput) => Promise<boolean>
}

function formatSeconds(total: number) {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const isTouchDevice = () => window.matchMedia?.('(pointer: coarse)').matches ?? false

export function Composer({ onSend }: ComposerProps) {
  const [mode, setMode] = useState<'reply' | 'note'>('reply')
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [hint, setHint] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const voice = useVoiceRecorder()
  const sendVoiceWhenReady = useRef(false)

  // A voice message goes out the moment the recording stops.
  const { state: voiceState, file: voiceFile, discard: discardVoice } = voice
  useEffect(() => {
    if (voiceState === 'ready' && voiceFile && sendVoiceWhenReady.current) {
      sendVoiceWhenReady.current = false
      void onSend({ content: '', isPrivate: mode === 'note', files: [voiceFile] }).then(() => discardVoice())
    }
  }, [voiceState, voiceFile, discardVoice, onSend, mode])

  function addFiles(list: FileList | File[]) {
    setFiles((current) => [...current, ...Array.from(list)])
    setHint(null)
  }

  async function submit() {
    if (voice.state === 'recording') {
      setHint('Send or cancel the voice message first.')
      return
    }
    if (!text.trim() && files.length === 0) {
      setHint('Write a message or attach something first.')
      return
    }
    const sent = await onSend({ content: text.trim(), isPrivate: mode === 'note', files })
    if (sent) {
      setText('')
      setFiles([])
      setHint(null)
    }
  }

  function insertNewLine(element: HTMLTextAreaElement) {
    const start = element.selectionStart
    const end = element.selectionEnd
    setText(`${text.slice(0, start)}\n${text.slice(end)}`)
    window.requestAnimationFrame(() => element.setSelectionRange(start + 1, start + 1))
  }

  return (
    <div className="border-t border-slate-200 bg-white px-3 py-3 sm:px-4">
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
            className="rounded-lg border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"
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
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            rows={1}
            onChange={(event) => {
              setText(event.target.value)
              setHint(null)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
                return
              }
              if (event.ctrlKey || event.metaKey || event.shiftKey) {
                event.preventDefault()
                insertNewLine(event.currentTarget)
              } else if (!isTouchDevice()) {
                event.preventDefault()
                void submit()
              }
            }}
            onPaste={(event) => {
              if (event.clipboardData.files.length > 0) {
                addFiles(event.clipboardData.files)
              }
            }}
            placeholder={mode === 'note' ? 'Write a note for your team' : 'Write a message'}
            aria-label={mode === 'note' ? 'Private note' : 'Message to parent'}
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#fc0c97]"
          />
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
            onClick={() => fileInput.current?.click()}
            aria-label="Attach a photo, video or file"
            title="Attach a photo, video or file"
            className="rounded-lg border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"
          >
            <Paperclip size={18} />
          </button>
          <button
            type="button"
            onClick={() => void voice.start()}
            aria-label="Record a voice message"
            title="Record a voice message"
            className="rounded-lg border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"
          >
            <Microphone size={18} />
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#fc0c97] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e00a87]"
          >
            <PaperPlaneTilt size={16} weight="fill" aria-hidden="true" />
            {mode === 'note' ? 'Save note' : 'Send'}
          </button>
        </div>
      )}

      {(hint || voice.error) && <p className="mt-2 text-xs text-red-600">{hint ?? voice.error}</p>}
      {voice.state !== 'recording' && (
        <p className="mt-1.5 hidden text-[11px] text-slate-400 sm:block">Enter to send. Ctrl+Enter for a new line.</p>
      )}
    </div>
  )
}
