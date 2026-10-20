import { useEffect, useRef, useState } from 'react'
import { CaretDown, Check } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import type { ChatSwitchOption } from '../../lib/chatSwitch'
import { formatListTime } from '../../lib/whatsappInbox'
import { ChannelIcon } from '../LeadChannelLines'

const pill =
  'ml-auto inline-flex min-w-0 max-w-[60%] items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-sky-100'

// "Sending from …" above the reply box. When the family has more than one chat (another WhatsApp number,
// Messenger, Instagram, a child's own number), it opens a list of them: picking one opens that chat, so the reply
// goes out from there.
export function ChatSwitcher({
  label,
  options,
  onPick,
}: {
  label: string
  options: ChatSwitchOption[]
  onPick: (option: ChatSwitchOption) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const words = (
    <>
      <span className="shrink-0 text-sky-600 max-sm:hidden">Sending from</span>
      <span className="truncate">{label}</span>
    </>
  )

  if (options.length < 2) {
    return (
      <span title="This reply goes out from here" className={pill}>
        {words}
      </span>
    )
  }

  return (
    <div ref={box} className="relative ml-auto flex min-w-0 max-w-[60%] justify-end">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch to another chat of this family"
        onClick={() => setOpen(!open)}
        // The phone layout gives every button 40px; this pill stays its own height.
        className={cn(pill, 'ml-0 max-w-full min-h-0! cursor-pointer hover:bg-sky-100')}
      >
        {words}
        <CaretDown size={11} weight="bold" className="shrink-0" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Chats of this family"
          className="absolute bottom-full right-0 z-40 mb-1.5 w-96 max-w-[calc(100vw-24px)] rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Reply from
          </p>
          <ul className="max-h-72 overflow-y-auto">
            {options.map((option) => (
              <li key={option.key}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={option.current}
                  onClick={() => {
                    setOpen(false)
                    if (!option.current) onPick(option)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-50',
                    option.current && 'bg-sky-50/70',
                  )}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100">
                    <ChannelIcon kind={option.kind} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{option.account}</span>
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                      {option.isChild && (
                        <span className="shrink-0 rounded-full bg-sky-50 px-1.5 text-[10px] font-semibold text-sky-700">
                          Child
                        </span>
                      )}
                      <span className="truncate">{option.isChild ? option.who?.replace(/^Child\s*/, '') : option.who}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {option.lastAt ? formatListTime(option.lastAt) : ''}
                  </span>
                  <span className="flex w-4 shrink-0 justify-center">
                    {option.current && <Check size={14} weight="bold" className="text-[#fc0c97]" aria-label="Open now" />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
