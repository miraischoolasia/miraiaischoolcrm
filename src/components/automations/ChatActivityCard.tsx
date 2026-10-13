import { useState } from 'react'
import { ArrowsClockwise, CaretDown, CaretUp, Copy } from '@phosphor-icons/react'
import { chatWebhookAddress, describeAgo, isWebhookRecent, type ChatWebhookInfo } from '../../lib/chatActivity'
import { cn } from '../../lib/cn'

type ChatActivityCardProps = {
  info: ChatWebhookInfo | null
  loadError: string | null
  isLoading: boolean
  onReload: () => void
}

// Where the admin connects the WhatsApp inbox to the CRM, once, so a flow can start from "a parent has
// not replied" or "a parent is waiting for a reply". Shows whether messages are arriving.
export function ChatActivityCard({ info, loadError, isLoading, onReload }: ChatActivityCardProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null)

  const address = info ? chatWebhookAddress(info.key) : ''
  const recent = info ? isWebhookRecent(info.lastReceivedAt) : false

  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
      setCopied('done')
    } catch {
      setCopied('failed')
    }
  }

  const status = loadError
    ? 'Not available'
    : !info
      ? isLoading
        ? 'Loading…'
        : '…'
      : info.lastReceivedAt === null
        ? 'Not connected yet'
        : `Last message ${describeAgo(info.lastReceivedAt)}`

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="flex-1 text-sm font-semibold text-slate-900">
          Parent replies
          <span
            className={cn(
              'ml-2 font-normal',
              info && recent ? 'text-emerald-700' : info?.lastReceivedAt === null ? 'text-amber-700' : 'text-slate-500',
            )}
          >
            {status}
          </span>
        </span>
        <span className="hidden text-xs text-slate-500 sm:inline">So a flow can act when a parent has not replied</span>
        {open ? <CaretUp size={14} aria-hidden="true" /> : <CaretDown size={14} aria-hidden="true" />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-700">
          {loadError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
              {loadError}
            </p>
          )}

          {info && (
            <>
              <p>
                {info.lastReceivedAt === null
                  ? 'No message has arrived yet. Connect the WhatsApp inbox once with the steps below.'
                  : `Connected: ${info.chats} chat${info.chats === 1 ? '' : 's'} known, the last message arrived ${describeAgo(info.lastReceivedAt)}.`}
              </p>

              <ol className="list-decimal space-y-1 pl-5 text-slate-600">
                <li>Copy the address below.</li>
                <li>
                  In the WhatsApp inbox (Chatwoot) open <strong>Settings → Integrations → Webhooks</strong> and add a
                  webhook.
                </li>
                <li>
                  Paste the address, tick only <strong>Message created</strong>, and save.
                </li>
                <li>Come back here: this line shows the time of the next message that arrives.</li>
              </ol>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  readOnly
                  value={address}
                  aria-label="Webhook address"
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700"
                />
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="flex items-center gap-1 rounded-xl bg-[#fc0c97] px-3 py-2 text-sm font-semibold text-white hover:bg-[#de0a84]"
                >
                  <Copy size={14} aria-hidden="true" />
                  Copy
                </button>
                <button
                  type="button"
                  onClick={onReload}
                  disabled={isLoading}
                  className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <ArrowsClockwise size={14} aria-hidden="true" />
                  Check again
                </button>
              </div>
              {copied === 'done' && (
                <p role="status" className="text-xs text-emerald-700">
                  Copied.
                </p>
              )}
              {copied === 'failed' && (
                <p role="status" className="text-xs text-amber-700">
                  Could not copy. Select the address above and copy it by hand.
                </p>
              )}

              <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
                <li>The address works like a password: do not share it. Messages are counted from the moment it is connected.</li>
                <li>
                  Only chats tied to a lead or a student count. Add a <strong>Lead stage</strong> check to the flow so
                  it only acts on open leads, not on families who simply did not answer a reminder.
                </li>
                <li>If the parent answers (or the team does), a message still waiting for approval is skipped.</li>
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  )
}
