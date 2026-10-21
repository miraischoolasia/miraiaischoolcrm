import { useState } from 'react'
import { QrCode, UsersThree, WarningOctagon, X } from '@phosphor-icons/react'
import { ModalShell } from './ModalShell'
import { LinkWhatsAppPanel } from './whatsapp/LinkWhatsAppPanel'
import { alertLevel, alertWords, type ChannelAlert } from '../lib/channelAlerts'
import { cn } from '../lib/cn'
import type { WaConnect } from '../lib/waConnect'

const HIDE_MS = 60 * 60_000
const HIDDEN_KEY = 'channel-alerts-hidden'
// More than this many at once: the rest are counted, not listed.
const SHOWN = 3

// Red: the number cannot work until someone acts. Amber: it may be fine, but someone should look.
const LOOK = {
  danger: { box: 'border-red-700 bg-red-600 text-white', soft: 'text-red-50', faint: 'text-red-100', button: 'text-red-700 hover:bg-red-50', hide: 'border-white/40 text-white hover:bg-white/10' },
  warning: { box: 'border-amber-500 bg-amber-300 text-amber-950', soft: 'text-amber-900', faint: 'text-amber-800', button: 'text-amber-900 hover:bg-amber-50', hide: 'border-amber-700/40 text-amber-950 hover:bg-amber-200' },
}

function readHidden(): Record<string, number> {
  try {
    const value = JSON.parse(window.localStorage.getItem(HIDDEN_KEY) ?? '{}') as Record<string, number>
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function writeHidden(hidden: Record<string, number>) {
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden))
  } catch {
    // Without storage, "Hide for 1 hour" lasts until the page is opened again.
  }
}

// The red bar on top of Today and the Inbox: each channel that stopped working, what happened, what to do next,
// and (for an admin, when scanning helps) a button that opens that number's QR code. Any channel kind can be
// listed (src/lib/channelAlerts.ts); hiding one lasts an hour, or until the problem changes.
export function ChannelAlertBar({
  alerts,
  isAdmin,
  apiUrl,
  connect,
  onOpenChannelAccess,
  now = Date.now(),
}: {
  alerts: ChannelAlert[]
  isAdmin: boolean
  // The WhatsApp gateway, for the QR code; without it the button is not offered.
  apiUrl?: string
  // The gateway answered by the demo and the tests.
  connect?: WaConnect
  // Opens My Team, Teams, Inbox channels (for a locked channel nobody is given).
  onOpenChannelAccess?: () => void
  now?: number
}) {
  const [hidden, setHidden] = useState(readHidden)
  const [fixing, setFixing] = useState<ChannelAlert | null>(null)

  const shown = alerts.filter((alert) => !(hidden[alert.key] && hidden[alert.key] > now))
  if (shown.length === 0 && !fixing) {
    return null
  }

  function hide(alert: ChannelAlert) {
    const next = Object.fromEntries(Object.entries({ ...hidden, [alert.key]: Date.now() + HIDE_MS }).filter(([, until]) => until > Date.now()))
    setHidden(next)
    writeHidden(next)
  }

  return (
    <>
      {shown.length > 0 && (
        <section role="alert" aria-label="Channels that need attention" className="space-y-2">
          {shown.slice(0, SHOWN).map((alert) => {
            const words = alertWords(alert, now)
            const canScan = isAdmin && words.scanFixes && alert.channel === 'whatsapp' && Boolean(apiUrl) && Boolean(alert.instance)
            const look = LOOK[alertLevel(alert.problem)]
            return (
              <div
                key={alert.key}
                className={cn('flex flex-col gap-3 rounded-2xl border px-4 py-3 shadow-sm sm:flex-row sm:items-start', look.box)}
              >
                <WarningOctagon size={26} weight="fill" className="shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-heading text-base font-bold leading-snug">{words.title}</p>
                  <p className={cn('text-sm', look.soft)}>{words.what}</p>
                  <p className="text-sm">
                    <span className="font-semibold">Next step: </span>
                    {words.next}
                  </p>
                  {!isAdmin && words.scanFixes && (
                    <p className="text-sm font-semibold">Only an admin can scan the QR code. Please tell an admin now.</p>
                  )}
                  {isAdmin && alert.detail && <p className={cn('text-xs', look.faint)}>Server says: {alert.detail}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {isAdmin && alert.problem === 'nobody_given' && onOpenChannelAccess && (
                    <button
                      type="button"
                      onClick={onOpenChannelAccess}
                      className={cn('inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold shadow-sm transition', look.button)}
                    >
                      <UsersThree size={18} weight="bold" aria-hidden="true" />
                      Open Inbox channels
                    </button>
                  )}
                  {canScan && (
                    <button
                      type="button"
                      onClick={() => setFixing(alert)}
                      className={cn('inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold shadow-sm transition', look.button)}
                    >
                      <QrCode size={18} weight="bold" aria-hidden="true" />
                      Scan QR code
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => hide(alert)}
                    className={cn('rounded-xl border px-3 py-2 text-xs font-semibold transition', look.hide)}
                  >
                    Hide for 1 hour
                  </button>
                </div>
              </div>
            )
          })}
          {shown.length > SHOWN && (
            <p className="text-sm font-semibold text-red-700">
              And {shown.length - SHOWN} more channel{shown.length - SHOWN === 1 ? '' : 's'} need attention.
            </p>
          )}
        </section>
      )}
      {fixing && apiUrl && (
        <ModalShell maxWidth="sm" onClose={() => setFixing(null)}>
          <div className="space-y-4 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Link the phone again</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">{fixing.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setFixing(null)}
                aria-label="Close"
                className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
              <li>Have this number's phone in your hand.</li>
              <li>In WhatsApp, open Settings, then Linked devices, then Link a device.</li>
              <li>Press the button below and scan the code within 2 minutes.</li>
            </ol>
            <LinkWhatsAppPanel apiUrl={apiUrl} connect={connect} instance={fixing.instance ?? null} title={fixing.name} />
          </div>
        </ModalShell>
      )}
    </>
  )
}
